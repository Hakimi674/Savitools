import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { fetchFromHorizon, getHorizonUrl, parseAssetParams } from './horizon.util';
import {
  DepositResult,
  WithdrawalResult,
  formatPoolFee,
  fromStroops,
  quoteDeposit,
  quoteWithdrawal,
  toStroops,
  depositMinShares,
  withdrawalMinAmounts,
} from './lp-math';
import { PoolQuoteDto } from './dto/pool-quote.dto';

// ─── Horizon response shapes ──────────────────────────────────────────────

interface HorizonLpReserve {
  asset: string;   // "native" or "CODE:ISSUER"
  amount: string;  // decimal string with 7 decimal places
}

interface HorizonLpRecord {
  id: string;
  fee_bp: number;
  total_shares: string;
  reserves: [HorizonLpReserve, HorizonLpReserve];
  total_trustlines: number;
  type: string;
}

interface HorizonLpPage {
  _embedded: {
    records: HorizonLpRecord[];
  };
}

// ─── Result shapes ─────────────────────────────────────────────────────────

export interface PoolQuoteAsset {
  asset: string;
  reserve: string;
}

export interface PoolQuoteBase {
  poolId: string;
  network: string;
  scenario: 'deposit' | 'withdrawal';
  assetA: PoolQuoteAsset;
  assetB: PoolQuoteAsset;
  totalShares: string;
  feePct: string;
  /** A/B spot price: how much A per 1 B, formatted to 7 dp */
  spotPriceAperB: string;
  /** B/A spot price: how much B per 1 A, formatted to 7 dp */
  spotPriceBperA: string;
  /** Price impact in basis points (hundredths of a percent) */
  priceImpactBps: string;
}

export interface DepositQuoteResult extends PoolQuoteBase {
  scenario: 'deposit';
  depositA: string;
  depositB: string;
  sharesOut: string;
  /** Minimum acceptable shares at 0.5 % default slippage */
  minSharesOut: string;
  /** Composer-ready fields */
  composerHint: {
    operation: 'liquidityPoolDeposit';
    poolId: string;
    maxAmountA: string;
    maxAmountB: string;
    minPrice: string;
    maxPrice: string;
  };
}

export interface WithdrawalQuoteResult extends PoolQuoteBase {
  scenario: 'withdrawal';
  sharesToBurn: string;
  reserveAOut: string;
  reserveBOut: string;
  /** Minimum reserves at 0.5 % default slippage */
  minReserveAOut: string;
  minReserveBOut: string;
  /** Composer-ready fields */
  composerHint: {
    operation: 'liquidityPoolWithdraw';
    poolId: string;
    amount: string;
    minAmountA: string;
    minAmountB: string;
  };
}

export type PoolQuoteResult = DepositQuoteResult | WithdrawalQuoteResult;

// ─── service ──────────────────────────────────────────────────────────────

@Injectable()
export class PoolQuoteService {
  private readonly logger = new Logger(PoolQuoteService.name);

  // ── pool lookup ────────────────────────────────────────────────────────

  private async fetchPoolById(
    horizonUrl: string,
    poolId: string,
  ): Promise<HorizonLpRecord> {
    const url = `${horizonUrl}/liquidity_pools/${encodeURIComponent(poolId)}`;
    try {
      return (await fetchFromHorizon(url)) as HorizonLpRecord;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new NotFoundException(`Pool "${poolId}" not found: ${msg}`);
    }
  }

  private async fetchPoolByAssets(
    horizonUrl: string,
    assetA: string,
    assetB: string,
  ): Promise<HorizonLpRecord> {
    // Horizon accepts comma-separated "reserves" query param
    const reservesParam = [assetA, assetB]
      .map((a) => (a === 'XLM' ? 'native' : a))
      .join(',');
    const url = `${horizonUrl}/liquidity_pools?reserves=${encodeURIComponent(reservesParam)}&limit=1`;
    let page: HorizonLpPage;
    try {
      page = (await fetchFromHorizon(url)) as HorizonLpPage;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`LP lookup failed: ${msg}`);
    }

