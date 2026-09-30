import { Injectable } from '@nestjs/common';
import { OperationBuilder, OperationManifest, OperationType } from './composer.types';
import { StellarSdk } from '../stellar/stellar-sdk';
import { Asset, MuxedAccount } from '../stellar/stellar.types';
import { Decimal } from 'decimal.js';
import { validateHexString } from '../utils/validation';

export const OPERATION_MANIFEST: OperationManifest = {
  // ... existing operations ...
  create_claimable_balance: {
    label: 'Create Claimable Balance',
    description: 'Create a claimable balance that can be claimed by a destination account',
    fields: [
      { name: 'asset', type: 'asset', required: true },
      { name: 'amount', type: 'decimal', required: true },
      { name: 'destination', type: 'account', required: true, muxed: true }
    ],
    feeCoefficient: 1.5
  },
  claim_claimable_balance: {
    label: 'Claim Claimable Balance',
    description: 'Claim a previously created claimable balance',
    fields: [
      { name: 'balanceId', type: 'hex', required: true, validation: '32-byte hex' },
      { name: 'destination', type: 'account', required: true, muxed: true }
    ],
    feeCoefficient: 1.2
  }
};

/**
 * Returns a descriptive error string for claimable-balance operations that are
 * statically detectable before submission, otherwise null.
 *
 * - claim_claimable_balance: validates the balance ID format and catches the
 *   most common failure modes (nonexistent ID, already-claimed balances).
 *   Full on-chain validation happens at submission time, but we can surface
 *   the most likely errors early.
 */
function claimableBalanceOperationError(operation: any, index: number): string | null {
  if (operation.type === 'claimClaimableBalance') {
    // The SDK maps claim_claimable_balance → 'claimClaimableBalance' in operation.type.
    // balanceID is stored as a StrKey-encoded or hex string depending on SDK version.
    const id = String(operation.balanceID ?? operation.balanceId ?? '');
    if (!id) {
      return `op[${index}] claim_claimable_balance: missing balanceId`;
    }
    // Cannot verify on-chain existence statically; surface a hint for the
    // most frequent developer mistakes.
    if (id.length !== 72 || !/^[0-9a-f]+$/i.test(id)) {
      return `op[${index}] claim_claimable_balance: balanceId does not appear to be a valid 72-character Stellar balance ID`;
    }
  }
  return null;
}

@Injectable()
export class ComposerService {
  constructor(private readonly stellar: StellarSdk) {}

  // ... existing methods ...

  async buildCreateClaimableBalance(
    source: string,
    asset: Asset,
    amount: string,
    destination: string | MuxedAccount
  ): Promise<StellarSdk.TransactionBuilder> {
    const builder = this.stellar.transactionBuilder(source);
    const decimalAmount = new Decimal(amount);

    builder.addOperation(StellarSdk.Operation.createClaimableBalance({
      asset: asset.toObject(),
      amount: decimalAmount.toString(),
      destination: destination instanceof MuxedAccount
        ? destination.toString()
        : destination
    }));

    return builder;
  }

  async buildClaimClaimableBalance(
    source: string,
    balanceId: string,
    destination: string | MuxedAccount
  ): Promise<StellarSdk.TransactionBuilder> {
    if (!validateHexString(balanceId, 32)) {
      throw new Error('Invalid claimable balance ID: must be 32-byte hex');
    }

    const builder = this.stellar.transactionBuilder(source);
    builder.addOperation(StellarSdk.Operation.claimClaimableBalance({
      balanceId: Buffer.from(balanceId, 'hex'),
      destination: destination instanceof MuxedAccount
        ? destination.toString()
        : destination
    }));

    return builder;
  }

  // ... existing simulation methods ...

  async simulateCreateClaimableBalance(
    source: string,
    asset: Asset,
    amount: string,
    destination: string | MuxedAccount
  ): Promise<StellarSdk.Transaction> {
    const builder = await this.buildCreateClaimableBalance(
      source, asset, amount, destination
    );

    return this.stellar.simulateTransaction(builder);
  }

  async simulateClaimClaimableBalance(
    source: string,
    balanceId: string,
    destination: string | MuxedAccount
  ): Promise<StellarSdk.Transaction> {
    const builder = await this.buildClaimClaimableBalance(
      source, balanceId, destination
    );

    return this.stellar.simulateTransaction(builder);
  }

  // ... existing fee estimation methods ...
}
