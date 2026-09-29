import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ComposerController } from './composer.controller';
import { ComposerService } from './composer.service';
import { TransactionSequenceService } from './transaction-sequence.service';

@Module({
  imports: [AuthModule],
  controllers: [ComposerController],
  providers: [ComposerService, TransactionSequenceService],
  exports: [ComposerService, TransactionSequenceService],
})
export class ComposerModule {}
