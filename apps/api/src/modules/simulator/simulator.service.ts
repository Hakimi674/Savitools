import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Direction, AssetType, FindPathsDto } from './dto/find-paths.dto';
import { EstimateDto } from './dto/estimate.dto';
import { SimulateStrictSendDto } from './dto/strict-send.dto';
import { SimulateStrictReceiveDto } from './dto/strict-receive.dto';
import { getHorizonUrl, parseAssetParams, fetchFromHorizon } from './horizon.util';

export interface SimulatedAsset {
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  code?: string;
  issuer?: string;
  label: string;
}

export interface SimulatedPath {
  source_asset: SimulatedAsset;
  destination_asset: SimulatedAsset;
  source_amount: string;
  destination_amount: string;
  path: SimulatedAsset[];
  effective_rate: string;
  estimated_fee: string;
  recommended_slippage: number;
  hops: number;
}

export interface EstimateResult {
  destination_min?: string;
  send_max?: string;
  source_amount: string;
  destination_amount: string;
  path: SimulatedAsset[];
}

export interface PathHop {
  assetType: string;
  assetCode: string | null;
  assetIssuer: string | null;
}

export interface HorizonSimulatedPath {
  sourceAmount: string;
  destinationAmount: string;
  path: PathHop[];
  pathLength: number;
  exchangeRate: string;
}

export interface StrictSendResult {
  sourceAsset: string;
  sourceAmount: string;
  destAsset: string;
  network: string;
  mode: 'strict_send';
  totalPathsFound: number;
  paths: HorizonSimulatedPath[];
  bestPath: HorizonSimulatedPath;
  slippagePercent: string;
}

export interface StrictReceiveResult {
  sourceAsset: string;
  destAsset: string;
  destAmount: string;
  network: string;
  mode: 'strict_receive';
  totalPathsFound: number;
  paths: HorizonSimulatedPath[];
  bestPath: HorizonSimulatedPath;
  sourceAmountNeeded: string;
  slippagePercent: string;
}

export interface FeeResult {
  network: string;
  operations: number;
  baseFeeStroops: number;
  totalFeeStroops: number;
  totalFeeXlm: string;
  feeChargedPercentiles: {
    p10: string;
    p50: string;
    p90: string;
    p99: string;
  };
  lastLedger: number;
}

