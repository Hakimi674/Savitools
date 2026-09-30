import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
  StellarEndpointEnv,
  StellarEndpointNetwork,
  resolveStellarHorizonUrl,
  resolveStellarRpcUrl,
} from '../../config/stellar-endpoints';
import { StellarNetwork } from './monitor.types';

/** Snapshot of the endpoint keys `ConfigService` can override. */
function endpointEnv(configService: ConfigService): StellarEndpointEnv {
  return {
    STELLAR_HORIZON_URL: configService.get<string>('STELLAR_HORIZON_URL'),
    STELLAR_HORIZON_PUBLIC_URL: configService.get<string>(
      'STELLAR_HORIZON_PUBLIC_URL',
    ),
    STELLAR_HORIZON_MAINNET_URL: configService.get<string>(
      'STELLAR_HORIZON_MAINNET_URL',
    ),
    STELLAR_RPC_URL: configService.get<string>('STELLAR_RPC_URL'),
    STELLAR_RPC_PUBLIC_URL: configService.get<string>('STELLAR_RPC_PUBLIC_URL'),
  };
}

function endpointNetwork(network: StellarNetwork): StellarEndpointNetwork {
  return network === 'public' ? 'public' : 'testnet';
}

export function horizonServer(
  configService: ConfigService,
  network: StellarNetwork,
): StellarSdk.Horizon.Server {
  const url = resolveStellarHorizonUrl(
    endpointEnv(configService),
    endpointNetwork(network),
  );
  return new StellarSdk.Horizon.Server(url);
}

export function rpcServer(
  configService: ConfigService,
  network: StellarNetwork,
): StellarSdk.rpc.Server {
  const url = resolveStellarRpcUrl(
    endpointEnv(configService),
    endpointNetwork(network),
  );
  return new StellarSdk.rpc.Server(url);
}
