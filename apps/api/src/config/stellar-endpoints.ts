/**
 * Single source of truth for resolving the Horizon and Soroban RPC endpoints
 * from environment configuration (Savitura/Savitools#315).
 *
 * Every consumer used to inline its own `STELLAR_HORIZON_*` / `STELLAR_RPC_*`
 * lookups, which is how the codebase ended up with two competing mainnet keys
 * (`STELLAR_HORIZON_PUBLIC_URL` and the older `STELLAR_HORIZON_MAINNET_URL`).
 * Reading them through these helpers keeps the preference order identical
 * everywhere and keeps the documented defaults in one place.
 */

/** Network vocabulary shared by the Horizon and Soroban RPC resolvers. */
export type StellarEndpointNetwork = 'testnet' | 'public';

/** Environment-style map: any missing key simply resolves to the default. */
export type StellarEndpointEnv = Readonly<Record<string, string | undefined>>;

const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';
const HORIZON_PUBLIC_URL = 'https://horizon.stellar.org';
const RPC_TESTNET_URL = 'https://soroban-testnet.stellar.org';
const RPC_PUBLIC_URL = 'https://mainnet.sorobanrpc.com';

/**
 * Horizon base URL for `network`.
 *
 * Public (mainnet) preference order: `STELLAR_HORIZON_PUBLIC_URL`, then the
 * legacy `STELLAR_HORIZON_MAINNET_URL`, then the Horizon.io default.
 * Testnet reads `STELLAR_HORIZON_URL`.
 */
export function resolveStellarHorizonUrl(
  env: StellarEndpointEnv,
  network: StellarEndpointNetwork,
): string {
  if (network === 'public') {
    return (
      env.STELLAR_HORIZON_PUBLIC_URL ??
      env.STELLAR_HORIZON_MAINNET_URL ??
      HORIZON_PUBLIC_URL
    );
  }
  return env.STELLAR_HORIZON_URL ?? HORIZON_TESTNET_URL;
}

/**
 * Soroban RPC base URL for `network`.
 *
 * Public (mainnet) reads `STELLAR_RPC_PUBLIC_URL`, testnet reads
 * `STELLAR_RPC_URL`.
 */
export function resolveStellarRpcUrl(
  env: StellarEndpointEnv,
  network: StellarEndpointNetwork,
): string {
  if (network === 'public') {
    return env.STELLAR_RPC_PUBLIC_URL ?? RPC_PUBLIC_URL;
  }
  return env.STELLAR_RPC_URL ?? RPC_TESTNET_URL;
}
