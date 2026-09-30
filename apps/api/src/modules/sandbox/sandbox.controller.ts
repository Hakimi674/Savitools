import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';
import { FundDto } from './dto/fund.dto';
import { PaymentDto } from './dto/payment.dto';
import { ResetAccountDto } from './dto/reset-account.dto';

@ApiTags('sandbox')
@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('keypair')
  @ApiOperation({ summary: 'Generate a new ed25519 keypair labelled with its network' })
  @ApiQuery({ name: 'network', required: false, description: 'Target network (e.g. testnet, quickstart)' })
  generateKeypair(@Query('network') network?: string) {
    return this.sandboxService.generateKeypair(network);
  }

  @Post('fund')
  @ApiOperation({ summary: 'Fund an account via Friendbot on the target network' })
  fund(@Body() dto: FundDto) {
    return this.sandboxService.fundFromFriendbot(dto.publicKey, dto.network);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset a sandbox account to its known starting state' })
  reset(@Body() dto: ResetAccountDto) {
    return this.sandboxService.resetAccount(dto.publicKey, dto.network);
  }

  @Get('account/:publicKey')
  @ApiOperation({ summary: 'Get Horizon account details on the selected network' })
  @ApiParam({ name: 'publicKey', description: 'Stellar public key' })
  @ApiQuery({ name: 'network', required: false, description: 'Target network' })
  getAccount(
    @Param('publicKey') publicKey: string,
    @Query('network') network?: string,
  ) {
    return this.sandboxService.getAccount(publicKey, network);
  }

  @Post('payment')
  @ApiOperation({ summary: 'Submit a test payment between sandbox accounts on the selected network' })
  sendPayment(@Body() dto: PaymentDto) {
    return this.sandboxService.sendPayment(dto);
  }
}