interface HorizonPathRecord {
  source_asset_type: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  source_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
  destination_amount: string;
  path: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
}

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);

  private readonly servers = {
    mainnet: new StellarSdk.Horizon.Server('https://horizon.stellar.org'),
    testnet: new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org'),
  };

  private buildAsset(
    type: AssetType,
    code?: string,
    issuer?: string,
  ): StellarSdk.Asset {
    if (type === AssetType.NATIVE) {
      return StellarSdk.Asset.native();
    }
    if (!code || !issuer) {
      throw new Error(
        `Asset code and issuer are required for ${type} assets`,
      );
    }
    return new StellarSdk.Asset(code, issuer);
  }

  private parseAsset(
    raw: {
      asset_type?: string;
      asset_code?: string;
      asset_issuer?: string;
    },
    fallbackType?: AssetType,
  ): SimulatedAsset {
    const type =
      (raw.asset_type as SimulatedAsset['type']) ??
      (fallbackType as SimulatedAsset['type']) ??
      'native';
    const code = raw.asset_code;
    const issuer = raw.asset_issuer;

    let label: string;
    if (type === 'native') {
      label = 'XLM';
    } else if (code && issuer) {
      label = `${code}:${issuer.slice(0, 4)}…${issuer.slice(-4)}`;
    } else {
      label = code ?? 'Unknown';
    }

    return { type, code, issuer, label };
  }

  private calculateRecommendedSlippage(
    pathRate: number,
    bestRate: number,
    hops: number,
  ): number {
    if (pathRate === 0 || bestRate === 0 || isNaN(pathRate) || isNaN(bestRate)) {
      return Math.min(1 + hops * 0.5, 10);
    }

    // Compare this path's rate against the best possible rate
    const rateDeviation = Math.abs(1 - pathRate / bestRate);
    const depthPenalty = hops * 0.3;
    // Base slippage on route-price dispersion with a minimum floor of 0.1%
    const baseSlippage = Math.max(rateDeviation * 100, 0.1);
    const recommended = Math.min(baseSlippage * 1.5 + depthPenalty, 25);

    return Math.round(recommended * 10) / 10;
  }

  async findPaths(dto: FindPathsDto): Promise<SimulatedPath[]> {
    const network = dto.network ?? 'testnet';
    const server = this.servers[network];

    const sourceAsset = this.buildAsset(
      dto.source_asset_type,
      dto.source_asset_code,
      dto.source_asset_issuer,
    );
    const destAsset = this.buildAsset(
      dto.destination_asset_type,
      dto.destination_asset_code,
      dto.destination_asset_issuer,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Horizon path-finding records are untyped
    let rawPaths: any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serverAny = server as any;

    if (dto.direction === Direction.STRICT_SEND) {
      const result = await serverAny
        .strictSendPaths(sourceAsset, dto.amount, [destAsset])
        .call();
      rawPaths = result.records;
    } else {
      const result = await serverAny
        .strictReceivePaths([sourceAsset], dto.amount, destAsset)
        .call();
      rawPaths = result.records;
    }

    if (rawPaths.length === 0) {
      throw new Error(
        'No paths found for the given assets and amount',
      );
    }

    const bestPath = rawPaths[0];
    let bestRate = 0;
    if (bestPath) {
      const bestSrc = parseFloat(bestPath.source_amount);
      const bestDst = parseFloat(bestPath.destination_amount);
      bestRate = bestSrc > 0 ? bestDst / bestSrc : 0;
    }

    /* eslint-disable @typescript-eslint/no-explicit-any -- Horizon path-finding responses are untyped */
    return rawPaths.map((record: any) => {
      const sourceAssetParsed = this.parseAsset({
        asset_type: record.source_asset_type,
        asset_code: record.source_asset_code,
        asset_issuer: record.source_asset_issuer,
      });
      const destAssetParsed = this.parseAsset({
        asset_type: record.destination_asset_type,
        asset_code: record.destination_asset_code,
        asset_issuer: record.destination_asset_issuer,
      });

      const intermediateAssets: SimulatedAsset[] = (record.path ?? []).map(
        (p: any) => this.parseAsset(p),
      );

      const srcAmt = parseFloat(record.source_amount);
      const dstAmt = parseFloat(record.destination_amount);
      const effectiveRate =
        dstAmt > 0 && srcAmt > 0
          ? (dstAmt / srcAmt).toFixed(8)
          : 'N/A';

      return {
        source_asset: sourceAssetParsed,
        destination_asset: destAssetParsed,
        source_amount: record.source_amount,
        destination_amount: record.destination_amount,
        path: intermediateAssets,
        effective_rate: effectiveRate,
        estimated_fee: '0.00001',
        recommended_slippage: this.calculateRecommendedSlippage(
          parseFloat(record.source_amount) > 0 ? parseFloat(record.destination_amount) / parseFloat(record.source_amount) : 0,
          bestRate,
          intermediateAssets.length,
        ),
        hops: intermediateAssets.length,
      };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  async estimateSlippage(dto: EstimateDto): Promise<EstimateResult> {
    const network = dto.network ?? 'testnet';
    const server = this.servers[network];

    const sourceAsset = this.buildAsset(
      dto.source_asset.type as AssetType,
      dto.source_asset.code,
      dto.source_asset.issuer,
    );
    const destAsset = this.buildAsset(
      dto.destination_asset.type as AssetType,
      dto.destination_asset.code,
      dto.destination_asset.issuer,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Horizon path-finding records are untyped
    let rawPaths: any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serverAny = server as any;

    if (dto.direction === Direction.STRICT_SEND) {
      const result = await serverAny
        .strictSendPaths(sourceAsset, dto.amount, [destAsset])
        .call();
      rawPaths = result.records;
    } else {
      const result = await serverAny
        .strictReceivePaths([sourceAsset], dto.amount, destAsset)
        .call();
      rawPaths = result.records;
    }

    if (rawPaths.length === 0) {
      throw new Error(
        'No paths found for the given assets and amount',
      );
    }

    const bestPath = rawPaths[0];

    /* eslint-disable @typescript-eslint/no-explicit-any -- Horizon path-finding responses are untyped */
    const intermediateAssets: SimulatedAsset[] = (bestPath.path ?? []).map(
      (p: any) => this.parseAsset(p),
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const srcAmt = parseFloat(bestPath.source_amount);
    const dstAmt = parseFloat(bestPath.destination_amount);

    const slippageMultiplier = 1 - dto.slippage_percent / 100;

    if (dto.direction === Direction.STRICT_SEND) {
      const destinationMin = (dstAmt * slippageMultiplier).toFixed(7);
      return {
        destination_min: destinationMin,
        source_amount: bestPath.source_amount,
        destination_amount: bestPath.destination_amount,
        path: intermediateAssets,
      };
    } else {
      const sendMax = (srcAmt / slippageMultiplier).toFixed(7);
      return {
        send_max: sendMax,
        source_amount: bestPath.source_amount,
        destination_amount: bestPath.destination_amount,
        path: intermediateAssets,
      };
    }
  }

  private buildHorizonPathUrl(
    horizonUrl: string,
    mode: 'strict_send' | 'strict_receive',
    params: Record<string, string>,
  ): string {
    const base = `${horizonUrl}/paths/${mode}`;
    const qs = new URLSearchParams(params).toString();
    return `${base}?${qs}`;
  }

  async simulateStrictSend(dto: SimulateStrictSendDto): Promise<StrictSendResult> {
    const horizonUrl = getHorizonUrl(dto.network);
    const src = parseAssetParams(dto.sourceAsset);
    const dst = parseAssetParams(dto.destAsset);

    const params: Record<string, string> = {
      source_asset_type: src.type,
      source_amount: dto.sourceAmount,
      destination_asset_type: dst.type,
    };
    if (src.code) params.source_asset_code = src.code;
    if (src.issuer) params.source_asset_issuer = src.issuer;
    if (dst.code) params.destination_asset_code = dst.code;
    if (dst.issuer) params.destination_asset_issuer = dst.issuer;

    let json: { _embedded?: { records?: HorizonPathRecord[] } };
    try {
      const url = this.buildHorizonPathUrl(horizonUrl, 'strict_send', params);
      json = await fetchFromHorizon(url);
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Strict send path lookup failed: ${message}`);
      throw new BadRequestException(`Path lookup failed: ${message}`);
    }

    const records = json._embedded?.records ?? [];

    if (records.length === 0) {
      throw new BadRequestException(
        `No path found from ${dto.sourceAsset} to ${dto.destAsset} on ${dto.network}`,
      );
    }

    const paths: HorizonSimulatedPath[] = records.map((record) => {
      const destAmount = record.destination_amount;
      const rate = (Number(destAmount) / Number(dto.sourceAmount)).toString();
      return {
        sourceAmount: record.source_amount,
        destinationAmount: destAmount,
        path: record.path.map((hop) => ({
          assetType: hop.asset_type,
          assetCode: hop.asset_code || null,
          assetIssuer: hop.asset_issuer || null,
        })),
        pathLength: record.path.length,
        exchangeRate: rate,
      };
    });

    const bestPath = paths.reduce((best, p) =>
      Number(p.destinationAmount) > Number(best.destinationAmount) ? p : best,
    );

    const slippage = paths.length > 1
      ? ((Number(bestPath.destinationAmount) - Number(paths[paths.length - 1].destinationAmount))
          / Number(bestPath.destinationAmount) * 100).toFixed(2)
      : '0';

    return {
      sourceAsset: dto.sourceAsset,
      sourceAmount: dto.sourceAmount,
      destAsset: dto.destAsset,
      network: dto.network,
      mode: 'strict_send',
      totalPathsFound: paths.length,
      paths,
      bestPath,
      slippagePercent: slippage,
    };
  }

  async simulateStrictReceive(dto: SimulateStrictReceiveDto): Promise<StrictReceiveResult> {
    const horizonUrl = getHorizonUrl(dto.network);
    const src = parseAssetParams(dto.sourceAsset);
    const dst = parseAssetParams(dto.destAsset);

    const params: Record<string, string> = {
      source_asset_type: src.type,
      destination_asset_type: dst.type,
      destination_amount: dto.destAmount,
    };
    if (src.code) params.source_asset_code = src.code;
    if (src.issuer) params.source_asset_issuer = src.issuer;
    if (dst.code) params.destination_asset_code = dst.code;
    if (dst.issuer) params.destination_asset_issuer = dst.issuer;

    let json: { _embedded?: { records?: HorizonPathRecord[] } };
    try {
      const url = this.buildHorizonPathUrl(horizonUrl, 'strict_receive', params);
      json = await fetchFromHorizon(url);
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Strict receive path lookup failed: ${message}`);
      throw new BadRequestException(`Path lookup failed: ${message}`);
    }

    const records = json._embedded?.records ?? [];

    if (records.length === 0) {
      throw new BadRequestException(
        `No path found to ${dto.destAsset} for ${dto.destAmount} from ${dto.sourceAsset} on ${dto.network}`,
      );
    }

    const paths: HorizonSimulatedPath[] = records.map((record) => {
      const srcAmount = record.source_amount;
      const rate = (Number(dto.destAmount) / Number(srcAmount)).toString();
      return {
        sourceAmount: srcAmount,
        destinationAmount: record.destination_amount,
        path: record.path.map((hop) => ({
          assetType: hop.asset_type,
          assetCode: hop.asset_code || null,
          assetIssuer: hop.asset_issuer || null,
        })),
        pathLength: record.path.length,
        exchangeRate: rate,
      };
    });

    const bestPath = paths.reduce((best, p) =>
      Number(p.sourceAmount) < Number(best.sourceAmount) ? p : best,
    );

    const slippage = paths.length > 1
      ? ((Number(paths[paths.length - 1].sourceAmount) - Number(bestPath.sourceAmount))
          / Number(paths[paths.length - 1].sourceAmount) * 100).toFixed(2)
      : '0';

    return {
      sourceAsset: dto.sourceAsset,
      destAsset: dto.destAsset,
      destAmount: dto.destAmount,
      network: dto.network,
      mode: 'strict_receive',
      totalPathsFound: paths.length,
      paths,
      bestPath,
      sourceAmountNeeded: bestPath.sourceAmount,
      slippagePercent: slippage,
    };
  }

  async simulateFee(operations: number, network: string): Promise<FeeResult> {
    const horizonUrl = getHorizonUrl(network);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- /fee_stats response fields are read as loose JSON
    let json: Record<string, any>;
    try {
      json = await fetchFromHorizon(`${horizonUrl}/fee_stats`);
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Fee stats fetch failed: ${message}`);
      throw new BadRequestException(`Fee stats fetch failed: ${message}`);
    }

    const baseFee = parseInt(json.last_ledger_base_fee, 10) || 100;
    const totalFeeStroops = baseFee * operations;
    const totalFeeXlm = (totalFeeStroops * 1e-7).toFixed(7);

    return {
      network,
      operations,
      baseFeeStroops: baseFee,
      totalFeeStroops,
      totalFeeXlm,
      feeChargedPercentiles: {
        p10: json.fee_charged?.p10 ?? '0',
        p50: json.fee_charged?.p50 ?? '0',
        p90: json.fee_charged?.p90 ?? '0',
        p99: json.fee_charged?.p99 ?? '0',
      },
      lastLedger: json.last_ledger ?? 0,
    };
  }
}
