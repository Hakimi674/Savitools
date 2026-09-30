import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Account,
  Asset,
  BASE_FEE,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import {
  StellarTestnetService,
  type HorizonAccount,
} from '../stellar/stellar-testnet.service';

/** Stellar account flag bitmask values (`SetOptions` setFlags / clearFlags). */
export const ACCOUNT_FLAGS = {
  authorizationRequired: 1,
  authorizationRevocable: 2,
  authorizationImmutable: 4,
  authorizationClawbackEnabled: 8,
} as const;

/** Rejection reasons the Asset Control workstation renders verbatim. */
export type AssetControlErrorCode =
  | 'CLAWBACK_NOT_ENABLED'
  | 'AUTHORIZATION_IMMUTABLE'
  | 'INVALID_ASSET'
  | 'NO_FLAGS_PROVIDED'
  | 'HORIZON_ERROR';

/** One trustline holder, flattened for the table the web app renders. */
export interface TrustlineRow {
  account: string;
  balance: string;
  limit: string | null;
  authorized: boolean;
  authorizedToMaintainLiabilities: boolean;
  clawbackEnabled: boolean;
}

export interface TrustlineFilters {
  authorized?: boolean;
  clawbackEnabled?: boolean;
  minBalance?: number;
  maxBalance?: number;
  account?: string;
}

export interface TrustlinesResult {
  asset: { code: string; issuer: string };
  total: number;
  fetched: number;
  pages: number;
  truncated: boolean;
  trustlines: TrustlineRow[];
}

export interface AssetFlagsResult {
  asset: { code: string; issuer: string };
  account: string;
  authorizationRequired: boolean;
  authorizationRevocable: boolean;
  authorizationClawbackEnabled: boolean;
  authorizationImmutable: boolean;
}

export interface AssembledOperation {
  xdr: string;
  network: 'testnet';
  networkPassphrase: string;
  sourceAccount: string;
  sequence: string;
  operationType: 'setTrustlineFlags' | 'clawback' | 'setOptions';
  operation: Record<string, unknown>;
  summary: string;
  /** True when the API never holds a key: the issuer signs this XDR itself. */
  unsigned: true;
}

/** Horizon pages are capped at 200 records; a large issuer can have many. */
const HORIZON_PAGE_LIMIT = 200;
/**
 * Safety valve: 50 pages is 10,000 holders. A real issuer above that has
 * outgrown a single-page UI, and silently looping forever is worse than
 * reporting `truncated: true` with what was read.
 */
const MAX_TRUSTLINE_PAGES = 50;
/** Long enough for a human to review and sign the returned XDR. */
const XDR_TIMEOUT_SECONDS = 300;

interface HorizonAccountRecord {
  account_id: string;
  sequence: string;
  balances?: HorizonTrustlineBalance[];
}

interface HorizonTrustlineBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
  is_authorized?: boolean;
  is_authorized_to_maintain_liabilities?: boolean;
  is_clawback_enabled?: boolean;
}

interface HorizonPage {
  _embedded?: { records?: HorizonAccountRecord[] };
  _links?: { next?: { href?: string } };
}

/**
 * Asset Control workstation (Savitura/Savitools#81).
 *
 * Everything here builds **unsigned** XDR for the issuer to sign: the API
 * never sees, stores or uses an issuer secret. That keeps the dangerous half
 * of an asset-control console — the signing key — out of the server entirely,
 * which is also why `SetTrustlineFlags` is not gated on
 * `AUTHORIZATION_IMMUTABLE`: that flag blocks the issuer's own account-level
 * flags (`SetOptions`), not per-trustline authorization.
 */
@Injectable()
export class AssetControlService {
  private readonly logger = new Logger(AssetControlService.name);

  constructor(
    private readonly stellar: StellarTestnetService = new StellarTestnetService(),
  ) {}

  /** Horizon base URL, taken from the shared client so the two cannot drift. */
  private baseUrl(): string {
    const url = (this.stellar.server as unknown as { serverURL?: URL | string })
      .serverURL;
    return url
      ? String(url).replace(/\/+$/, '')
      : 'https://horizon-testnet.stellar.org';
  }

