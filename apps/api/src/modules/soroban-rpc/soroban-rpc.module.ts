import { Module } from '@nestjs/common';
import { SorobanRpcController } from './soroban-rpc.controller';
import { SorobanRpcService } from './soroban-rpc.service';

/**
 * Read-only Soroban RPC method console (Savitura/Savitools#358).
 *
 * Stateless: no entities, no migrations, no feature flag. Routes are public
 * like the other read-only tooling endpoints and are covered by the global
 * throttler.
 */
@Module({
  controllers: [SorobanRpcController],
  providers: [SorobanRpcService],
  exports: [SorobanRpcService],
})
export class SorobanRpcModule {}
