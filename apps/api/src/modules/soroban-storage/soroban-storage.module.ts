import { Module } from '@nestjs/common';
import { SorobanStorageController } from './soroban-storage.controller';
import { SorobanStorageService } from './soroban-storage.service';

@Module({
  controllers: [SorobanStorageController],
  providers: [SorobanStorageService],
  exports: [SorobanStorageService],
})
export class SorobanStorageModule {}