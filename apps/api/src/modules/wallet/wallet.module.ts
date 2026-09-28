import { Module } from '@nestjs/common';
import { StellarTestnetModule } from '../stellar/stellar-testnet.module';
import { WalletController } from './wallet.controller';
import { AssetControlService } from './assetcontrol.service';

@Module({
  imports: [StellarTestnetModule],
  controllers: [WalletController],
  providers: [AssetControlService],
  exports: [AssetControlService],
})
export class WalletModule {}
