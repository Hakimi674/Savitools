import { Controller, Post, Body, Query } from '@nestjs/common';
import { ComposerService, OPERATION_MANIFEST } from './composer.service';
import { StellarSdk } from '../stellar/stellar-sdk';
import { Asset, MuxedAccount } from '../stellar/stellar.types';

@Controller('composer')
export class ComposerController {
  constructor(private readonly composer: ComposerService) {}

  // ... existing endpoints ...

  @Post('operations/create-claimable-balance')
  async createClaimableBalance(
    @Body('source') source: string,
    @Body('asset') asset: Asset,
    @Body('amount') amount: string,
    @Body('destination') destination: string | MuxedAccount
  ): Promise<StellarSdk.TransactionBuilder> {
    return this.composer.buildCreateClaimableBalance(
      source, asset, amount, destination
    );
  }

  @Post('operations/claim-claimable-balance')
  async claimClaimableBalance(
    @Body('source') source: string,
    @Body('balanceId') balanceId: string,
    @Body('destination') destination: string | MuxedAccount
  ): Promise<StellarSdk.TransactionBuilder> {
    return this.composer.buildClaimClaimableBalance(
      source, balanceId, destination
    );
  }

  @Post('operations/simulate/create-claimable-balance')
  async simulateCreateClaimableBalance(
    @Body('source') source: string,
    @Body('asset') asset: Asset,
    @Body('amount') amount: string,
    @Body('destination') destination: string | MuxedAccount
  ): Promise<StellarSdk.Transaction> {
    return this.composer.simulateCreateClaimableBalance(
      source, asset, amount, destination
    );
  }

  @Post('operations/simulate/claim-claimable-balance')
  async simulateClaimClaimableBalance(
    @Body('source') source: string,
    @Body('balanceId') balanceId: string,
    @Body('destination') destination: string | MuxedAccount
  ): Promise<StellarSdk.Transaction> {
    return this.composer.simulateClaimClaimableBalance(
      source, balanceId, destination
    );
  }
}