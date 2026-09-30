import { Module } from '@nestjs/common';
import { StellarTomlController } from './stellar-toml.controller';
import { StellarTomlService } from './stellar-toml.service';

@Module({
  controllers: [StellarTomlController],
  providers: [StellarTomlService],
  exports: [StellarTomlService]
})
export class StellarTomlModule {}
