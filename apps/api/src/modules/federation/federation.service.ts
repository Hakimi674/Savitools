import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  BadGatewayException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as smolToml from 'smol-toml';
import { assertPublicHostname, MAX_SAFE_REDIRECTS } from '../../common/ssrf-guard';
import { isStellarPublicKey } from '../../common/stellar-address';

const FETCH_TIMEOUT = 15_000;
export const DEFAULT_FEDERATION_PROBE_TIMEOUT_MS = 3_000;
export const DEFAULT_FEDERATION_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_FEDERATION_TOML_CACHE_TTL_MS = 5 * 60_000;
export const DEFAULT_FEDERATION_TOML_CACHE_MAX_ENTRIES = 200;

// ─── TOML input bounds (Savitura/Savitools#220) ──────────────────────────────
/** Maximum stellar.toml response size accepted before parsing. */
export const TOML_MAX_BYTES = 512 * 1024;
/** Maximum nesting depth of the parsed document. */
export const TOML_MAX_DEPTH = 64;
/** Hard cap on keys produced by a single document. */
export const TOML_MAX_KEYS = 10_000;

function isFederationAddress(input: string): boolean {
  return /^[^\s*]+[*][^\s*]+\.[^\s*]+$/.test(input);
}

function isDomain(input: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(
    input,
  );
}

function stripProtocol(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function normalizeDomain(domain: string): string {
  return stripProtocol(domain.trim()).replace(/\.$/, '').toLowerCase();
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class RequestTimeoutError extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'RequestTimeoutError';
  }
}

export interface FederationResolveResult {
  stellarAddress: string | null;
  federationAddress: string | null;
  memo: string | null;
  memoType: string | null;
  homeDomain: string | null;
}

export interface TomlAccount {
  PUBLIC_KEY: string;
  NAME?: string;
  HOME_DOMAIN?: string;
  DESCRIPTION?: string;
}

export interface TomlCurrency {
  code: string;
  issuer: string;
  display_decimals?: number;
  name?: string;
  desc?: string;
  conditions?: string;
  image?: string;
  anchor_asset_type?: string;
  anchor_asset?: string;
  redemption_instructions?: string;
  collateral_addresses?: string;
  regulated?: boolean;
  approval_server?: string;
  approval_criteria?: string;
}

export interface TomlValidator {
  PUBLIC_KEY: string;
  NAME?: string;
  HOST?: string;
  HISTORY_URL?: string;
}

export interface TomlDocumentation {
  PRINCIPALS_NAME?: string;
  PRINCIPAL_EMAIL?: string;
  PROJECT_URL?: string;
  OFFICIAL_CHAT?: string;
  OTHER_INFO?: string;
}

export interface TomlResult {
  version: string | null;
  networkPassphrase: string | null;
  federationServer: string | null;
  transferServer: string | null;
  transferServerSep0024: string | null;
  webAuthEndpoint: string | null;
  directPaymentServer: string | null;
  accounts: TomlAccount[];
  currencies: TomlCurrency[];
  validators: TomlValidator[];
  documentation: TomlDocumentation | null;
  fetchLatencyMs: number;
  validationWarnings: string[];
}

export interface SepInfo {
  number: number;
  name: string;
  supported: boolean;
  endpoint: string | null;
  probeStatus: 'green' | 'yellow' | 'red' | 'none' | 'timeout';
}

export interface SepResult {
  seps: SepInfo[];
  /** Additive TOML state so an unavailable or malformed document is not hidden. */
  tomlStatus?: 'available' | 'unavailable' | 'malformed';
}

interface CachedToml {
  parsed: Record<string, unknown>;
  fetchLatencyMs: number;
  expiresAt: number;
}

// ─── Transfer request links (Savitura/Savitools#217) ────────────────────────

export type TransferRequestSep = '6' | '24' | '31';

export interface TransferLinkParams {
  sep: TransferRequestSep;
  asset: string;
  amount: string;
  memo?: string;
  callback?: string;
  account?: string;
  type?: 'deposit' | 'withdraw';
}

export interface TransferLinkResult {
  sep: TransferRequestSep;
  endpoint: string;
  url: string;
  asset: string;
  amount: string;
  warning: string;
}