  /** A rejection the web app can branch on without parsing prose. */
  private failure(
    code: AssetControlErrorCode,
    message: string,
  ): BadRequestException {
    return new BadRequestException({
      statusCode: 400,
      code,
      error: code,
      message,
    });
  }

  /** Validate the asset coordinates and return the SDK asset for reuse. */
  parseAsset(code: string, issuer: string): Asset {
    if (!issuer || !/^G[A-Z2-7]{55}$/.test(issuer)) {
      throw this.failure(
        'INVALID_ASSET',
        `Invalid asset issuer "${issuer}": expected a 56-character Stellar public key`,
      );
    }
    if (!code) {
      throw this.failure('INVALID_ASSET', 'Asset code is required');
    }

    try {
      return new Asset(code, issuer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      throw this.failure(
        'INVALID_ASSET',
        `Invalid asset ${code}:${issuer}: ${message}`,
      );
    }
  }

  /** The issuer account's four asset-control flags (criterion 4). */
  async getAssetFlags(code: string, issuer: string): Promise<AssetFlagsResult> {
    this.parseAsset(code, issuer);
    const account = await this.stellar.loadAccount(issuer);

    return {
      asset: { code, issuer },
      account: account.account_id ?? issuer,
      authorizationRequired: Boolean(account.flags?.auth_required),
      authorizationRevocable: Boolean(account.flags?.auth_revocable),
      authorizationClawbackEnabled: Boolean(
        account.flags?.auth_clawback_enabled,
      ),
      authorizationImmutable: Boolean(account.flags?.auth_immutable),
    };
  }

  /**
   * Every account holding a trustline to the asset.
   *
   * Horizon's `/accounts?asset=CODE:ISSUER` filter is the only endpoint that
   * answers this directly, and it pages with a cursor. The loop consumes every
   * page *before* filtering, so a `authorized=false` filter is correct even
   * when unauthorised holders sit on page 3 of 5 (criterion 5).
   */
  async getTrustlines(
    code: string,
    issuer: string,
    filters: TrustlineFilters = {},
  ): Promise<TrustlinesResult> {
    const asset = this.parseAsset(code, issuer);
    const assetParam = `${asset.getCode()}:${asset.getIssuer()}`;

    let url: string | null =
      `${this.baseUrl()}/accounts?asset=${encodeURIComponent(assetParam)}` +
      `&limit=${HORIZON_PAGE_LIMIT}&order=asc`;
    const rows: TrustlineRow[] = [];
    let pages = 0;
    let truncated = false;

    while (url && pages < MAX_TRUSTLINE_PAGES) {
      const page = await this.fetchPage(url);
      pages += 1;

      for (const account of page._embedded?.records ?? []) {
        const balance = (account.balances ?? []).find(
          (entry) =>
            entry.asset_code === asset.getCode() &&
            entry.asset_issuer === asset.getIssuer(),
        );
        if (!balance) {
          continue;
        }

        rows.push({
          account: account.account_id,
          balance: balance.balance,
          limit: balance.limit ?? null,
          // Horizon omits these on assets with no authorization flags at all,
          // where a trustline is authorized by default.
          authorized: balance.is_authorized ?? true,
          authorizedToMaintainLiabilities:
            balance.is_authorized_to_maintain_liabilities ?? false,
          clawbackEnabled: balance.is_clawback_enabled ?? false,
        });
      }

      url = page._links?.next?.href ?? null;
      if (url && pages >= MAX_TRUSTLINE_PAGES) {
        truncated = true;
        this.logger.warn(
          `Trustline scan for ${assetParam} stopped at ${pages} pages`,
        );
      }
    }

    const trustlines = this.applyFilters(rows, filters);

    return {
      asset: { code, issuer },
      total: trustlines.length,
      fetched: rows.length,
      pages,
      truncated,
      trustlines,
    };
  }

  private async fetchPage(url: string): Promise<HorizonPage> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/hal+json' },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      throw this.failure('HORIZON_ERROR', `Horizon request failed: ${message}`);
    }

    if (response.ok) {
      return (await response.json()) as HorizonPage;
    }

