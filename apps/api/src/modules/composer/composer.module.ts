import { Module } from '@nestjs/common';
import { ComposerController } from './composer.controller';
import { ComposerService } from './composer.service';
import { TransactionSequenceService } from './transaction-sequence.service';

@Module({
  controllers: [ComposerController],
  providers: [ComposerService, TransactionSequenceService],
  exports: [ComposerService, TransactionSequenceService],
})
export class ComposerModule {}
