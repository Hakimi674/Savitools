import { Module } from '@nestjs/common';
import { ComposerService } from './composer.service';
import { ComposerController } from './composer.controller';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [StellarModule],
  providers: [ComposerService],
  controllers: [ComposerController],
  exports: [ComposerService]
})
export class ComposerModule {}