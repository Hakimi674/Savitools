import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AssetControlService } from './assetcontrol.service';
import { SetTrustlineFlagsDto } from './dto/set-flags.dto';
import { ClawbackDto } from './dto/clawback.dto';
import { AccountFlagsDto } from './dto/account-flags.dto';

/** Query strings are optional filters; anything but "true"/"false" is a 400. */
function parseOptionalBoolean(value?: string): boolean | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new BadRequestException(
    `Expected "true" or "false", received "${value}"`,
  );
}

function parseOptionalNumber(value?: string): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (isNaN(parsed)) {
    throw new BadRequestException(`Expected a number, received "${value}"`);
  }
  return parsed;
}

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly assetControlService: AssetControlService,
  ) {}

  // ---------------------------------------------------------------------------
  // Asset Control workstation (Savitura/Savitools#81)
  // ---------------------------------------------------------------------------

  @Get('asset/:code/:issuer/flags')
  @ApiOperation({ summary: "Read an asset issuer's asset-control flags" })
  @ApiParam({ name: 'code', required: true, type: String })
  @ApiParam({ name: 'issuer', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Issuer asset-control flags' })
  @ApiResponse({ status: 400, description: 'Invalid asset, or issuer not found' })
  getAssetFlags(
    @Param('code') code: string,
    @Param('issuer') issuer: string,
  ) {
    return this.assetControlService.getAssetFlags(code, issuer);
  }

  @Get('asset/:code/:issuer/trustlines')
  @ApiOperation({ summary: 'List every account holding a trustline to an asset' })
  @ApiParam({ name: 'code', required: true, type: String })
  @ApiParam({ name: 'issuer', required: true, type: String })
  @ApiQuery({ name: 'authorized', required: false, type: String, enum: ['true', 'false'] })
  @ApiQuery({ name: 'clawbackEnabled', required: false, type: String, enum: ['true', 'false'] })
  @ApiQuery({ name: 'minBalance', required: false, type: Number })
  @ApiQuery({ name: 'maxBalance', required: false, type: Number })
  @ApiQuery({ name: 'account', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Trustline holders, filtered across every Horizon page',
  })
  @ApiResponse({ status: 400, description: 'Invalid asset or filter' })
  getAssetTrustlines(
    @Param('code') code: string,
    @Param('issuer') issuer: string,
    @Query('authorized') authorized?: string,
    @Query('clawbackEnabled') clawbackEnabled?: string,
    @Query('minBalance') minBalance?: string,
    @Query('maxBalance') maxBalance?: string,
    @Query('account') account?: string,
  ) {
    return this.assetControlService.getTrustlines(code, issuer, {
      authorized: parseOptionalBoolean(authorized),
      clawbackEnabled: parseOptionalBoolean(clawbackEnabled),
      minBalance: parseOptionalNumber(minBalance),
      maxBalance: parseOptionalNumber(maxBalance),
      account: account || undefined,
    });
  }

  @Post('asset/:code/:issuer/set-flags')
  @ApiOperation({
    summary:
      'Build (never sign) a SetTrustlineFlags transaction to authorize or deauthorize a holder',
  })
  @ApiParam({ name: 'code', required: true, type: String })
  @ApiParam({ name: 'issuer', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Unsigned transaction XDR' })
  @ApiResponse({ status: 400, description: 'Invalid asset, account or flags' })
  setTrustlineFlags(
    @Param('code') code: string,
    @Param('issuer') issuer: string,
    @Body() dto: SetTrustlineFlagsDto,
  ) {
    return this.assetControlService.buildSetFlagsXdr(
      code,
      issuer,
      dto.account,
      dto.flags ?? {},
    );
  }

  @Post('asset/:code/:issuer/clawback')
  @ApiOperation({
    summary: 'Build (never sign) a Clawback transaction for a holder',
  })
  @ApiParam({ name: 'code', required: true, type: String })
  @ApiParam({ name: 'issuer', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Unsigned transaction XDR' })
  @ApiResponse({
    status: 400,
    description: 'Invalid asset, or the issuer is missing CLAWBACK_NOT_ENABLED',
  })
  clawback(
    @Param('code') code: string,
    @Param('issuer') issuer: string,
    @Body() dto: ClawbackDto,
  ) {
    return this.assetControlService.buildClawbackXdr(
      code,
      issuer,
      dto.account,
      dto.amount,
    );
  }

  @Post('asset/:code/:issuer/account-flags')
  @ApiOperation({
    summary:
      "Build (never sign) a SetOptions transaction for the issuer's own asset-control flags",
  })
  @ApiParam({ name: 'code', required: true, type: String })
  @ApiParam({ name: 'issuer', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Unsigned transaction XDR' })
  @ApiResponse({
    status: 400,
    description: 'Invalid asset, no flags requested, or the issuer is immutable',
  })
  setAccountFlags(
    @Param('code') code: string,
    @Param('issuer') issuer: string,
    @Body() dto: AccountFlagsDto,
  ) {
    return this.assetControlService.buildAccountFlagsXdr(code, issuer, dto);
  }
}
