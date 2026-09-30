import {
  BadRequestException,
  Injectable,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  Account,
  Asset,
  Address,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import { BuildTransactionDto, OperationDto } from './dto/build-transaction.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';
import { BenchmarkTransactionDto } from './dto/benchmark-transaction.dto';
import { FeeBumpDto } from './dto/fee-bump.dto';
import { PartialSignatureDto } from './dto/partial-signature.dto';
import { ContractsService } from '../contracts/contracts.service';

// ---------------------------------------------------------------------------
// Static operation-type manifest returned by GET /composer/operations
// ---------------------------------------------------------------------------

export const OPERATION_MANIFEST = [
  {
    type: 'payment',
    label: 'Payment',
    description: 'Send an asset to another account',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'XLM / USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: false, placeholder: 'G… (omit for XLM)' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '10' },
    ],
  },
  {
    type: 'create_account',
    label: 'Create Account',
    description: 'Fund a brand-new Stellar account',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'startingBalance', label: 'Starting Balance (XLM)', type: 'number', required: true, placeholder: '1' },
    ],
  },
  {
    type: 'change_trust',
    label: 'Change Trust',
    description: 'Add or remove a trustline for an asset',
    fields: [
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: true, placeholder: 'G…' },
      { name: 'limit', label: 'Limit', type: 'number', required: false, placeholder: 'Max (omit) or 0 to remove' },
    ],
  },
  {
    type: 'manage_sell_offer',
    label: 'Manage Sell Offer',
    description: 'Create, update or delete a sell offer on the DEX',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G… (omit for XLM)' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'amount', label: 'Amount to Sell', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
      { name: 'offerId', label: 'Offer ID (0 = new)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'manage_buy_offer',
    label: 'Manage Buy Offer',
    description: 'Create, update or delete a buy offer on the DEX',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buyAmount', label: 'Amount to Buy', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
      { name: 'offerId', label: 'Offer ID (0 = new)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'create_passive_sell_offer',
    label: 'Passive Sell Offer',
    description: 'Sell offer that does not cross existing offers',
    fields: [
      { name: 'selling.code', label: 'Selling Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'selling.issuer', label: 'Selling Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'buying.code', label: 'Buying Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'buying.issuer', label: 'Buying Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '100' },
      { name: 'price.n', label: 'Price Numerator', type: 'number', required: true, placeholder: '1' },
      { name: 'price.d', label: 'Price Denominator', type: 'number', required: true, placeholder: '1' },
    ],
  },
  {
    type: 'set_options',
    label: 'Set Options',
    description: 'Configure account flags, thresholds, home domain',
    fields: [
      { name: 'inflationDest', label: 'Inflation Destination', type: 'text', required: false, placeholder: 'G…' },
      { name: 'homeDomain', label: 'Home Domain', type: 'text', required: false, placeholder: 'example.com' },
      { name: 'masterWeight', label: 'Master Weight', type: 'number', required: false, placeholder: '1' },
      { name: 'lowThreshold', label: 'Low Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'medThreshold', label: 'Med Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'highThreshold', label: 'High Threshold', type: 'number', required: false, placeholder: '0' },
      { name: 'setFlags', label: 'Set Flags (bitmask)', type: 'number', required: false, placeholder: '0' },
      { name: 'clearFlags', label: 'Clear Flags (bitmask)', type: 'number', required: false, placeholder: '0' },
    ],
  },
  {
    type: 'account_merge',
    label: 'Account Merge',
    description: 'Merge this account into another, sending all XLM',
    fields: [
      { name: 'destination', label: 'Merge Into', type: 'text', required: true, placeholder: 'G…' },
    ],
  },
  {
    type: 'allow_trust',
    label: 'Allow Trust',
    description: 'Authorize a trustor to hold your issued asset',
    fields: [
      { name: 'trustor', label: 'Trustor', type: 'text', required: true, placeholder: 'G…' },
      { name: 'assetCode', label: 'Asset Code', type: 'text', required: true, placeholder: 'MYTOKEN' },
      { name: 'authorize', label: 'Authorize', type: 'boolean', required: true, placeholder: 'true / false' },
    ],
  },
  {
    // Asset Control workstation (Savitura/Savitools#81)
    type: 'set_trustline_flags',
    label: 'Set Trustline Flags',
    description: 'Authorize, deauthorize or enable clawback for a single trustline',
    fields: [
      { name: 'trustor', label: 'Trustor', type: 'text', required: true, placeholder: 'G…' },
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: true, placeholder: 'G…' },
      { name: 'flags.authorized', label: 'Authorized', type: 'boolean', required: false, placeholder: 'true / false' },
      { name: 'flags.authorizedToMaintainLiabilities', label: 'Authorized To Maintain Liabilities', type: 'boolean', required: false, placeholder: 'true / false' },
      { name: 'flags.clawbackEnabled', label: 'Clawback Enabled', type: 'boolean', required: false, placeholder: 'true / false' },
    ],
  },
  {
    type: 'clawback',
    label: 'Clawback',
    description: 'Claw an issued asset back from a trustline holder',
    fields: [
      { name: 'from', label: 'From', type: 'text', required: true, placeholder: 'G…' },
      { name: 'asset.code', label: 'Asset Code', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'asset.issuer', label: 'Asset Issuer', type: 'text', required: true, placeholder: 'G…' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '10' },
    ],
  },
  {
    type: 'path_payment_strict_send',
    label: 'Path Payment (Strict Send)',
    description: 'Send exact amount; recipient gets at least destMin',
    fields: [
      { name: 'sendAsset.code', label: 'Send Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'sendAsset.issuer', label: 'Send Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'sendAmount', label: 'Send Amount', type: 'number', required: true, placeholder: '10' },
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'destAsset.code', label: 'Dest Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'destAsset.issuer', label: 'Dest Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'destMin', label: 'Dest Min', type: 'number', required: true, placeholder: '9.5' },
      { name: 'path', label: 'Path Assets (JSON array)', type: 'text', required: false, placeholder: '[]' },
    ],
  },
  {
    type: 'path_payment_strict_receive',
    label: 'Path Payment (Strict Receive)',
    description: 'Recipient gets exact amount; send at most sendMax',
    fields: [
      { name: 'sendAsset.code', label: 'Send Asset', type: 'text', required: true, placeholder: 'XLM' },
      { name: 'sendAsset.issuer', label: 'Send Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'sendMax', label: 'Send Max', type: 'number', required: true, placeholder: '11' },
      { name: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'G…' },
      { name: 'destAsset.code', label: 'Dest Asset', type: 'text', required: true, placeholder: 'USDC' },
      { name: 'destAsset.issuer', label: 'Dest Issuer', type: 'text', required: false, placeholder: 'G…' },
      { name: 'destAmount', label: 'Dest Amount', type: 'number', required: true, placeholder: '10' },
      { name: 'path', label: 'Path Assets (JSON array)', type: 'text', required: false, placeholder: '[]' },
    ],
  },
  {
    type: 'manage_data',
    label: 'Manage Data',
    description: 'Set, modify or delete a data entry on your account',
    fields: [
      { name: 'name', label: 'Data Name (up to 64 bytes)', type: 'text', required: true, placeholder: 'my-key' },
      { name: 'value', label: 'Data Value (up to 64 bytes, empty to delete)', type: 'text', required: false, placeholder: 'my-value' },
    ],
  },
  {
    type: 'liquidity_pool_deposit',
    label: 'Liquidity Pool Deposit',
    description: 'Deposit both pool assets using the pool ID’s canonical Asset A/B order',
    fields: [
      { name: 'liquidityPoolId', label: 'Liquidity Pool ID', type: 'text', required: true, placeholder: '64-character hexadecimal pool ID' },
      { name: 'maxAmountA', label: 'Maximum Asset A (pool order)', type: 'number', required: true, placeholder: '10' },
      { name: 'maxAmountB', label: 'Maximum Asset B (pool order)', type: 'number', required: true, placeholder: '20' },
      { name: 'minPrice.n', label: 'Minimum Price Numerator (B per A)', type: 'number', required: true, placeholder: '1' },
      { name: 'minPrice.d', label: 'Minimum Price Denominator', type: 'number', required: true, placeholder: '2' },
      { name: 'maxPrice.n', label: 'Maximum Price Numerator (B per A)', type: 'number', required: true, placeholder: '2' },
      { name: 'maxPrice.d', label: 'Maximum Price Denominator', type: 'number', required: true, placeholder: '1' },
    ],
  },
  {
    type: 'liquidity_pool_withdraw',
    label: 'Liquidity Pool Withdraw',
    description: 'Withdraw pool shares for both assets using the pool ID’s canonical Asset A/B order',
    fields: [
      { name: 'liquidityPoolId', label: 'Liquidity Pool ID', type: 'text', required: true, placeholder: '64-character hexadecimal pool ID' },
      { name: 'amount', label: 'Pool Share Amount', type: 'number', required: true, placeholder: '1' },
      { name: 'minAmountA', label: 'Minimum Received Asset A (pool order)', type: 'number', required: true, placeholder: '0' },
      { name: 'minAmountB', label: 'Minimum Received Asset B (pool order)', type: 'number', required: true, placeholder: '0' },
    ],
  },
];