/** Decimal string only — never routed through Number to avoid float conversion. */
const DECIMAL_STRING_RE = /^\d+(\.\d+)?$/;
const HTTPS_URL_RE = /^https:\/\/[^\s]+$/i;

const REQUIRED_TOML_FIELDS = ['ACCOUNTS'] as const;

/**
 * Bounded TOML parsing for remote stellar.toml content (Savitura/Savitools#220).
 *
 * smol-toml is a maintained parser without prototype-pollution or
 * uncontrolled-recursion behavior; the guards here cap input size, nesting
 * depth, and allocation before any parsed data is returned.
 */
function measureDepth(value: unknown, depth = 0): number {
  if (depth > TOML_MAX_DEPTH) return depth;
  if (Array.isArray(value)) {
    let max = depth;
    for (const item of value) max = Math.max(max, measureDepth(item, depth + 1));
    return max;
  }
  if (value && typeof value === 'object') {
    let max = depth;
    for (const item of Object.values(value)) max = Math.max(max, measureDepth(item, depth + 1));
    return max;
  }
  return depth;
}

function countKeys(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + countKeys(item), 0);
  }
  let count = 0;
  for (const item of Object.values(value)) count += 1 + countKeys(item);
  return count;
}

function parseBoundedToml(raw: string): Record<string, unknown> {
  if (Buffer.byteLength(raw, 'utf8') > TOML_MAX_BYTES) {
    throw new PayloadTooLargeException(
      `stellar.toml exceeds the maximum accepted size of ${TOML_MAX_BYTES} bytes`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = smolToml.parse(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown parse error';
    throw new BadRequestException(`Malformed TOML document: ${msg}`);
  }

  const depth = measureDepth(parsed);
  if (depth >= TOML_MAX_DEPTH) {
    throw new BadRequestException(
      `TOML document nesting depth exceeds the limit of ${TOML_MAX_DEPTH}`,
    );
  }

  if (countKeys(parsed) > TOML_MAX_KEYS) {
    throw new BadRequestException(
      `TOML document exceeds the maximum of ${TOML_MAX_KEYS} keys`,
    );
  }

  return parsed;
}

@Injectable()
export class FederationService {
  private readonly logger = new Logger(FederationService.name);
  private readonly tomlCache = new Map<string, CachedToml>();
  private readonly tomlInFlight = new Map<string, Promise<CachedToml>>();

  constructor(private readonly configService?: ConfigService) {}

  private get probeTimeoutMs(): number {
    return positiveInteger(
      this.configService?.get('FEDERATION_PROBE_TIMEOUT_MS'),
      DEFAULT_FEDERATION_PROBE_TIMEOUT_MS,
    );
  }

  private get requestTimeoutMs(): number {
    return positiveInteger(
      this.configService?.get('FEDERATION_REQUEST_TIMEOUT_MS'),
      DEFAULT_FEDERATION_REQUEST_TIMEOUT_MS,
    );
  }

  private get tomlCacheTtlMs(): number {
    return positiveInteger(
      this.configService?.get('FEDERATION_TOML_CACHE_TTL_MS'),
      DEFAULT_FEDERATION_TOML_CACHE_TTL_MS,
    );
  }

  private get tomlCacheMaxEntries(): number {
    return positiveInteger(
      this.configService?.get('FEDERATION_TOML_CACHE_MAX_ENTRIES'),
      DEFAULT_FEDERATION_TOML_CACHE_MAX_ENTRIES,
    );
  }

  private async fetchWithTimeout(
    urlStr: string,
    timeout = FETCH_TIMEOUT,
    parentSignal?: AbortSignal,
  ): Promise<Response> {
    let target = new URL(urlStr);
    
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      throw new BadRequestException(`Unsupported protocol: ${target.protocol}`);
    }

    await assertPublicHostname(target.hostname);

    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort!: (reason: Error) => void;
    const abortPromise = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      rejectAbort(new RequestTimeoutError());
    }, timeout);
    const abortForParent = () => {
      controller.abort();
      rejectAbort(new RequestTimeoutError());
    };
    parentSignal?.addEventListener('abort', abortForParent, { once: true });
    if (parentSignal?.aborted) abortForParent();

    const requestInit = {
      signal: controller.signal,
      headers: { Accept: '*/*' },
      redirect: 'manual' as const,
    };
    try {
      let response = await Promise.race([
        fetch(target.toString(), requestInit),
        abortPromise,
      ]);
      let hops = 0;

      while ([301, 302, 303, 307, 308].includes(response.status) && response.headers.has('location')) {
        if (++hops > MAX_SAFE_REDIRECTS) {
          throw new BadGatewayException('Too many redirects');
        }
        target = new URL(response.headers.get('location')!, target);
        if (target.protocol !== 'https:' && target.protocol !== 'http:') {
          throw new BadRequestException(`Unsupported protocol in redirect: ${target.protocol}`);
        }
        await assertPublicHostname(target.hostname);
        response = await Promise.race([
          fetch(target.toString(), requestInit),
          abortPromise,
        ]);
      }
      return response;
    } catch (error) {
      if (timedOut || parentSignal?.aborted) throw new RequestTimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abortForParent);
    }
  }

  private extractHomeDomain(
    federationRecord: Record<string, unknown>,
  ): string | null {
    const domain = federationRecord.home_domain;
    if (typeof domain === 'string') return domain;
    return null;
  }

  private async awaitWithinDeadline<T>(
    promise: Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new RequestTimeoutError());
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }

  // ─── GET /federation/resolve ────────────────────────────────────────────

  async resolveFederation(
    address: string,
  ): Promise<FederationResolveResult> {
    const input = address.trim();

    if (isStellarPublicKey(input)) {
      return this.reverseLookup(input);
    }

    if (isFederationAddress(input)) {
      return this.nameLookup(input);
    }

    const stripped = stripProtocol(input);
    if (isDomain(stripped)) {
      return this.domainLookup(stripped);
    }

    throw new BadRequestException(
      'Input must be a Stellar public key (G…), a federation address (user*domain), or a domain.',
    );
  }

  private async reverseLookup(
    publicKey: string,
  ): Promise<FederationResolveResult> {
    try {
      const url = `https://federation.stellar.org/federation?q=${encodeURIComponent(publicKey)}&type=id`;
      const res = await this.fetchWithTimeout(url);
      if (!res.ok) {
        throw new NotFoundException(
          `No federation record found for public key ${publicKey}`,
        );
      }
      const data = (await res.json()) as Record<string, unknown>;
      return {
        stellarAddress: publicKey,
        federationAddress: (data.stellar_address as string) ?? null,
        memo: (data.memo as string) ?? null,
        memoType: (data.memo_type as string) ?? null,
        homeDomain: this.extractHomeDomain(data),
      };
    } catch (err: unknown) {
      if (err instanceof NotFoundException) throw err;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      throw new BadRequestException(
        `Federation reverse lookup failed: ${msg}`,
      );
    }
  }

  private async nameLookup(
    federationAddress: string,
  ): Promise<FederationResolveResult> {
    try {
      const url = `https://federation.stellar.org/federation?q=${encodeURIComponent(federationAddress)}&type=name`;
      const res = await this.fetchWithTimeout(url);
      if (!res.ok) {
        throw new NotFoundException(
          `No federation record found for ${federationAddress}`,
        );
      }
      const data = (await res.json()) as Record<string, unknown>;
      return {
        stellarAddress: (data.stellar_address as string) ?? null,
        federationAddress,
        memo: (data.memo as string) ?? null,
        memoType: (data.memo_type as string) ?? null,
        homeDomain: this.extractHomeDomain(data),
      };
    } catch (err: unknown) {
      if (err instanceof NotFoundException) throw err;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      throw new BadRequestException(`Federation name lookup failed: ${msg}`);
    }
  }

  private async domainLookup(
    domain: string,
  ): Promise<FederationResolveResult> {
    const tomlData = await this.fetchToml(domain);
    if (!tomlData.FEDERATION_SERVER) {
      throw new NotFoundException(
        `Domain ${domain} does not declare a FEDERATION_SERVER in its stellar.toml`,
      );
    }

    return {
      stellarAddress: null,
      federationAddress: null,
      memo: null,
      memoType: null,
      homeDomain: domain,
    };
  }

  // ─── GET /federation/toml ───────────────────────────────────────────────

  async getToml(domain: string): Promise<TomlResult> {
    const cleanDomain = normalizeDomain(domain);
    if (!isDomain(cleanDomain)) {
      throw new BadRequestException(`Invalid domain: ${domain}`);
    }

    let toml: CachedToml;
    try {
      toml = await this.fetchTomlRecord(cleanDomain);
    } catch (err: unknown) {
      if (err instanceof NotFoundException || err instanceof BadRequestException || err instanceof PayloadTooLargeException) throw err;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      throw new BadRequestException(`Failed to fetch stellar.toml for ${cleanDomain}: ${msg}`);
    }
    const parsed = toml.parsed;

    const validationWarnings: string[] = [];
    for (const field of REQUIRED_TOML_FIELDS) {
      if (!parsed[field]) {
        validationWarnings.push(
          `Missing required SEP-1 field: ${field}`,
        );
      }
    }

    return {
      version: (parsed.VERSION as string) ?? null,
      networkPassphrase: (parsed.NETWORK_PASSPHRASE as string) ?? null,
      federationServer: (parsed.FEDERATION_SERVER as string) ?? null,
      transferServer: (parsed.TRANSFER_SERVER as string) ?? null,
      transferServerSep0024:
        (parsed.TRANSFER_SERVER_SEP0024 as string) ?? null,
      webAuthEndpoint: (parsed.WEB_AUTH_ENDPOINT as string) ?? null,
      directPaymentServer:
        (parsed.DIRECT_PAYMENT_SERVER as string) ?? null,
      accounts: Array.isArray(parsed.ACCOUNTS)
        ? (parsed.ACCOUNTS as Record<string, unknown>[]).map((a) => ({
            PUBLIC_KEY: String(a.PUBLIC_KEY ?? ''),
            NAME: a.NAME ? String(a.NAME) : undefined,
            HOME_DOMAIN: a.HOME_DOMAIN
              ? String(a.HOME_DOMAIN)
              : undefined,
            DESCRIPTION: a.DESCRIPTION
              ? String(a.DESCRIPTION)
              : undefined,
          }))
        : [],
      currencies: Array.isArray(parsed.CURRENCIES)
        ? (parsed.CURRENCIES as Record<string, unknown>[]).map((c) => ({
            code: String(c.CODE ?? ''),
            issuer: String(c.ISSUER ?? ''),
            display_decimals: c.DISPLAY_DECIMALS
              ? Number(c.DISPLAY_DECIMALS)
              : undefined,
            name: c.NAME ? String(c.NAME) : undefined,
            desc: c.DESC ? String(c.DESC) : undefined,
            conditions: c.CONDITIONS
              ? String(c.CONDITIONS)
              : undefined,
            image: c.IMAGE ? String(c.IMAGE) : undefined,
            anchor_asset_type: c.ANCHOR_ASSET_TYPE
              ? String(c.ANCHOR_ASSET_TYPE)
              : undefined,
            anchor_asset: c.ANCHOR_ASSET
              ? String(c.ANCHOR_ASSET)
              : undefined,
            redemption_instructions: c.REDEMPTION_INSTRUCTIONS
              ? String(c.REDEMPTION_INSTRUCTIONS)
              : undefined,
            collateral_addresses: c.COLLATERAL_ADDRESSES
              ? String(c.COLLATERAL_ADDRESSES)
              : undefined,
            regulated: c.REGULATED ? Boolean(c.REGULATED) : undefined,
            approval_server: c.APPROVAL_SERVER
              ? String(c.APPROVAL_SERVER)
              : undefined,
            approval_criteria: c.APPROVAL_CRITERIA
              ? String(c.APPROVAL_CRITERIA)
              : undefined,
          }))
        : [],
      validators: Array.isArray(parsed.VALIDATORS)
        ? (parsed.VALIDATORS as Record<string, unknown>[]).map((v) => ({
            PUBLIC_KEY: String(v.PUBLIC_KEY ?? ''),
            NAME: v.NAME ? String(v.NAME) : undefined,
            HOST: v.HOST ? String(v.HOST) : undefined,
            HISTORY_URL: v.HISTORY_URL
              ? String(v.HISTORY_URL)
              : undefined,
          }))
        : [],
      documentation: parsed.DOCUMENTATION
        ? {
            PRINCIPALS_NAME: (parsed.DOCUMENTATION as Record<string, unknown>)
              .PRINCIPALS_NAME
              ? String(
                  (parsed.DOCUMENTATION as Record<string, unknown>)
                    .PRINCIPALS_NAME,
                )
              : undefined,
            PRINCIPAL_EMAIL: (parsed.DOCUMENTATION as Record<string, unknown>)
              .PRINCIPAL_EMAIL
              ? String(
                  (parsed.DOCUMENTATION as Record<string, unknown>)
                    .PRINCIPAL_EMAIL,
                )
              : undefined,
            PROJECT_URL: (parsed.DOCUMENTATION as Record<string, unknown>)
              .PROJECT_URL
              ? String(
                  (parsed.DOCUMENTATION as Record<string, unknown>)
                    .PROJECT_URL,
                )
              : undefined,
            OFFICIAL_CHAT: (parsed.DOCUMENTATION as Record<string, unknown>)
              .OFFICIAL_CHAT
              ? String(
                  (parsed.DOCUMENTATION as Record<string, unknown>)
                    .OFFICIAL_CHAT,
                )
              : undefined,
            OTHER_INFO: (parsed.DOCUMENTATION as Record<string, unknown>)
              .OTHER_INFO
              ? String(
                  (parsed.DOCUMENTATION as Record<string, unknown>)
                    .OTHER_INFO,
                )
              : undefined,
          }
        : null,
      fetchLatencyMs: toml.fetchLatencyMs,
      validationWarnings,
    };
  }

  // ─── GET /federation/sep ────────────────────────────────────────────────

  async getSepSupport(domain: string): Promise<SepResult> {
    const cleanDomain = normalizeDomain(domain);
    if (!isDomain(cleanDomain)) {
      throw new BadRequestException(`Invalid domain: ${domain}`);
    }

    const deadlineController = new AbortController();
    const deadlineTimer = setTimeout(
      () => deadlineController.abort(),
      this.requestTimeoutMs,
    );
    let tomlData: Record<string, unknown>;
    try {
      // A request deadline must not cancel the shared TOML flight, because
      // other callers may still be awaiting the same cache miss.
      tomlData = await this.awaitWithinDeadline(
        this.fetchToml(cleanDomain),
        deadlineController.signal,
      );
    } catch (error) {
      clearTimeout(deadlineTimer);
      const malformed =
        error instanceof BadRequestException &&
        /Malformed TOML|TOML document/.test(error.message);
      return {
        seps: [
          {
            number: 1,
            name: 'stellar.toml',
            supported: false,
            endpoint: null,
            probeStatus: 'red',
          },
          {
            number: 6,
            name: 'Anchor API',
            supported: false,
            endpoint: null,
            probeStatus: 'red',
          },
          {
            number: 10,
            name: 'Stellar Web Authentication',
            supported: false,
            endpoint: null,
            probeStatus: 'red',
          },
          {
            number: 24,
            name: 'Interactive Anchor API',
            supported: false,
            endpoint: null,
            probeStatus: 'red',
          },
          {
            number: 31,
            name: 'Direct Payments',
            supported: false,
            endpoint: null,
            probeStatus: 'red',
          },
        ],
        tomlStatus: malformed ? 'malformed' : 'unavailable',
      };
    }

    const sep1: SepInfo = {
      number: 1,
      name: 'stellar.toml',
      supported: true,
      endpoint: `https://${cleanDomain}/.well-known/stellar.toml`,
      probeStatus: 'green',
    };

    const transferServer = tomlData.TRANSFER_SERVER as string | undefined;
    const sep6 = transferServer
      ? this.probeEndpoint(transferServer, '/info', deadlineController.signal).then((probeStatus): SepInfo => ({
        number: 6,
        name: 'Anchor API',
        supported: true,
        endpoint: transferServer,
        probeStatus,
      }))
      : Promise.resolve<SepInfo>({
        number: 6,
        name: 'Anchor API',
        supported: false,
        endpoint: null,
        probeStatus: 'red',
      });

    const webAuthEndpoint = tomlData.WEB_AUTH_ENDPOINT as string | undefined;
    const sep10 = webAuthEndpoint
      ? this.probeEndpoint(webAuthEndpoint, '/web_auth', deadlineController.signal).then((probeStatus): SepInfo => ({
        number: 10,
        name: 'Stellar Web Authentication',
        supported: true,
        endpoint: webAuthEndpoint,
        probeStatus,
      }))
      : Promise.resolve<SepInfo>({
        number: 10,
        name: 'Stellar Web Authentication',
        supported: false,
        endpoint: null,
        probeStatus: 'red',
      });

    const transferServerSep0024 = tomlData.TRANSFER_SERVER_SEP0024 as
      | string
      | undefined;
    const sep24: SepInfo = transferServerSep0024
      ? {
        number: 24,
        name: 'Interactive Anchor API',
        supported: true,
        endpoint: transferServerSep0024,
        probeStatus: 'green',
      }
      : {
        number: 24,
        name: 'Interactive Anchor API',
        supported: false,
        endpoint: null,
        probeStatus: 'red',
      };

    const directPaymentServer = tomlData.DIRECT_PAYMENT_SERVER as
      | string
      | undefined;
    const sep31: SepInfo = directPaymentServer
      ? {
        number: 31,
        name: 'Direct Payments',
        supported: true,
        endpoint: directPaymentServer,
        probeStatus: 'green',
      }
      : {
        number: 31,
        name: 'Direct Payments',
        supported: false,
        endpoint: null,
        probeStatus: 'red',
      };

    try {
      const [resolvedSep6, resolvedSep10] = await Promise.all([sep6, sep10]);
      return { seps: [sep1, resolvedSep6, resolvedSep10, sep24, sep31], tomlStatus: 'available' };
    } finally {
      clearTimeout(deadlineTimer);
    }
  }

  // ─── GET /federation/link-preview (Savitura/Savitools#217) ───────────────

  /**
   * Build a standards-aware anchor transfer request link from stellar.toml.
   * The returned URL is copy-only: SaviTools never signs or submits it.
   */
  async buildTransferRequestLink(
    domain: string,
    params: TransferLinkParams,
  ): Promise<TransferLinkResult> {
    const cleanDomain = normalizeDomain(domain);
    if (!isDomain(cleanDomain)) {
      throw new BadRequestException(`Invalid domain: ${domain}`);
    }

    // Amounts and memos stay strings end-to-end — no floating-point conversion.
    if (!DECIMAL_STRING_RE.test(params.amount)) {
      throw new BadRequestException(
        'amount must be a non-negative decimal string (e.g. "100.50")',
      );
    }

    if (params.callback && !HTTPS_URL_RE.test(params.callback)) {
      throw new BadRequestException(
        'callback must be a well-formed https:// URL',
      );
    }

    if (params.sep !== '31' && !params.account) {
      throw new BadRequestException(
        `account (Stellar public key G…) is required for SEP-${params.sep} request links`,
      );
    }
    if (params.account && !isStellarPublicKey(params.account)) {
      throw new BadRequestException('account must be a Stellar public key (G…)');
    }

    const tomlData = await this.fetchToml(cleanDomain);

    const endpointBySep: Record<TransferRequestSep, string | undefined> = {
      '6': (tomlData.TRANSFER_SERVER as string | undefined) ?? undefined,
      '24': (tomlData.TRANSFER_SERVER_SEP0024 as string | undefined) ?? undefined,
      '31': (tomlData.DIRECT_PAYMENT_SERVER as string | undefined) ?? undefined,
    };
    const endpoint = endpointBySep[params.sep];
    if (!endpoint) {
      throw new BadRequestException(
        `Domain ${cleanDomain} does not declare a ` +
          `${params.sep === '6' ? 'TRANSFER_SERVER' : params.sep === '24' ? 'TRANSFER_SERVER_SEP0024' : 'DIRECT_PAYMENT_SERVER'} ` +
          `endpoint in its stellar.toml, so SEP-${params.sep} request links are unavailable`,
      );
    }

    const currencies = Array.isArray(tomlData.CURRENCIES)
      ? (tomlData.CURRENCIES as Record<string, unknown>[])
      : [];
    const supportedCodes = new Set(
      currencies.map((c) => String(c.CODE ?? '').toUpperCase()),
    );
    if (!supportedCodes.has(params.asset.toUpperCase())) {
      throw new BadRequestException(
        `Asset '${params.asset}' is not supported by ${cleanDomain}. Supported assets: ` +
          `${[...supportedCodes].join(', ') || '(none declared)'}`,
      );
    }

    const base = endpoint.replace(/\/$/, '');
    let url: string;
    switch (params.sep) {
      case '6': {
        const flow = params.type === 'withdraw' ? 'withdraw' : 'deposit';
        const query = new URLSearchParams({
          type: flow,
          asset_code: params.asset,
          account: params.account as string,
          amount: params.amount,
        });
        if (params.memo !== undefined) {
          query.set('memo', params.memo);
          query.set('memo_type', 'text');
        }
        if (params.callback) query.set('callback', params.callback);
        url = `${base}/transactions?${query.toString()}`;
        break;
      }
      case '24': {
        const query = new URLSearchParams({
          asset_code: params.asset,
          amount: params.amount,
          account: params.account as string,
        });
        if (params.memo !== undefined) query.set('memo', params.memo);
        if (params.callback) query.set('callback', params.callback);
        url = `${base}/?${query.toString()}`;
        break;
      }
      case '31': {
        const query = new URLSearchParams({
          asset_code: params.asset,
          amount: params.amount,
        });
        if (params.account) query.set('account', params.account);
        if (params.callback) query.set('destination', params.callback);
        if (params.memo !== undefined) query.set('memo', params.memo);
        url = `${base}/?${query.toString()}`;
        break;
      }
    }

    return {
      sep: params.sep,
      endpoint: base,
      url,
      asset: params.asset,
      amount: params.amount,
      warning:
        'Preview only: SaviTools will not sign or submit this request. Open the link yourself after reviewing the anchor.',
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async fetchToml(
    domain: string,
  ): Promise<Record<string, unknown>> {
    return (await this.fetchTomlRecord(domain)).parsed;
  }

  private async fetchTomlRecord(domain: string): Promise<CachedToml> {
    const key = normalizeDomain(domain);
    const cached = this.tomlCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      // Refresh insertion order so eviction remains least-recently-used.
      this.tomlCache.delete(key);
      this.tomlCache.set(key, cached);
      return cached;
    }
    if (cached) this.tomlCache.delete(key);

    const inFlight = this.tomlInFlight.get(key);
    if (inFlight) return inFlight;

    const request = this.fetchAndCacheToml(key);
    this.tomlInFlight.set(key, request);
    try {
      return await request;
    } finally {
      this.tomlInFlight.delete(key);
    }
  }

  private async fetchAndCacheToml(domain: string): Promise<CachedToml> {
    const start = Date.now();
    const url = `https://${domain}/.well-known/stellar.toml`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) {
      throw new NotFoundException(
        `stellar.toml not found at ${url} (HTTP ${res.status})`,
      );
    }
    const raw = await res.text();
    const cached: CachedToml = {
      parsed: parseBoundedToml(raw),
      fetchLatencyMs: Date.now() - start,
      expiresAt: Date.now() + this.tomlCacheTtlMs,
    };
    this.tomlCache.set(domain, cached);
    while (this.tomlCache.size > this.tomlCacheMaxEntries) {
      const oldest = this.tomlCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.tomlCache.delete(oldest);
    }
    return cached;
  }

  private async probeEndpoint(
    baseUrl: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<'green' | 'yellow' | 'timeout'> {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}${path}`;
      const res = await this.fetchWithTimeout(url, this.probeTimeoutMs, signal);
      return res.ok ? 'green' : 'yellow';
    } catch (error) {
      if (error instanceof RequestTimeoutError || signal?.aborted) return 'timeout';
      return 'yellow';
    }
  }
}
