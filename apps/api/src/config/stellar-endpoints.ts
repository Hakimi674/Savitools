/**
 * Shared Horizon/RPC URL resolution (Savitura/Savitools#315).
 *
 * Every consumer that talks to Stellar reads its endpoint through this module
 * instead of hand-rolling `ConfigService.get` fallbacks, so a deployment can
 * override mainnet endpoints consistently in one place:
 *
 * - `STELLAR_HORIZON_PUBLIC_URL` / `STELLAR_RPC_PUBLIC_URL` — the public
 *   (mainnet) endpoints, consulted when `network === 'public'`.
 * - `STELLAR_HORIZON_MAINNET_URL` — legacy alias for the public Horizon URL,
 *   still honoured so older deployments do not silently fall back.
 * - `STELLAR_HORIZON_URL` / `STELLAR_RPC_URL` — the testnet endpoints.
 */

const DEFAULT_HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';
const DEFAULT_HORIZON_PUBLIC = 'https://horizon.stellar.org';
const DEFAULT_RPC_TESTNET = 'https://soroban-testnet.stellar.org';
const DEFAULT_RPC_PUBLIC = 'https://mainnet.sorobanrpc.com';

export type StellarNetworkKey = 'public' | 'testnet';

function readString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/** Resolve the Horizon endpoint for `network`, honouring the legacy mainnet alias. */
export function resolveStellarHorizonUrl(
  config: Record<string, unknown>,
  network: StellarNetworkKey,
): string {
  if (network === 'public') {
    return (
      readString(config, 'STELLAR_HORIZON_PUBLIC_URL') ??
      readString(config, 'STELLAR_HORIZON_MAINNET_URL') ??
      DEFAULT_HORIZON_PUBLIC
    );
  }
  return readString(config, 'STELLAR_HORIZON_URL') ?? DEFAULT_HORIZON_TESTNET;
}

/** Resolve the Soroban RPC endpoint for `network`. */
export function resolveStellarRpcUrl(
  config: Record<string, unknown>,
  network: StellarNetworkKey,
): string {
  if (network === 'public') {
    return readString(config, 'STELLAR_RPC_PUBLIC_URL') ?? DEFAULT_RPC_PUBLIC;
  }
  return readString(config, 'STELLAR_RPC_URL') ?? DEFAULT_RPC_TESTNET;
}
