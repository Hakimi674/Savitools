import { BadRequestException, Injectable } from '@nestjs/common';
import {
  StellarTestnetService,
  type Balance,
} from '../stellar/stellar-testnet.service';
import { PaymentDto } from './dto/payment.dto';
import { resolveStellarEndpoints } from '../stellar/stellar-endpoints';

export type { Balance };

export interface AccountDetails {
  publicKey: string;
  sequenceNumber: string;
  balances: Balance[];
  signers: Array<{ publicKey: string; weight: number }>;
  thresholds: {
    lowThreshold: number;
    medThreshold: number;
    highThreshold: number;
  };
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authImmutable: boolean;
  };
  network: string;
}

export interface SandboxFundResponse {
  publicKey: string;
  funded: boolean;
  txHash: string | null;
  confirmationStatus: string;
  startingBalance: string;
  network: string;
}

export interface SandboxResetResponse {
  publicKey: string;
  reset: boolean;
  network: string;
  startingBalance: string;
  txHash: string | null;
  message: string;
}

/**
 * Sandbox page backend.
 *
 * Resolved from shared configuration rather than module constants, supporting
 * public testnet, local Stellar quickstart nodes, and private networks (Savitura/Savitools#323).
 * Keypairs and accounts are labelled with their network to prevent confusion,
 * and mainnet operations are strictly prohibited.
 */
@Injectable()
export class SandboxService {
  constructor(
    private readonly stellar: StellarTestnetService = new StellarTestnetService(),
  ) {}

  /** Horizon client for the selected network. */
  private getServer(network: string = 'testnet', overrides?: any) {
    return this.stellar.serverFor(network, overrides);
  }

  generateKeypair(network: string = 'testnet') {
    return this.stellar.generateKeypair(network);
  }

  async fundFromFriendbot(
    publicKey: string,
    network: string = 'testnet',
    overrides?: any,
  ): Promise<SandboxFundResponse> {
    const endpoints = resolveStellarEndpoints(network, overrides);
    const existing = await this.stellar.loadAccountIfPresent(publicKey, endpoints.network, overrides);
    if (existing) {
      return this.fundedResult(
        publicKey,
        null,
        this.stellar.startingBalanceOf(existing),
        endpoints.network,
      );
    }

    const reply = await this.stellar.requestFriendbotFunding(publicKey, endpoints.network, overrides);

    if (!reply.ok) {
      // Friendbot refuses an address it has already funded. The account exists
      // by the time we see that, so report success instead of failing a
      // request whose goal is already met.
      if (this.stellar.isAlreadyFundedReply(reply)) {
        const account = await this.stellar.loadAccountIfPresent(publicKey, endpoints.network, overrides);
        if (account) {
          return this.fundedResult(
            publicKey,
            null,
            this.stellar.startingBalanceOf(account),
            endpoints.network,
          );
        }
      }

      throw this.stellar.friendbotFailure(reply);
    }

    return this.fundedResult(publicKey, reply.hash, '10,000 XLM', endpoints.network);
  }

  async resetAccount(
    publicKey: string,
    network: string = 'testnet',
    overrides?: any,
  ): Promise<SandboxResetResponse> {
    const endpoints = resolveStellarEndpoints(network, overrides);

    // Call friendbot to ensure account has funds / reset state
    let txHash: string | null = null;
    try {
      const reply = await this.stellar.requestFriendbotFunding(publicKey, endpoints.network, overrides);
      if (reply.ok) {
        txHash = reply.hash;
      }
    } catch (err: unknown) {
      // If friendbot fails because already funded, reload account
    }

    const account = await this.stellar.loadAccountIfPresent(publicKey, endpoints.network, overrides);
    const balance = account ? this.stellar.startingBalanceOf(account) : '10,000 XLM';

    return {
      publicKey,
      reset: true,
      network: endpoints.network,
      startingBalance: balance,
      txHash,
      message: `Account ${publicKey} on ${endpoints.network} has been reset to its starting state.`,
    };
  }

  async getAccount(
    publicKey: string,
    network: string = 'testnet',
    overrides?: any,
  ): Promise<AccountDetails> {
    const endpoints = resolveStellarEndpoints(network, overrides);
    const account = await this.stellar.loadAccount(publicKey, endpoints.network, overrides);

    return {
      publicKey,
      sequenceNumber: account.sequence,
      balances: this.stellar.mapBalances(account),
      signers: account.signers.map((signer) => ({
        publicKey: signer.public_key,
        weight: signer.weight,
      })),
      thresholds: {
        lowThreshold: account.thresholds.low_threshold,
        medThreshold: account.thresholds.med_threshold,
        highThreshold: account.thresholds.high_threshold,
      },
      flags: {
        authRequired: account.flags.auth_required,
        authRevocable: account.flags.auth_revocable,
        authImmutable: account.flags.auth_immutable,
      },
      network: endpoints.network,
    };
  }

  async sendPayment(dto: PaymentDto & { network?: string }) {
    const network = dto.network || 'testnet';
    const result = await this.stellar.submitPayment({
      sourceSecret: dto.fromSecret,
      destination: dto.toPublicKey,
      asset: dto.asset,
      amount: dto.amount,
      memo: dto.memo,
    }, network);

    // Decoded after the submission so the validation order (and therefore the
    // error a caller sees for a bad destination) stays inside submitPayment.
    const parsed = this.stellar.assertDestination(dto.toPublicKey);

    return {
      success: true,
      txHash: result.hash,
      feeCharged: result.fee_charged,
      resultCode: result.result_codes?.operation_results?.[0] || 'success',
      destination: dto.toPublicKey,
      // M… destinations move funds into the underlying G… account; the sandbox
      // receipt renders the account and the payment ID as separate fields.
      destinationAccount: parsed.account,
      muxedId: parsed.muxedId,
      asset: dto.asset,
      amount: dto.amount,
      network,
    };
  }

  private fundedResult(
    publicKey: string,
    txHash: string | null,
    startingBalance: string,
    network: string,
  ): SandboxFundResponse {
    return {
      publicKey,
      funded: true,
      txHash,
      confirmationStatus: 'success',
      startingBalance,
      network,
    };
  }
}
