import { Module } from '@nestjs/common';
import { Sep10DebuggerController } from './sep10-debugger.controller';
import { Sep10DebuggerService } from './sep10-debugger.service';

@Module({
  controllers: [Sep10DebuggerController],
  providers: [Sep10DebuggerService],
  exports: [Sep10DebuggerService],
})
export class Sep10Module {}