import { StellarSdk } from '../stellar/stellar-sdk';
import { Asset, MuxedAccount } from '../stellar/stellar.types';

export type OperationManifest = Record<OperationType, {
  label: string;
  description: string;
  fields: Array<{
    name: string;
    type: 'asset' | 'decimal' | 'account' | 'hex' | 'boolean' | 'string';
    required: boolean;
    muxed?: boolean;
    validation?: string;
  }>;
  feeCoefficient: number;
}>;

export type OperationType =
  | 'payment'
  | 'create_account'
  | 'change_trust'
  | 'manage_sell_offer'
  | 'manage_buy_offer'
  | 'create_passive_sell_offer'
  | 'set_options'
  | 'account_merge'
  | 'allow_trust'
  | 'set_trustline_flags'
  | 'clawback'
  | 'path_payment_strict_send'
  | 'path_payment_strict_receive'
  | 'manage_data'
  | 'liquidity_pool_deposit'
  | 'liquidity_pool_withdraw'
  | 'create_claimable_balance'
  | 'claim_claimable_balance';

export interface OperationBuilder {
  (source: string, ...args: any[]): Promise<StellarSdk.TransactionBuilder>;
}

export interface OperationSimulator {
  (source: string, ...args: any[]): Promise<StellarSdk.Transaction>;
}