    const records = page._embedded?.records ?? [];
    if (records.length === 0) {
      throw new NotFoundException(
        `No liquidity pool found for ${assetA} / ${assetB} on this network. ` +
        'Verify the asset pair and canonical ordering.',
      );
    }
    return records[0];
  }

  private async resolvePool(
    horizonUrl: string,
    dto: PoolQuoteDto,
  ): Promise<HorizonLpRecord> {
    if (dto.poolId) {
      return this.fetchPoolById(horizonUrl, dto.poolId);
    }
    // validate asset strings before the network call
    parseAssetParams(dto.assetA!);
    parseAssetParams(dto.assetB!);
    return this.fetchPoolByAssets(horizonUrl, dto.assetA!, dto.assetB!);
  }

  // ── validation helpers ─────────────────────────────────────────────────

  private requireAmountFor(field: string, value: string | undefined): string {
    if (!value || value.trim() === '') {
      throw new BadRequestException(
        `${field} is required for this scenario`,
      );
    }
    return value.trim();
  }

  private assertNoInput(...values: (string | undefined)[]): void {
    // Used to catch callers accidentally mixing deposit and withdrawal params
    for (const v of values) {
      if (v !== undefined && v.trim() !== '') return;
    }
  }

  // ── shared formatting ──────────────────────────────────────────────────

  private buildBase(
    pool: HorizonLpRecord,
    network: string,
    scenario: 'deposit' | 'withdrawal',
    spotA: bigint,
    spotB: bigint,
    impactPpm: bigint,
  ): PoolQuoteBase {
    const [ra, rb] = pool.reserves;
    return {
      poolId: pool.id,
      network,
      scenario,
      assetA: { asset: ra.asset, reserve: ra.amount },
      assetB: { asset: rb.asset, reserve: rb.amount },
      totalShares: pool.total_shares,
      feePct: formatPoolFee(pool.fee_bp),
      spotPriceAperB: fromStroops(spotA),
      spotPriceBperA: fromStroops(spotB),
      // ppm → bps: 1 bps = 100 ppm
      priceImpactBps: (impactPpm / 100n).toString(),
    };
  }

  // ── deposit quote ──────────────────────────────────────────────────────

  private buildDepositQuote(
    pool: HorizonLpRecord,
    network: string,
    dto: PoolQuoteDto,
  ): DepositQuoteResult {
    const reserveA = toStroops(pool.reserves[0].amount);
    const reserveB = toStroops(pool.reserves[1].amount);
    const totalShares = toStroops(pool.total_shares);

    // Exactly one of amountA / amountB must be supplied
    if (!dto.amountA && !dto.amountB) {
      throw new BadRequestException(
        'Deposit scenario requires amountA or amountB',
      );
    }
    if (dto.amountA && dto.amountB) {
      throw new BadRequestException(
        'Provide amountA OR amountB for a deposit quote, not both',
      );
    }

    const result: DepositResult = quoteDeposit({
      reserveA,
      reserveB,
      totalShares,
      depositA: dto.amountA ? toStroops(dto.amountA) : undefined,
      depositB: dto.amountB ? toStroops(dto.amountB) : undefined,
    });

    const DEFAULT_SLIPPAGE = 0.5;
    const minSharesOut = depositMinShares(result.sharesOut, DEFAULT_SLIPPAGE);

    const base = this.buildBase(
      pool, network, 'deposit',
      result.spotPriceAperB, result.spotPriceBperA, result.priceImpactPpm,
    );

    // min/maxPrice for the Composer field: allow ±1 % around current spot
    const spotStr = fromStroops(result.spotPriceAperB); // A per B
    const spotNum = parseFloat(spotStr);
    const minPrice = (spotNum * 0.99).toFixed(7);
    const maxPrice = (spotNum * 1.01).toFixed(7);

    return {
      ...base,
      scenario: 'deposit',
      depositA: fromStroops(result.depositA),
      depositB: fromStroops(result.depositB),
      sharesOut: fromStroops(result.sharesOut),
      minSharesOut: fromStroops(minSharesOut),
      composerHint: {
        operation: 'liquidityPoolDeposit',
        poolId: pool.id,
        maxAmountA: fromStroops(result.depositA),
        maxAmountB: fromStroops(result.depositB),
        minPrice,
        maxPrice,
      },
    };
  }

  // ── withdrawal quote ───────────────────────────────────────────────────

  private buildWithdrawalQuote(
    pool: HorizonLpRecord,
    network: string,
    dto: PoolQuoteDto,
  ): WithdrawalQuoteResult {
    const reserveA = toStroops(pool.reserves[0].amount);
    const reserveB = toStroops(pool.reserves[1].amount);
    const totalShares = toStroops(pool.total_shares);

    if (!dto.shares && !dto.withdrawAmountA) {
      throw new BadRequestException(
        'Withdrawal scenario requires shares or withdrawAmountA',
      );
    }
    if (dto.shares && dto.withdrawAmountA) {
      throw new BadRequestException(
        'Provide shares OR withdrawAmountA for a withdrawal quote, not both',
      );
    }

    const result: WithdrawalResult = quoteWithdrawal({
      reserveA,
      reserveB,
      totalShares,
      sharesToBurn: dto.shares ? toStroops(dto.shares) : undefined,
      desiredA: dto.withdrawAmountA ? toStroops(dto.withdrawAmountA) : undefined,
    });

    const DEFAULT_SLIPPAGE = 0.5;
    const { minA, minB } = withdrawalMinAmounts(
      result.reserveAOut,
      result.reserveBOut,
      DEFAULT_SLIPPAGE,
    );

    const base = this.buildBase(
      pool, network, 'withdrawal',
      result.spotPriceAperB, result.spotPriceBperA, result.priceImpactPpm,
    );

    return {
      ...base,
      scenario: 'withdrawal',
      sharesToBurn: fromStroops(result.sharesToBurn),
      reserveAOut: fromStroops(result.reserveAOut),
      reserveBOut: fromStroops(result.reserveBOut),
      minReserveAOut: fromStroops(minA),
      minReserveBOut: fromStroops(minB),
      composerHint: {
        operation: 'liquidityPoolWithdraw',
        poolId: pool.id,
        amount: fromStroops(result.sharesToBurn),
        minAmountA: fromStroops(minA),
        minAmountB: fromStroops(minB),
      },
    };
  }

  // ── public entry point ─────────────────────────────────────────────────

  async getPoolQuote(dto: PoolQuoteDto): Promise<PoolQuoteResult> {
    const network = dto.network ?? 'testnet';
    const horizonUrl = getHorizonUrl(network);

    // Reject inputs that belong to the other scenario early
    if (dto.scenario === 'deposit' && (dto.shares || dto.withdrawAmountA)) {
      throw new BadRequestException(
        'shares and withdrawAmountA are only valid for the withdrawal scenario',
      );
    }
    if (dto.scenario === 'withdrawal' && (dto.amountA || dto.amountB)) {
      throw new BadRequestException(
        'amountA and amountB are only valid for the deposit scenario',
      );
    }

    let pool: HorizonLpRecord;
    try {
      pool = await this.resolvePool(horizonUrl, dto);
    } catch (err) {
      // re-throw NestJS exceptions as-is; wrap others
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Pool resolution failed: ${msg}`);
      throw new BadRequestException(`Pool resolution failed: ${msg}`);
    }

    if (pool.type !== 'constant_product') {
      throw new BadRequestException(
        `Pool "${pool.id}" is of type "${pool.type}". Only constant_product pools are supported.`,
      );
    }

    try {
      if (dto.scenario === 'deposit') {
        return this.buildDepositQuote(pool, network, dto);
      }
      return this.buildWithdrawalQuote(pool, network, dto);
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Quote calculation failed: ${msg}`);
    }
  }
}