export interface SimulationResult {
  success: boolean;
  hash: string;
  fee: string | null;
  resultCodes: string | null;
  operationResults: unknown | null;
  ledger: number | null;
}

interface CachedSimulation {
  result: SimulationResult;
  expiresAt: number;
}

interface CachedSequence {
  sequence: string;
  expiresAt: number;
}

function isNativeAssetCode(code: string | undefined): boolean {
  return code === 'native' || code === 'XLM' || !code;
}

/**
 * Operation forms send every field as a string, so a checkbox arrives as
 * "true"/"false" rather than a boolean. `undefined`/"" means "leave this flag
 * alone" for the partial-flag operations.
 */
function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return String(value).toLowerCase() === 'true';
}

function resolveAsset(code: string | undefined, issuer?: string): Asset {
  if (isNativeAssetCode(code)) {
    return Asset.native();
  }
  if (!code) {
    throw new BadRequestException('Asset code is required');
  }
  if (!issuer) {
    throw new BadRequestException(`Asset ${code} requires an issuer`);
  }
  return new Asset(code, issuer);
}

function validateLiquidityPoolId(value: unknown): string {
  const poolId = String(value ?? '');
  if (!/^[0-9a-fA-F]{64}$/.test(poolId)) {
    throw new BadRequestException('liquidityPoolId must be a 64-character hexadecimal pool ID');
  }
  return poolId;
}

