import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { TransactionReplay } from './entities/transaction-replay.entity';

@Module({
  imports: [ConfigModule, AuthModule, TypeOrmModule.forFeature([TransactionReplay])],
  controllers: [TransactionController, GraphController],
  providers: [TransactionService, GraphService],
  exports: [TransactionService],
})
export class TransactionModule {}
