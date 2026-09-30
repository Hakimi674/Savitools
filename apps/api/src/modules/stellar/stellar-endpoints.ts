import { BadRequestException } from '@nestjs/common';
import { Networks } from '@stellar/stellar-sdk';

export interface StellarNetworkEndpoints {
  network: string;
  horizonUrl: string;
  friendbotUrl: string;
  rpcUrl: string;
  passphrase: string;
}

export const STANDALONE_PASSPHRASE = 'Standalone Network ; February 2017';

/**
 * Resolves Horizon, RPC, and Friendbot endpoints from shared configuration
 * and environment variables rather than module constants (Savitura/Savitools#323).
 *
 * Safety invariant: Sandbox operations must never touch mainnet. Any attempt
 * to target mainnet throws BadRequestException immediately before any request
 * is dispatched.
 */
export function resolveStellarEndpoints(
  networkName: string = 'testnet',
  overrides?: {
    horizonUrl?: string;
    friendbotUrl?: string;
    passphrase?: string;
    rpcUrl?: string;
  },
): StellarNetworkEndpoints {
  const normalized = (networkName || 'testnet').toLowerCase().trim();

  // Mainnet is strictly prohibited in Sandbox
  if (normalized === 'mainnet' || normalized === 'public') {
    throw new BadRequestException(
      'Mainnet is prohibited in Sandbox. Sandbox operations are strictly limited to testnet, local quickstart, and private custom networks.',
    );
  }

  if (normalized === 'quickstart' || normalized === 'local') {
    return {
      network: 'quickstart',
      horizonUrl:
        overrides?.horizonUrl ||
        process.env.STELLAR_QUICKSTART_HORIZON_URL ||
        'http://localhost:8000',
      friendbotUrl:
        overrides?.friendbotUrl ||
        process.env.STELLAR_QUICKSTART_FRIENDBOT_URL ||
        'http://localhost:8000/friendbot',
      rpcUrl:
        overrides?.rpcUrl ||
        process.env.STELLAR_QUICKSTART_RPC_URL ||
        'http://localhost:8000/soroban/rpc',
      passphrase:
        overrides?.passphrase ||
        process.env.STELLAR_QUICKSTART_PASSPHRASE ||
        STANDALONE_PASSPHRASE,
    };
  }

  if (normalized === 'custom') {
    if (!overrides?.horizonUrl) {
      throw new BadRequestException('Custom network requires a valid horizonUrl');
    }
    return {
      network: 'custom',
      horizonUrl: overrides.horizonUrl,
      friendbotUrl: overrides.friendbotUrl || '',
      rpcUrl: overrides.rpcUrl || '',
      passphrase: overrides.passphrase || STANDALONE_PASSPHRASE,
    };
  }

  // Default: testnet
  return {
    network: 'testnet',
    horizonUrl:
      overrides?.horizonUrl ||
      process.env.STELLAR_HORIZON_URL ||
      'https://horizon-testnet.stellar.org',
    friendbotUrl:
      overrides?.friendbotUrl ||
      process.env.STELLAR_FRIENDBOT_URL ||
      'https://friendbot.stellar.org',
    rpcUrl:
      overrides?.rpcUrl ||
      process.env.STELLAR_RPC_URL ||
      'https://soroban-rpc-testnet.stellar.org',
    passphrase:
      overrides?.passphrase ||
      process.env.STELLAR_NETWORK_PASSPHRASE ||
      Networks.TESTNET,
  };
}