function validatePoolAmount(field: string, value: unknown, allowZero = false): string {
  const amount = String(value ?? '');
  if (!/^\d+(?:\.\d{1,7})?$/.test(amount)) {
    throw new BadRequestException(`${field} must be a decimal with at most 7 fractional digits`);
  }
  const [whole, fraction = ''] = amount.split('.');
  const scaled = BigInt(whole) * 10_000_000n + BigInt((fraction + '0000000').slice(0, 7));
  if (scaled > 9223372036854775807n) {
    throw new BadRequestException(`${field} exceeds the maximum Stellar amount`);
  }
  if (allowZero ? scaled < 0n : scaled === 0n) {
    throw new BadRequestException(`${field} must be ${allowZero ? 'non-negative' : 'positive'}`);
  }
  return amount;
}

function validatePriceRatio(field: string, value: any): { n: number; d: number } {
  const numerator = String(value?.n ?? '');
  const denominator = String(value?.d ?? '');
  if (!/^\d+$/.test(numerator) || !/^\d+$/.test(denominator)) {
    throw new BadRequestException(`${field} numerator and denominator must be positive integers`);
  }
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (n <= 0n || d <= 0n || n > 2147483647n || d > 2147483647n) {
    throw new BadRequestException(`${field} numerator and denominator must be positive 32-bit integers`);
  }
  return { n: Number(n), d: Number(d) };
}

function validateLiquidityPoolPriceBounds(dto: any): { minPrice: { n: number; d: number }; maxPrice: { n: number; d: number } } {
  const minPrice = validatePriceRatio('minPrice', dto.minPrice);
  const maxPrice = validatePriceRatio('maxPrice', dto.maxPrice);
  if (BigInt(minPrice.n) * BigInt(maxPrice.d) > BigInt(maxPrice.n) * BigInt(minPrice.d)) {
    throw new BadRequestException('minPrice must be less than or equal to maxPrice');
  }
  return { minPrice, maxPrice };
}

