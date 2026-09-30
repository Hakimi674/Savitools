import { Module } from '@nestjs/common';
import { SequencePlannerController } from './sequence-planner.controller';
import { SequencePlannerService } from './sequence-planner.service';

@Module({
  controllers: [SequencePlannerController],
  providers: [SequencePlannerService],
  exports: [SequencePlannerService]
})
export class SequencePlannerModule {}
