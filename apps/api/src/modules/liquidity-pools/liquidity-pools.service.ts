import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { fetchFromHorizon, getHorizonUrl, parseAssetParams } from '../simulator/horizon.util';
import { fromStroops, toStroops } from '../simulator/lp-math';
import { WatchedPool } from './entities/watched-pool.entity';
import { PoolSearchDto, ShareValueDto, WatchPoolDto } from './dto/pool-search.dto';

// ─── Horizon response shapes ──────────────────────────────────────────────

interface HorizonLpReserve {
  asset: string;
  amount: string;
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
  _links: {
    next?: { href: string };
  };
}

// ─── Result shapes ─────────────────────────────────────────────────────────

export interface PoolDetails {
  poolId: string;
  network: string;
  assetA: string;
  assetB: string;
  reserveA: string;
  reserveB: string;
  totalShares: string;
  feePct: string;
  totalTrustlines: number;
  type: string;
  spotPriceAperB: string;
  spotPriceBperA: string;
}

export interface ShareValueResult {
  poolId: string;
  network: string;
  shares: string;
  valueA: string;
  valueB: string;
  totalValueUsd?: string;
  sharePercentage: string;
  assetA: string;
  assetB: string;
}

export interface WatchedPoolItem {
  id: string;
  poolId: string;
  network: string;
  assetA: string;
  assetB: string;
  label: string | null;
  createdAt: string;
}

// ─── service ──────────────────────────────────────────────────────────────

@Injectable()
export class LiquidityPoolsService {
  private readonly logger = new Logger(LiquidityPoolsService.name);

  constructor(
    @InjectRepository(WatchedPool)
    private readonly watchedPoolRepository: Repository<WatchedPool>,
  ) {}

  // ── pool search ─────────────────────────────────────────────────────────

  async searchPools(dto: PoolSearchDto): Promise<PoolDetails[]> {
    const network = dto.network ?? 'testnet';
    const horizonUrl = getHorizonUrl(network);

    // Validate asset strings before the network call
    parseAssetParams(dto.assetA);
    parseAssetParams(dto.assetB);

    const reservesParam = [dto.assetA, dto.assetB]
      .map((a) => (a === 'XLM' ? 'native' : a))
      .join(',');
    const url = `${horizonUrl}/liquidity_pools?reserves=${encodeURIComponent(reservesParam)}&limit=10`;

    let page: HorizonLpPage;
    try {
      page = (await fetchFromHorizon(url)) as HorizonLpPage;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Pool search failed: ${msg}`);
    }

    const records = page._embedded?.records ?? [];
    return records
      .filter((pool) => pool.type === 'constant_product')
      .map((pool) => this.formatPoolDetails(pool, network));
  }

  // ── pool details ────────────────────────────────────────────────────────

  async getPoolDetails(poolId: string, network: string): Promise<PoolDetails> {
    const horizonUrl = getHorizonUrl(network);
    const url = `${horizonUrl}/liquidity_pools/${encodeURIComponent(poolId)}`;

    let pool: HorizonLpRecord;
    try {
      pool = (await fetchFromHorizon(url)) as HorizonLpRecord;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new NotFoundException(`Pool "${poolId}" not found: ${msg}`);
    }

    if (pool.type !== 'constant_product') {
      throw new BadRequestException(
        `Pool "${poolId}" is of type "${pool.type}". Only constant_product pools are supported.`,
      );
    }

    return this.formatPoolDetails(pool, network);
  }

  // ── share value calculator ───────────────────────────────────────────────

  async calculateShareValue(dto: ShareValueDto): Promise<ShareValueResult> {
    const network = dto.network ?? 'testnet';
    const pool = await this.getPoolDetails(dto.poolId, network);

    const shares = toStroops(dto.shares);
    const totalShares = toStroops(pool.totalShares);
    const reserveA = toStroops(pool.reserveA);
    const reserveB = toStroops(pool.reserveB);

    if (totalShares === 0n) {
      throw new BadRequestException('Pool has no shares (empty pool)');
    }

    if (shares > totalShares) {
      throw new BadRequestException('Shares cannot exceed total pool shares');
    }

    // Calculate proportional ownership
    const valueA = (shares * reserveA) / totalShares;
    const valueB = (shares * reserveB) / totalShares;

    // Calculate share percentage (scaled to 9 decimal places for precision)
    const sharePercentage = (shares * 10_000_000_000n) / totalShares;

    return {
      poolId: pool.poolId,
      network,
      shares: dto.shares,
      valueA: fromStroops(valueA),
      valueB: fromStroops(valueB),
      sharePercentage: (Number(sharePercentage) / 100_000_000).toFixed(8),
      assetA: pool.assetA,
      assetB: pool.assetB,
    };
  }

  // ── watched pools (user persistence) ────────────────────────────────────

  async watchPool(userId: string, dto: WatchPoolDto): Promise<WatchedPoolItem> {
    const network = dto.network ?? 'testnet';

    // Verify the pool exists on Horizon
    await this.getPoolDetails(dto.poolId, network);

    const watched = this.watchedPoolRepository.create({
      userId,
      poolId: dto.poolId,
      network,
      assetA: dto.assetA,
      assetB: dto.assetB,
      label: dto.label ?? null,
    });

    const saved = await this.watchedPoolRepository.save(watched);

    return {
      id: saved.id,
      poolId: saved.poolId,
      network: saved.network,
      assetA: saved.assetA,
      assetB: saved.assetB,
      label: saved.label,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async unwatchPool(userId: string, id: string): Promise<void> {
    const watched = await this.watchedPoolRepository.findOne({
      where: { id, userId },
    });

    if (!watched) {
      throw new NotFoundException('Watched pool not found');
    }

    await this.watchedPoolRepository.remove(watched);
  }

  async getWatchedPools(userId: string): Promise<WatchedPoolItem[]> {
    const watched = await this.watchedPoolRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return watched.map((w: WatchedPool) => ({
      id: w.id,
      poolId: w.poolId,
      network: w.network,
      assetA: w.assetA,
      assetB: w.assetB,
      label: w.label,
      createdAt: w.createdAt.toISOString(),
    }));
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private formatPoolDetails(pool: HorizonLpRecord, network: string): PoolDetails {
    const [ra, rb] = pool.reserves;
    const reserveA = toStroops(ra.amount);
    const reserveB = toStroops(rb.amount);

    // Calculate spot prices (A per B and B per A)
    const STROOP = 10_000_000n;
    const spotPriceAperB = (reserveA * STROOP) / reserveB;
    const spotPriceBperA = (reserveB * STROOP) / reserveA;

    const feePct = (pool.fee_bp / 100).toFixed(2);

    return {
      poolId: pool.id,
      network,
      assetA: ra.asset,
      assetB: rb.asset,
      reserveA: ra.amount,
      reserveB: rb.amount,
      totalShares: pool.total_shares,
      feePct: `${feePct}%`,
      totalTrustlines: pool.total_trustlines,
      type: pool.type,
      spotPriceAperB: fromStroops(spotPriceAperB),
      spotPriceBperA: fromStroops(spotPriceBperA),
    };
  }
}