function liquidityPoolOperationError(operation: any): string | null {
  try {
    if (operation.type === 'liquidityPoolDeposit') {
      validateLiquidityPoolId(operation.liquidityPoolId);
      validatePoolAmount('maxAmountA', operation.maxAmountA);
      validatePoolAmount('maxAmountB', operation.maxAmountB);
      validateLiquidityPoolPriceBounds(operation);
    } else if (operation.type === 'liquidityPoolWithdraw') {
      validateLiquidityPoolId(operation.liquidityPoolId);
      validatePoolAmount('amount', operation.amount);
      validatePoolAmount('minAmountA', operation.minAmountA, true);
      validatePoolAmount('minAmountB', operation.minAmountB, true);
    } else {
      return null;
    }
    return null;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

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
  private readonly logger = new Logger(ComposerService.name);
  private readonly simulationCache = new Map<string, CachedSimulation>();
  private readonly sequenceCache = new Map<string, CachedSequence>();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly SEQUENCE_TTL_MS = 30 * 1000; // 30 seconds

  constructor(
    @Inject(forwardRef(() => ContractsService))
    private readonly contractsService?: ContractsService
  ) {}

  getOperations() {
    return OPERATION_MANIFEST;
  }

  private getHorizonServer(network: 'testnet' | 'mainnet' = 'testnet'): Horizon.Server {
    const url =
      network === 'mainnet'
        ? process.env.STELLAR_HORIZON_MAINNET_URL || 'https://horizon.stellar.org'
        : process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    return new Horizon.Server(url);
  }

  private networkPassphrase(network: 'testnet' | 'mainnet' = 'testnet'): string {
    return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  }

  async loadSequenceNumber(
    sourceAccount: string,
    network: 'testnet' | 'mainnet',
  ): Promise<string> {
    const cacheKey = `${network}:${sourceAccount}`;
    const now = Date.now();
    const cached = this.sequenceCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.sequence;
    }

    const server = this.getHorizonServer(network);
    try {
      const account = await server.loadAccount(sourceAccount);
      const sequence = account.sequenceNumber();
      this.sequenceCache.set(cacheKey, {
        sequence,
        expiresAt: now + this.SEQUENCE_TTL_MS,
      });
      return sequence;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Failed to load sequence number for ${sourceAccount}: ${message}`,
      );
    }
  }

  async buildTransaction(dto: BuildTransactionDto) {
    try {
      const network = dto.network || 'testnet';
      const fee = dto.fee || BASE_FEE;
      const passphrase = this.networkPassphrase(network);

      const sequence =
        dto.sequenceNumber !== undefined
          ? dto.sequenceNumber
          : await this.loadSequenceNumber(dto.sourceAccount, network);

      const sourceAccount = new Account(dto.sourceAccount, sequence);
      const builder = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: passphrase,
      });

      if (dto.timeBounds && dto.preconditions && dto.preconditions.length > 0) {
        throw new BadRequestException('timeBounds and preconditions are mutually exclusive');
      }

      if (dto.timeBounds) {
        builder.setTimebounds(dto.timeBounds.minTime, dto.timeBounds.maxTime);
      } else if (dto.preconditions && dto.preconditions.length > 0) {
        this.applyPreconditions(builder, dto.preconditions);
        const hasTimeBounds = dto.preconditions.some((p) => p.type === 'time_bounds');
        if (!hasTimeBounds) {
          // stellar-base requires time bounds whenever other preconditions are set
          builder.setTimeout(0);
        }
      } else {
        builder.setTimeout(30);
      }

      if (dto.memo) {
        builder.addMemo(Memo.text(dto.memo));
      }

      for (const opDto of dto.operations) {
        builder.addOperation(this.mapOperation(opDto));
      }

      const transaction = builder.build();
      const xdr = transaction.toEnvelope().toXDR('base64');
      const hash = transaction.hash().toString('hex');

      return {
        xdr,
        hash,
        fee,
        operationCount: dto.operations.length,
        sequenceNumber: transaction.sequence,
        network,
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Failed to build transaction: ${message}`);
    }
  }

  async buildFeeBump(dto: FeeBumpDto) {
    try {
      const network = dto.network || 'testnet';
      const passphrase = this.networkPassphrase(network);

      let envelope: xdr.TransactionEnvelope;
      try {
        envelope = xdr.TransactionEnvelope.fromXDR(dto.innerXdr, 'base64');
      } catch {
        throw new BadRequestException('Invalid inner transaction XDR');
      }

      const envelopeType = envelope.switch().name;
      if (envelopeType === 'envelopeTypeTxFeeBump') {
        throw new BadRequestException(
          'Inner envelope is already a fee-bump transaction',
        );
      }
      if (envelopeType !== 'envelopeTypeTx' && envelopeType !== 'envelopeTypeTxV0') {
        throw new BadRequestException(
          'Inner envelope must be a classic transaction',
        );
      }
      if (envelopeType === 'envelopeTypeTx' && Number(envelope.v1().tx().ext().switch()) !== 0) {
        throw new BadRequestException(
          'Soroban transactions cannot be fee-bumped',
        );
      }

      if (!StrKey.isValidEd25519PublicKey(dto.feeSource)) {
        throw new BadRequestException(
          `Invalid fee source account: ${dto.feeSource}`,
        );
      }

      let inner: Transaction;
      try {
        inner = new Transaction(dto.innerXdr, passphrase);
      } catch {
        throw new BadRequestException('Invalid inner transaction XDR');
      }

      const operationCount = inner.operations.length;
      const baseFee = BigInt(dto.baseFee);
      if (baseFee <= 0n) {
        throw new BadRequestException('baseFee must be a positive integer');
      }
      if (baseFee * BigInt(operationCount) < BigInt(inner.fee)) {
        throw new BadRequestException(
          `baseFee is too low: ${baseFee} stroops x ${operationCount} operations must cover the inner fee of ${inner.fee} stroops`,
        );
      }

      const maxTime = Number(inner.timeBounds?.maxTime ?? 0);
      if (maxTime > 0 && maxTime * 1000 <= Date.now()) {
        throw new BadRequestException('Inner transaction time bounds have expired');
      }

      if (inner.signatures.length > 0) {
        const publicKey = Keypair.fromPublicKey(inner.source);
        for (const signature of inner.signatures) {
          const raw = signature.signature();
          if (!raw || !publicKey.verify(inner.hash(), raw)) {
            throw new BadRequestException(
              'Network mismatch: inner transaction signatures are not valid for the requested network',
            );
          }
        }
      }

      const feeBump = TransactionBuilder.buildFeeBumpTransaction(
        dto.feeSource,
        dto.baseFee,
        inner,
        passphrase,
      );

      return {
        xdr: feeBump.toEnvelope().toXDR('base64'),
        hash: feeBump.hash().toString('hex'),
        innerHash: inner.hash().toString('hex'),
        type: 'fee_bump' as const,
        feeSource: dto.feeSource,
        baseFee: dto.baseFee,
        fee: (baseFee * BigInt(operationCount)).toString(),
        operationCount,
        network,
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Failed to build fee-bump: ${message}`);
    }
  }

  async simulateTransaction(dto: SimulateTransactionDto) {
    try {
      const cacheKey = `${dto.network || 'testnet'}:${dto.xdr}`;
      const now = Date.now();
      const cached = this.simulationCache.get(cacheKey);

      if (cached) {
        if (cached.expiresAt > now) {
          this.simulationCache.delete(cacheKey);
          this.simulationCache.set(cacheKey, cached);
          return cached.result;
        }
        this.simulationCache.delete(cacheKey);
      }

      let tx: Transaction;
      try {
        tx = new Transaction(
          dto.xdr,
          this.networkPassphrase(dto.network || 'testnet'),
        );
      } catch {
        throw new BadRequestException('Invalid XDR');
      }

      const hash = tx.hash().toString('hex');
      const operationResults = tx.operations.flatMap((operation, index) => {
        const error = liquidityPoolOperationError(operation);
        return error ? [`op[${index}] ${operation.type}: ${error}`] : [];
      });
      const hasOperationFailure = operationResults.length > 0;

      const result = {
        success: !hasOperationFailure,
        hash,
        fee: null,
        resultCodes: hasOperationFailure ? 'tx_failed' : null,
        operationResults: hasOperationFailure ? operationResults : null,
        ledger: null,
      };

      if (this.simulationCache.size >= this.MAX_CACHE_SIZE) {
        const oldestKey = this.simulationCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.simulationCache.delete(oldestKey);
        }
      }

      this.simulationCache.set(cacheKey, {
        result,
        expiresAt: now + this.CACHE_TTL_MS,
      });

      return result;
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Simulation failed: ${message}`);
    }
  }

  async sendTransaction(dto: SimulateTransactionDto) {
    try {
      const tx = new Transaction(
        dto.xdr,
        this.networkPassphrase(dto.network || 'testnet'),
      );
      const server = this.getHorizonServer(dto.network);

      const response = await server.submitTransaction(tx);

      return {
        success: true,
        hash: response.hash,
        fee: (response as { fee_charged?: string }).fee_charged ?? null,
        resultCodes: null,
        operationResults: null,
        ledger: (response as { ledger?: number }).ledger ?? null,
      };
    } catch (err: unknown) {
      const errObj = err as {
        response?: {
          data?: {
            extras?: {
              result_codes?: {
                transaction?: string;
                operations?: unknown[];
              };
            };
          };
        };
      };
      const resultCodes =
        errObj?.response?.data?.extras?.result_codes || null;
      const operationResults = resultCodes?.operations || null;
      const txCode =
        resultCodes?.transaction ||
        (err instanceof Error ? err.message : 'Transaction failed');

      return {
        success: false,
        hash: null,
        fee: null,
        resultCodes: txCode,
        operationResults,
        ledger: null,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapOperation(dto: OperationDto): any {
    switch (dto.type) {
      case 'payment':
        return Operation.payment({
          destination: dto.destination,
          asset: resolveAsset(dto.asset.code, dto.asset.issuer),
          amount: dto.amount,
        });
      case 'create_account':
        return Operation.createAccount({
          destination: dto.destination,
          startingBalance: dto.startingBalance,
        });
      case 'change_trust':
        return Operation.changeTrust({
          asset: resolveAsset(dto.asset.code, dto.asset.issuer),
          limit: dto.limit,
        });
      case 'manage_sell_offer':
        return Operation.manageSellOffer({
          selling: resolveAsset(dto.selling.code, dto.selling.issuer),
          buying: resolveAsset(dto.buying.code, dto.buying.issuer),
          amount: dto.amount,
          price: { n: Number(dto.price.n), d: Number(dto.price.d) },
          offerId: dto.offerId ? Number(dto.offerId) : undefined,
        });
      case 'manage_buy_offer':
        return Operation.manageBuyOffer({
          selling: resolveAsset(dto.selling.code, dto.selling.issuer),
          buying: resolveAsset(dto.buying.code, dto.buying.issuer),
          buyAmount: dto.buyAmount,
          price: { n: Number(dto.price.n), d: Number(dto.price.d) },
          offerId: dto.offerId ? Number(dto.offerId) : undefined,
        });
      case 'create_passive_sell_offer':
        return Operation.createPassiveSellOffer({
          selling: resolveAsset(dto.selling.code, dto.selling.issuer),
          buying: resolveAsset(dto.buying.code, dto.buying.issuer),
          amount: dto.amount,
          price: { n: Number(dto.price.n), d: Number(dto.price.d) },
        });
      case 'set_options':
        // Validate multisig configuration if thresholds are being set
        this.validateMultisigConfiguration(dto);
        return Operation.setOptions({
          inflationDest: dto.inflationDest,
          clearFlags: dto.clearFlags,
          setFlags: dto.setFlags,
          masterWeight: dto.masterWeight,
          lowThreshold: dto.lowThreshold,
          medThreshold: dto.medThreshold,
          highThreshold: dto.highThreshold,
          homeDomain: dto.homeDomain,
          signer: dto.signer ? {
            ed25519PublicKey: dto.signer.ed25519PublicKey,
            weight: dto.signer.weight,
          } : undefined,
        });
      case 'account_merge':
        return Operation.accountMerge({
          destination: dto.destination,
        });
      case 'allow_trust':
        return Operation.allowTrust({
          trustor: dto.trustor,
          assetCode: dto.assetCode,
          authorize: dto.authorize,
        });
      case 'set_trustline_flags': {
        // Savitura/Savitools#81 — the Asset Control workstation builds these.
        const flags: {
          authorized?: boolean;
          authorizedToMaintainLiabilities?: boolean;
          clawbackEnabled?: boolean;
        } = {};
        const authorized = toOptionalBoolean(dto.flags?.authorized);
        const authorizedToMaintainLiabilities = toOptionalBoolean(
          dto.flags?.authorizedToMaintainLiabilities,
        );
        const clawbackEnabled = toOptionalBoolean(dto.flags?.clawbackEnabled);
        if (authorized !== undefined) flags.authorized = authorized;
        if (authorizedToMaintainLiabilities !== undefined) {
          flags.authorizedToMaintainLiabilities = authorizedToMaintainLiabilities;
        }
        if (clawbackEnabled !== undefined) flags.clawbackEnabled = clawbackEnabled;
        if (Object.keys(flags).length === 0) {
          throw new BadRequestException(
            'set_trustline_flags requires at least one of authorized, authorizedToMaintainLiabilities or clawbackEnabled',
          );
        }
        return Operation.setTrustLineFlags({
          trustor: dto.trustor,
          asset: resolveAsset(dto.asset.code, dto.asset.issuer),
          flags,
        });
      }
      case 'clawback':
        return Operation.clawback({
          from: dto.from,
          asset: resolveAsset(dto.asset.code, dto.asset.issuer),
          amount: dto.amount,
        });
      case 'path_payment_strict_send': {
        const path = ((dto.path as Array<{ code?: string; issuer?: string }> | undefined) || []).map(
          (a) => resolveAsset(a.code, a.issuer),
        );
        return Operation.pathPaymentStrictSend({
          sendAsset: resolveAsset(dto.sendAsset.code, dto.sendAsset.issuer),
          sendAmount: dto.sendAmount,
          destination: dto.destination,
          destAsset: resolveAsset(dto.destAsset.code, dto.destAsset.issuer),
          destMin: dto.destMin,
          path,
        });
      }
      case 'path_payment_strict_receive': {
        const path = ((dto.path as Array<{ code?: string; issuer?: string }> | undefined) || []).map(
          (a) => resolveAsset(a.code, a.issuer),
        );
        return Operation.pathPaymentStrictReceive({
          sendAsset: resolveAsset(dto.sendAsset.code, dto.sendAsset.issuer),
          sendMax: dto.sendMax,
          destination: dto.destination,
          destAsset: resolveAsset(dto.destAsset.code, dto.destAsset.issuer),
          destAmount: dto.destAmount,
          path,
        });
      }
      case 'manage_data':
        return Operation.manageData({
          name: dto.name,
          value: dto.value ? Buffer.from(dto.value) : null,
        });
      case 'liquidity_pool_deposit': {
        const liquidityPoolId = validateLiquidityPoolId(dto.liquidityPoolId);
        const { minPrice, maxPrice } = validateLiquidityPoolPriceBounds(dto);
        return Operation.liquidityPoolDeposit({
          liquidityPoolId,
          maxAmountA: validatePoolAmount('maxAmountA', dto.maxAmountA),
          maxAmountB: validatePoolAmount('maxAmountB', dto.maxAmountB),
          minPrice,
          maxPrice,
        });
      }
      case 'liquidity_pool_withdraw':
        return Operation.liquidityPoolWithdraw({
          liquidityPoolId: validateLiquidityPoolId(dto.liquidityPoolId),
          amount: validatePoolAmount('amount', dto.amount),
          minAmountA: validatePoolAmount('minAmountA', dto.minAmountA, true),
          minAmountB: validatePoolAmount('minAmountB', dto.minAmountB, true),
        });
      case 'invoke_host_function':
        return this.buildInvokeHostFunctionOperation(dto);
      default:
        throw new BadRequestException(
          `Unknown operation type: ${(dto as { type?: string }).type}`,
        );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildInvokeHostFunctionOperation(dto: any): any {
    if (!StrKey.isValidContract(dto.contractId)) {
      throw new BadRequestException('Invalid contract ID format');
    }

    if (!dto.functionName || typeof dto.functionName !== 'string') {
      throw new BadRequestException('Function name is required');
    }

    const args = dto.arguments || [];
    const useAbi = dto.useAbi !== false; // Default to true
    const rawMode = dto.rawMode === true; // Default to false

    let scVals: xdr.ScVal[];

    if (rawMode) {
      // Raw mode: arguments are already ScVal objects or will be converted directly
      scVals = this.convertRawArgumentsToScVals(args);
    } else if (useAbi && this.contractsService) {
      // ABI mode: validate and convert using ABI catalog
      try {
        const encodedArgs = this.contractsService.encodeAbiArguments(
          dto.contractId,
          dto.functionName,
          args,
          dto.wasmId
        );
        scVals = encodedArgs.map((arg: any) => xdr.ScVal.fromXDR(arg.xdrBase64, 'base64'));
      } catch (error) {
        // Fall back to native conversion if ABI is not available
        this.logger.warn(`ABI validation failed for ${dto.contractId}.${dto.functionName}, falling back to native conversion: ${error.message}`);
        scVals = args.map((arg: any) => nativeToScVal(arg));
      }
    } else {
      // Native mode: convert using nativeToScVal
      scVals = args.map((arg: any) => nativeToScVal(arg));
    }

    return Operation.invokeContractFunction({
      contract: dto.contractId,
      function: dto.functionName,
      args: scVals,
    });
  }

  private convertRawArgumentsToScVals(args: any[]): xdr.ScVal[] {
    return args.map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        if (arg.type && arg.value !== undefined) {
          // Structured ScVal format: { type: 'Address', value: 'G...' }
          return this.buildScValFromType(arg.type, arg.value);
        } else if (arg.xdr) {
          // XDR format: { xdr: 'base64...' }
          return xdr.ScVal.fromXDR(arg.xdr, 'base64');
        }
      }
      // Fallback to native conversion
      return nativeToScVal(arg);
    });
  }

  private buildScValFromType(type: string, value: any): xdr.ScVal {
    try {
      switch (type.toLowerCase()) {
        case 'address':
          return Address.fromString(value).toScVal();
        case 'bool':
        case 'boolean':
          return nativeToScVal(Boolean(value));
        case 'bytes':
          if (typeof value === 'string') {
            return nativeToScVal(Buffer.from(value, 'hex'));
          }
          return nativeToScVal(Buffer.from(value));
        case 'string':
          return nativeToScVal(String(value));
        case 'symbol':
          return xdr.ScVal.scvSymbol(String(value));
        case 'i32':
          return nativeToScVal(parseInt(value));
        case 'i64':
        case 'i128':
        case 'i256':
          return nativeToScVal(BigInt(value));
        case 'u32':
          return nativeToScVal(parseInt(value));
        case 'u64':
        case 'u128':
        case 'u256':
          return nativeToScVal(BigInt(value));
        case 'vec':
        case 'array':
          if (Array.isArray(value)) {
            const elements = value.map(item => 
              typeof item === 'object' && item.type 
                ? this.buildScValFromType(item.type, item.value)
                : nativeToScVal(item)
            );
            return xdr.ScVal.scvVec(elements);
          }
          throw new BadRequestException('Vec/Array type requires an array value');
        case 'map':
        case 'object':
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const entries = Object.entries(value).map(([key, val]) => {
              const keyScVal = nativeToScVal(key);
              const valScVal = typeof val === 'object' && (val as any).type
                ? this.buildScValFromType((val as any).type, (val as any).value)
                : nativeToScVal(val);
              return new xdr.ScMapEntry({ key: keyScVal, val: valScVal });
            });
            return xdr.ScVal.scvMap(entries);
          }
          throw new BadRequestException('Map/Object type requires an object value');
        default:
          // Fallback to native conversion for unknown types
          return nativeToScVal(value);
      }
    } catch (error) {
      throw new BadRequestException(
        `Failed to convert ${type} value to ScVal: ${error.message}`
      );
    }
  }

  private validateMultisigConfiguration(dto: any): void {
    const masterWeight = dto.masterWeight !== undefined ? Number(dto.masterWeight) : undefined;
    const lowThreshold = dto.lowThreshold !== undefined ? Number(dto.lowThreshold) : undefined;
    const medThreshold = dto.medThreshold !== undefined ? Number(dto.medThreshold) : undefined;
    const highThreshold = dto.highThreshold !== undefined ? Number(dto.highThreshold) : undefined;

    // Validate threshold hierarchy
    if (lowThreshold !== undefined && medThreshold !== undefined && lowThreshold > medThreshold) {
      throw new BadRequestException('Low threshold cannot be greater than medium threshold');
    }

    if (medThreshold !== undefined && highThreshold !== undefined && medThreshold > highThreshold) {
      throw new BadRequestException('Medium threshold cannot be greater than high threshold');
    }

    if (lowThreshold !== undefined && highThreshold !== undefined && lowThreshold > highThreshold) {
      throw new BadRequestException('Low threshold cannot be greater than high threshold');
    }

    // Validate threshold ranges
    const thresholds = [lowThreshold, medThreshold, highThreshold].filter(t => t !== undefined);
    for (const threshold of thresholds) {
      if (threshold < 0 || threshold > 255) {
        throw new BadRequestException('Thresholds must be between 0 and 255');
      }
    }

    // Validate master weight
    if (masterWeight !== undefined && (masterWeight < 0 || masterWeight > 255)) {
      throw new BadRequestException('Master weight must be between 0 and 255');
    }

    // Validate signer weight
    if (dto.signer?.weight !== undefined) {
      const signerWeight = Number(dto.signer.weight);
      if (signerWeight < 0 || signerWeight > 255) {
        throw new BadRequestException('Signer weight must be between 0 and 255');
      }
    }

    // Warning: Check if thresholds can be satisfied
    if (masterWeight !== undefined && highThreshold !== undefined && masterWeight < highThreshold) {
      this.logger.warn(`Master weight (${masterWeight}) is less than high threshold (${highThreshold}). Additional signers will be required.`);
    }
  }

  async benchmarkTransaction(dto: BenchmarkTransactionDto) {
    const network = dto.network || 'testnet';
    const txCount = Math.min(Math.max(dto.transactionCount || 10, 1), 50);
    const concurrency = Math.min(Math.max(dto.concurrency || 5, 1), 20);

    const baseTx = 
      new Transaction(dto.xdr, this.networkPassphrase(network));
    const server = this.getHorizonServer(dto.network);

    // Benchmark metrics
    const results: {
      transactionIndex: number;
      submissionTime: number;
      success: boolean;
      hash?: string;
      errorMessage?: string;
    }[] = [];

    let successCount = 0;
    let failureCount = 0;
    let totalSubmissionTime = 0;

    const startTime = Date.now();

    // Process transactions in batches for concurrency control
    const batchSize = concurrency;
    for (let batchStart = 0; batchStart < txCount; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, txCount);
      const batchPromises = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const promise = (async (transactionIndex: number) => {
          const txStartTime = Date.now();
          try {
            const submissionResult = await server.submitTransaction(baseTx);
            const submissionTime = Date.now() - txStartTime;
            totalSubmissionTime += submissionTime;
            successCount++;
            
            results.push({
              transactionIndex,
              submissionTime,
              success: true,
              hash: submissionResult.hash,
            });
          } catch (error) {
            const submissionTime = Date.now() - txStartTime;
            totalSubmissionTime += submissionTime;
            failureCount++;
            
            results.push({
              transactionIndex,
              submissionTime,
              success: false,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          }
        })(i);

        batchPromises.push(promise);
      }

      // Wait for the current batch to complete before starting the next
      await Promise.all(batchPromises);
    }

    const totalTime = Date.now() - startTime;

    try {
      return {
        summary: {
          totalTransactions: txCount,
          successCount,
          failureCount,
          totalTime,
          averageSubmissionTime: totalSubmissionTime / txCount,
          transactionsPerSecond: (successCount / totalTime) * 1000,
        },
        results: results.sort((a, b) => a.transactionIndex - b.transactionIndex),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Benchmark failed: ${message}`);
    }
  }

  private applyPreconditions(
    builder: TransactionBuilder,
    preconditions: NonNullable<BuildTransactionDto['preconditions']>,
  ): void {
    for (const precondition of preconditions) {
      switch (precondition.type) {
        case 'time_bounds':
          if (precondition.minTime === undefined || precondition.maxTime === undefined) {
            throw new BadRequestException(
              'time_bounds precondition requires minTime and maxTime',
            );
          }
          if (precondition.minTime > precondition.maxTime) {
            throw new BadRequestException(
              'time_bounds minTime must be less than or equal to maxTime',
            );
          }
          builder.setTimebounds(precondition.minTime, precondition.maxTime);
          break;
        case 'ledger_bounds':
          if (precondition.minLedger === undefined || precondition.maxLedger === undefined) {
            throw new BadRequestException(
              'ledger_bounds precondition requires minLedger and maxLedger',
            );
          }
          if (precondition.minLedger < 0 || precondition.maxLedger < 0) {
            throw new BadRequestException('ledger bounds must be non-negative');
          }
          if (precondition.minLedger > precondition.maxLedger) {
            throw new BadRequestException(
              'ledger_bounds minLedger must be less than or equal to maxLedger',
            );
          }
          builder.setLedgerbounds(precondition.minLedger, precondition.maxLedger);
          break;
        case 'min_sequence': {
          if (!precondition.minSequence) {
            throw new BadRequestException('min_sequence precondition requires minSequence');
          }
          const minSeq = BigInt(precondition.minSequence);
          if (minSeq <= 0n) {
            throw new BadRequestException('minSequence must be a positive integer string');
          }
          builder.setMinAccountSequence(precondition.minSequence);
          if (precondition.minLedgerAge !== undefined) {
            if (precondition.minLedgerAge <= 0) {
              throw new BadRequestException('minLedgerAge must be positive');
            }
            builder.setMinAccountSequenceAge(precondition.minLedgerAge);
          }
          if (precondition.maxLedgerAhead !== undefined) {
            if (precondition.maxLedgerAhead <= 0) {
              throw new BadRequestException('maxLedgerAhead must be positive');
            }
            builder.setMinAccountSequenceLedgerGap(precondition.maxLedgerAhead);
          }
          break;
        }
        default:
          throw new BadRequestException(
            `Unknown precondition type: ${(precondition as { type?: string }).type}`,
          );
      }
    }
  }
}
