import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LiquidityPoolsService } from './liquidity-pools.service';
import { PoolSearchDto, ShareValueDto, WatchPoolDto, UnwatchPoolDto } from './dto/pool-search.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('liquidity-pools')
@Controller('liquidity-pools')
export class LiquidityPoolsController {
  constructor(private readonly liquidityPoolsService: LiquidityPoolsService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search for liquidity pools by asset pair',
    description: 'Finds constant-product AMM pools for a given asset pair on Stellar.',
  })
  @ApiQuery({ name: 'assetA', description: 'First asset (XLM or CODE:ISSUER)' })
  @ApiQuery({ name: 'assetB', description: 'Second asset (XLM or CODE:ISSUER)' })
  @ApiQuery({ name: 'network', required: false, enum: ['mainnet', 'testnet'], description: 'Default: testnet' })
  @ApiResponse({ status: 200, description: 'Pool details returned' })
  @ApiResponse({ status: 400, description: 'Invalid asset format or network' })
  async searchPools(@Query() dto: PoolSearchDto) {
    return this.liquidityPoolsService.searchPools(dto);
  }

  @Get('details')
  @ApiOperation({
    summary: 'Get detailed information about a specific pool',
    description: 'Returns reserves, fees, spot prices, and other pool metadata.',
  })
  @ApiQuery({ name: 'poolId', description: '64-character hex pool ID' })
  @ApiQuery({ name: 'network', required: false, enum: ['mainnet', 'testnet'], description: 'Default: testnet' })
  @ApiResponse({ status: 200, description: 'Pool details returned' })
  @ApiResponse({ status: 400, description: 'Invalid pool ID or network' })
  @ApiResponse({ status: 404, description: 'Pool not found' })
  async getPoolDetails(
    @Query('poolId') poolId: string,
    @Query('network') network: string = 'testnet',
  ) {
    return this.liquidityPoolsService.getPoolDetails(poolId, network);
  }

  @Post('share-value')
  @ApiOperation({
    summary: 'Calculate the value of LP shares',
    description: 'Returns the proportional asset values and ownership percentage for a given number of LP shares.',
  })
  @ApiResponse({ status: 201, description: 'Share value calculated' })
  @ApiResponse({ status: 400, description: 'Invalid input or pool state' })
  @ApiResponse({ status: 404, description: 'Pool not found' })
  async calculateShareValue(@Body() dto: ShareValueDto) {
    return this.liquidityPoolsService.calculateShareValue(dto);
  }

  @Post('watch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a pool to your watchlist',
    description: 'Saves a pool for quick access. Requires authentication.',
  })
  @ApiResponse({ status: 201, description: 'Pool added to watchlist' })
  @ApiResponse({ status: 400, description: 'Invalid input or pool does not exist' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async watchPool(@Request() req: RequestWithUser, @Body() dto: WatchPoolDto) {
    return this.liquidityPoolsService.watchPool(req.user.id, dto);
  }

  @Post('unwatch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a pool from your watchlist',
    description: 'Deletes a watched pool. Requires authentication.',
  })
  @ApiResponse({ status: 204, description: 'Pool removed from watchlist' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 404, description: 'Watched pool not found' })
  async unwatchPool(@Request() req: RequestWithUser, @Body() dto: UnwatchPoolDto) {
    await this.liquidityPoolsService.unwatchPool(req.user.id, dto.id);
  }

  @Get('watched')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get your watched pools',
    description: 'Returns all pools on your watchlist. Requires authentication.',
  })
  @ApiResponse({ status: 200, description: 'Watched pools returned' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async getWatchedPools(@Request() req: RequestWithUser) {
    return this.liquidityPoolsService.getWatchedPools(req.user.id);
  }
}
