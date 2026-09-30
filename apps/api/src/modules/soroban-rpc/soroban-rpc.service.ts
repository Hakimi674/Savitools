import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  resolveStellarRpcUrl,
  type StellarEndpointEnv,
} from '../../config/stellar-endpoints';
import {
  findRpcMethod,
  listRpcMethods,
  validateRpcParams,
  type RpcMethodSpec,
} from './soroban-rpc.methods';
import type { SorobanRpcNetwork } from './dto/execute-soroban-rpc.dto';

/** Upstream budget for a single JSON-RPC call; the console shows it as `tookMs`. */
const RPC_TIMEOUT_MS = 15_000;

export interface SorobanRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface ExecuteSorobanRpcResult {
  method: string;
  network: SorobanRpcNetwork;
  tookMs: number;
  /** JSON-RPC `result`, present when the server answered without an error. */
  result?: unknown;
  /** JSON-RPC `error`, present when the server answered with an error object. */
  error?: SorobanRpcError;
}

interface JsonRpcPayload {
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

/**
 * Stateless proxy for a whitelisted set of read-only Soroban RPC methods
 * (Savitura/Savitools#358).
 *
 * The console is deliberately a proxy instead of a browser-side call: the
 * target URL is resolved from configuration only, which keeps request
 * parameters from becoming an SSRF vector, and the RPC endpoint never has to
 * be reachable from the user's browser.
 */
@Injectable()
export class SorobanRpcService {
  private requestCounter = 0;

  constructor(private readonly config: ConfigService) {}

  listMethods(): { methods: readonly RpcMethodSpec[] } {
    return { methods: listRpcMethods() };
  }

  getMethod(name: string): RpcMethodSpec {
    const method = findRpcMethod(name);
    if (!method) {
      throw new NotFoundException(`Unknown Soroban RPC method "${name}"`);
    }
    return method;
  }

  /** Environment view the shared endpoint resolver understands. */
  private rpcEnv(): StellarEndpointEnv {
    return {
      STELLAR_RPC_URL: this.config.get<string | undefined>('STELLAR_RPC_URL'),
      STELLAR_RPC_PUBLIC_URL: this.config.get<string | undefined>(
        'STELLAR_RPC_PUBLIC_URL',
      ),
    };
  }

  private rpcUrl(network: SorobanRpcNetwork): string {
    return resolveStellarRpcUrl(
      this.rpcEnv(),
      network === 'mainnet' ? 'public' : 'testnet',
    );
  }

  async execute(input: {
    method: string;
    params?: Record<string, unknown>;
    network?: SorobanRpcNetwork;
  }): Promise<ExecuteSorobanRpcResult> {
    const spec = this.getMethod(input.method);
    const params = validateRpcParams(spec, input.params);
    const network: SorobanRpcNetwork = input.network ?? 'testnet';
    const url = this.rpcUrl(network);
    const id = ++this.requestCounter;

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: spec.name,
          params,
        }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(
        `Could not reach the Soroban RPC endpoint: ${reason}`,
      );
    }
    const tookMs = Date.now() - startedAt;

    if (!response.ok) {
      throw new BadGatewayException(
        `Soroban RPC responded with HTTP ${response.status}`,
      );
    }

    const payload = (await response.json().catch(() => null)) as
      | JsonRpcPayload
      | null;
    if (!payload || typeof payload !== 'object') {
      throw new BadGatewayException('Soroban RPC returned a non-JSON response');
    }

    if (payload.error) {
      return {
        method: spec.name,
        network,
        tookMs,
        error: {
          code: payload.error.code ?? -1,
          message: payload.error.message ?? 'Unknown JSON-RPC error',
          ...(payload.error.data === undefined
            ? {}
            : { data: payload.error.data }),
        },
      };
    }

    return {
      method: spec.name,
      network,
      tookMs,
      result: payload.result ?? null,
    };
  }
}
