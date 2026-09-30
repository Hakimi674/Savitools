import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiquidityPoolsController } from './liquidity-pools.controller';
import { LiquidityPoolsService } from './liquidity-pools.service';
import { WatchedPool } from './entities/watched-pool.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([WatchedPool]), AuthModule],
  controllers: [LiquidityPoolsController],
  providers: [LiquidityPoolsService],
  exports: [LiquidityPoolsService],
})
export class LiquidityPoolsModule {}