    // A filtered `/accounts` query with nothing to return can answer 404; an
    // asset with no holders is an empty answer, not an error.
    if (response.status === 404) {
      return {};
    }

    const body = await response.text().catch(() => '');
    throw this.failure(
      'HORIZON_ERROR',
      `Horizon returned ${response.status}: ${body || response.statusText}`,
    );
  }

  private applyFilters(
    rows: TrustlineRow[],
    filters: TrustlineFilters,
  ): TrustlineRow[] {
    const { authorized, clawbackEnabled, minBalance, maxBalance, account } =
      filters;

    return rows.filter((row) => {
      if (authorized !== undefined && row.authorized !== authorized) {
        return false;
      }
      if (
        clawbackEnabled !== undefined &&
        row.clawbackEnabled !== clawbackEnabled
      ) {
        return false;
      }
      if (minBalance !== undefined && !(parseFloat(row.balance) >= minBalance)) {
        return false;
      }
      if (maxBalance !== undefined && !(parseFloat(row.balance) <= maxBalance)) {
        return false;
      }
      if (account && !row.account.toLowerCase().includes(account.toLowerCase())) {
        return false;
      }
      return true;
    });
  }

  /**
   * Authorize / deauthorize a single trustline (criteria 3, 6).
   *
   * Deliberately not blocked by `AUTHORIZATION_IMMUTABLE`: stellar-core's
   * `SetTrustLineFlagsOpFrame` never consults that flag, only `SetOptions`
   * does.
   */
  async buildSetFlagsXdr(
    code: string,
    issuer: string,
    account: string,
    flags: { authorized?: boolean; authorizedToMaintainLiabilities?: boolean } = {},
  ): Promise<AssembledOperation> {
    const asset = this.parseAsset(code, issuer);

    if (
      flags.authorized === undefined &&
      flags.authorizedToMaintainLiabilities === undefined
    ) {
      throw this.failure(
        'NO_FLAGS_PROVIDED',
        'At least one of flags.authorized or flags.authorizedToMaintainLiabilities is required',
      );
    }

    const issuerAccount = await this.stellar.loadAccount(issuer);
    const xdr = await this.assembleXdr(
      issuerAccount,
      Operation.setTrustLineFlags({
        trustor: account,
        asset,
        flags: {
          authorized: flags.authorized,
          authorizedToMaintainLiabilities: flags.authorizedToMaintainLiabilities,
        },
      }),
    );

    return {
      xdr,
      network: 'testnet',
      networkPassphrase: Networks.TESTNET,
      sourceAccount: issuerAccount.account_id ?? issuer,
      sequence: issuerAccount.sequence,
      operationType: 'setTrustlineFlags',
      operation: {
        trustor: account,
        asset: { code, issuer },
        flags: {
          authorized: flags.authorized,
          authorizedToMaintainLiabilities:
            flags.authorizedToMaintainLiabilities,
        },
      },
      summary:
        flags.authorized === false
          ? `Deauthorize ${account} for ${code}`
          : `Authorize ${account} for ${code}`,
      unsigned: true,
    };
  }

  /**
   * Claw the asset back from a holder (criterion 2).
   *
   * The issuer must have `AUTHORIZATION_CLAWBACK_ENABLED`; without it the
   * operation fails at the protocol level, so it is rejected here with a
   * machine-readable `CLAWBACK_NOT_ENABLED` and no XDR is produced.
   */
  async buildClawbackXdr(
    code: string,
    issuer: string,
    account: string,
    amount: string,
  ): Promise<AssembledOperation> {
    const asset = this.parseAsset(code, issuer);
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw this.failure(
        'INVALID_ASSET',
        `Clawback amount must be a positive number, received "${amount}"`,
      );
    }

    const issuerAccount = await this.stellar.loadAccount(issuer);
    if (!issuerAccount.flags?.auth_clawback_enabled) {
      throw this.failure(
        'CLAWBACK_NOT_ENABLED',
        `AUTHORIZATION_CLAWBACK_ENABLED is not set on issuer ${issuer}; no clawback XDR was produced`,
      );
    }

    const xdr = await this.assembleXdr(
      issuerAccount,
      Operation.clawback({ from: account, asset, amount }),
    );

    return {
      xdr,
      network: 'testnet',
      networkPassphrase: Networks.TESTNET,
      sourceAccount: issuerAccount.account_id ?? issuer,
      sequence: issuerAccount.sequence,
      operationType: 'clawback',
      operation: { from: account, asset: { code, issuer }, amount },
      summary: `Claw back ${amount} ${code} from ${account}`,
      unsigned: true,
    };
  }

  /**
   * Change the issuer account's own asset-control flags from desired booleans.
   *
   * `AUTHORIZATION_IMMUTABLE` is terminal: stellar-core's
   * `SetOptionsOpFrame::isImmutableAuth` refuses any further flag change, so a
   * request that would touch flags on an immutable issuer is rejected before an
   * unusable XDR is handed out (criterion 4).
   */
  async buildAccountFlagsXdr(
    code: string,
    issuer: string,
    desired: {
      authorizationRequired?: boolean;
      authorizationRevocable?: boolean;
      authorizationClawbackEnabled?: boolean;
      authorizationImmutable?: boolean;
    },
  ): Promise<AssembledOperation> {
    this.parseAsset(code, issuer);

    const requested = Object.entries(desired).filter(
      ([, value]) => value !== undefined,
    );
    if (requested.length === 0) {
      throw this.failure(
        'NO_FLAGS_PROVIDED',
        'At least one account flag must be specified',
      );
    }

    const issuerAccount = await this.stellar.loadAccount(issuer);
    const current = {
      authorizationRequired: Boolean(issuerAccount.flags?.auth_required),
      authorizationRevocable: Boolean(issuerAccount.flags?.auth_revocable),
      authorizationClawbackEnabled: Boolean(
        issuerAccount.flags?.auth_clawback_enabled,
      ),
      authorizationImmutable: Boolean(issuerAccount.flags?.auth_immutable),
    };

    if (current.authorizationImmutable) {
      throw this.failure(
        'AUTHORIZATION_IMMUTABLE',
        `Issuer ${issuer} has AUTHORIZATION_IMMUTABLE set; its asset-control flags can no longer be changed`,
      );
    }

    let setFlags = 0;
    let clearFlags = 0;
    for (const [name, value] of requested as Array<
      [keyof typeof ACCOUNT_FLAGS, boolean]
    >) {
      const bit = ACCOUNT_FLAGS[name];
      if (value && !current[name]) {
        setFlags |= bit;
      } else if (!value && current[name]) {
        clearFlags |= bit;
      }
    }

    if (setFlags === 0 && clearFlags === 0) {
      throw this.failure(
        'NO_FLAGS_PROVIDED',
        'Requested flags already match the issuer account; nothing to change',
      );
    }

    const xdr = await this.assembleXdr(
      issuerAccount,
      Operation.setOptions({
        /* eslint-disable @typescript-eslint/no-explicit-any -- SDK int32 flag unions accept runtime-validated numbers */
        setFlags: setFlags as any,
        clearFlags: clearFlags as any,
        /* eslint-enable @typescript-eslint/no-explicit-any */
      }),
    );

    return {
      xdr,
      network: 'testnet',
      networkPassphrase: Networks.TESTNET,
      sourceAccount: issuerAccount.account_id ?? issuer,
      sequence: issuerAccount.sequence,
      operationType: 'setOptions',
      operation: { setFlags, clearFlags, desired: { ...desired } },
      summary: `Set issuer account flags (set ${setFlags}, clear ${clearFlags})`,
      unsigned: true,
    };
  }

  /** Build an unsigned transaction from the issuer's current sequence. */
  private async assembleXdr(
    account: HorizonAccount,
    operation: xdr.Operation,
  ): Promise<string> {
    const accountId = account.account_id;
    if (!accountId) {
      throw this.failure(
        'HORIZON_ERROR',
        'Issuer account response did not include account_id',
      );
    }

    try {
      return new TransactionBuilder(new Account(accountId, account.sequence), {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(operation)
        .setTimeout(XDR_TIMEOUT_SECONDS)
        .build()
        .toXDR();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      throw this.failure(
        'INVALID_ASSET',
        `Failed to assemble transaction: ${message}`,
      );
    }
  }
}
