'use client';

import { useExampleOnboarding } from '@/hooks/use-example-onboarding';
import { EXAMPLE_USDC_ISSUER } from '@/lib/examples';
import {
  findSimulatorPaths,
  getPoolQuote,
  type Direction,
  type NetworkChoice,
  type SimulatedPath,
  type AssetType,
  type PoolQuoteParams,
  type DepositQuoteResult,
  type WithdrawalQuoteResult,
  type PoolQuoteResult,
  type PoolQuoteScenario,
} from '@/lib/api';
import { ArrowRight, ExternalLink, Loader2, Droplets, TrendingDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SimulatorPathSkeleton,
  ErrorState,
  SimulatorEmptyState,
  SimulatorNoPathsState,
} from './state-display';

function AssetPicker({
  label,
  assetType,
  assetCode,
  assetIssuer,
  onTypeChange,
  onCodeChange,
  onIssuerChange,
}: {
  label: string;
  assetType: AssetType;
  assetCode: string;
  assetIssuer: string;
  onTypeChange: (t: AssetType) => void;
  onCodeChange: (c: string) => void;
  onIssuerChange: (i: string) => void;
}) {
  const isNative = assetType === 'native';

  return (
    <div className="flex-1 min-w-[200px] space-y-2">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onTypeChange('native')}
          className={`px-3 py-2 text-sm font-mono rounded-md border transition-colors ${
            isNative
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border hover:bg-muted'
          }`}
        >
          XLM
        </button>
        <button
          type="button"
          onClick={() => onTypeChange('credit_alphanum4')}
          className={`px-3 py-2 text-sm rounded-md border transition-colors ${
            !isNative
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border hover:bg-muted'
          }`}
        >
          Token
        </button>
      </div>
      {!isNative && (
        <div className="flex gap-2">
          <input
            type="text"
            value={assetCode}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="Code (e.g. USDC)"
            maxLength={12}
            className="w-1/3 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
          <input
            type="text"
            value={assetIssuer}
            onChange={(e) => onIssuerChange(e.target.value)}
            placeholder="Issuer address"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
        </div>
      )}
    </div>
  );
}

function HopChain({ path }: { path: SimulatedPath }) {
  const allAssets = [path.source_asset, ...path.path, path.destination_asset];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {allAssets.map((asset, i) => (
        <div key={i} className="flex items-center gap-1">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-muted border border-border"
            title={asset.issuer ? `${asset.code}:${asset.issuer}` : asset.label}
          >
            {asset.type === 'native' ? 'XLM' : asset.code ?? '?'}
          </span>
          {i < allAssets.length - 1 && (
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

function PathCard({
  path,
  direction,
  network,
  onSelect,
}: {
  path: SimulatedPath;
  direction: Direction;
  network: NetworkChoice;
  onSelect: (path: SimulatedPath) => void;
}) {
  const [slippage, setSlippage] = useState(path.recommended_slippage.toFixed(1));

  const computedAmount = useMemo(() => {
    const src = parseFloat(path.source_amount);
    const dst = parseFloat(path.destination_amount);
    const pct = parseFloat(slippage) || 0;
    const multiplier = 1 - pct / 100;

    if (direction === 'strict_send') {
      return { label: 'destination_min', value: (dst * multiplier).toFixed(7) };
    } else {
      return { label: 'send_max', value: (src / multiplier).toFixed(7) };
    }
  }, [path, direction, slippage]);

  const composerParams = new URLSearchParams({
    operation: direction === 'strict_send' ? 'pathPaymentStrictSend' : 'pathPaymentStrictReceive',
    source_asset_type: path.source_asset.type,
    destination_asset_type: path.destination_asset.type,
    source_amount: path.source_amount,
    destination_amount: path.destination_amount,
    network,
  });
  if (path.source_asset.code) composerParams.set('source_asset_code', path.source_asset.code);
  if (path.source_asset.issuer) composerParams.set('source_asset_issuer', path.source_asset.issuer);
  if (path.destination_asset.code) composerParams.set('destination_asset_code', path.destination_asset.code);
  if (path.destination_asset.issuer) composerParams.set('destination_asset_issuer', path.destination_asset.issuer);
  if (path.path.length > 0) {
    composerParams.set('path_assets', JSON.stringify(path.path));
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <HopChain path={path} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-0.5">Source</p>
          <p className="font-mono font-medium">{path.source_amount}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Destination</p>
          <p className="font-mono font-medium">{path.destination_amount}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Rate</p>
          <p className="font-mono font-medium">{path.effective_rate}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Hops</p>
          <p className="font-mono font-medium">{path.hops}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-600">
            Recommended: {path.recommended_slippage}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Slippage:</label>
          <input
            type="number"
            min="0"
            max="50"
            step="0.1"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="w-20 rounded border border-border bg-background px-2 py-1 text-xs font-mono"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {computedAmount.label} = {computedAmount.value}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSelect(path)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <ExternalLink className="h-3 w-3" />
          Use in Composer
        </button>
      </div>
    </div>
  );
}

function NoResultsState({
  direction,
  onRetry,
}: {
  direction: Direction;
  onRetry: () => void;
}) {
  return (
    <SimulatorNoPathsState direction={direction} onRetry={onRetry} />
  );
}

// ─── LP Quote Panel ───────────────────────────────────────────────────────

/**
 * LpQuotePanel – visually distinct panel for LP pool deposit/withdrawal quotes.
 *
 * Uses a teal/emerald colour palette (vs the blue used for order-book panels)
 * and clearly labels itself as a "Liquidity Pool" tool to keep LP quotes
 * distinct from classic order-book simulation results.
 */
function LpQuotePanel({ network }: { network: NetworkChoice }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [scenario, setScenario] = useState<PoolQuoteScenario>(
    searchParams.get('scenario') === 'withdraw' ? 'withdraw' : 'deposit',
  );

  // pool identification
  const [poolId, setPoolId] = useState(searchParams.get('poolId') ?? '');
  const [assetA, setAssetA] = useState(searchParams.get('assetA') ?? 'XLM');
  const [assetB, setAssetB] = useState(searchParams.get('assetB') ?? `USDC:${EXAMPLE_USDC_ISSUER}`);

  // deposit inputs
  const [amountA, setAmountA] = useState(searchParams.get('amountA') ?? '');
  const [amountB, setAmountB] = useState(searchParams.get('amountB') ?? '');

  // withdrawal inputs
  const [shares, setShares] = useState(searchParams.get('shares') ?? '');
  const [withdrawAmountA, setWithdrawAmountA] = useState(searchParams.get('withdrawAmountA') ?? '');

  const [result, setResult] = useState<PoolQuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'lp');
    params.set('network', network);
    params.set('scenario', scenario);
    params.set('poolId', poolId);
    params.set('assetA', assetA);
    params.set('assetB', assetB);
    params.set('amountA', amountA);
    params.set('amountB', amountB);
    params.set('shares', shares);
    params.set('withdrawAmountA', withdrawAmountA);
    const query = params.toString();
    if (window.location.search !== `?${query}`) {
      router.replace(`/simulator?${query}`, { scroll: false });
    }
  }, [amountA, amountB, assetA, assetB, network, poolId, router, scenario, shares, withdrawAmountA]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    const params: PoolQuoteParams = {
      scenario,
      network,
      ...(poolId.trim() ? { poolId: poolId.trim() } : { assetA: assetA.trim(), assetB: assetB.trim() }),
    };

    if (scenario === 'deposit') {
      if (amountA.trim()) params.amountA = amountA.trim();
      else if (amountB.trim()) params.amountB = amountB.trim();
    } else {
      if (shares.trim()) params.shares = shares.trim();
      else if (withdrawAmountA.trim()) params.withdrawAmountA = withdrawAmountA.trim();
    }

    try {
      const res = await getPoolQuote(params);
      setResult(res);
    } catch (err: any) {
      setError(err.message ?? 'Failed to fetch pool quote');
    } finally {
      setLoading(false);
    }
  };

  const handleUseInComposer = () => {
    if (!result) return;
    const hint = result.composerHint;
    const params = new URLSearchParams({ operation: hint.operation, network });
    if (hint.operation === 'liquidityPoolDeposit') {
      const dHint = hint as DepositQuoteResult['composerHint'];
      params.set('poolId', dHint.poolId);
      params.set('maxAmountA', dHint.maxAmountA);
      params.set('maxAmountB', dHint.maxAmountB);
      params.set('minPrice', dHint.minPrice);
      params.set('maxPrice', dHint.maxPrice);
    } else {
      const wHint = hint as WithdrawalQuoteResult['composerHint'];
      params.set('poolId', wHint.poolId);
      params.set('amount', wHint.amount);
      params.set('minAmountA', wHint.minAmountA);
      params.set('minAmountB', wHint.minAmountB);
    }
    router.push(`/composer?${params.toString()}`);
  };

  const isFormValid = () => {
    const hasPool = poolId.trim() || (assetA.trim() && assetB.trim());
    if (!hasPool) return false;
    if (scenario === 'deposit') return !!(amountA.trim() || amountB.trim());
    return !!(shares.trim() || withdrawAmountA.trim());
  };

  return (
    <div className="space-y-5">
      {/* Header banner — clearly labels this as LP, not order-book */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <Droplets className="h-4 w-4 text-emerald-500 flex-shrink-0" />
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Liquidity Pool Quote — constant-product AMM arithmetic (distinct from order-book simulation)
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Scenario selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Scenario</label>
          <div className="flex bg-secondary p-1 rounded-lg w-fit">
            {(['deposit', 'withdrawal'] as PoolQuoteScenario[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setScenario(s); setResult(null); setError(''); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  scenario === s
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'deposit' ? '↑ Deposit' : '↓ Withdrawal'}
              </button>
            ))}
          </div>
        </div>

        {/* Pool identification */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Pool</label>
          <div className="grid gap-2">
            <input
              type="text"
              value={poolId}
              onChange={(e) => setPoolId(e.target.value)}
              placeholder="Pool ID (64-char hex) — optional, overrides asset pair"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50"
            />
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={assetA}
                onChange={(e) => setAssetA(e.target.value)}
                placeholder="Asset A (XLM or CODE:ISSUER)"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50"
              />
              <span className="text-xs text-muted-foreground font-mono">/</span>
              <input
                type="text"
                value={assetB}
                onChange={(e) => setAssetB(e.target.value)}
                placeholder="Asset B (CODE:ISSUER)"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        </div>

        {/* Scenario-specific inputs */}
        {scenario === 'deposit' ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Deposit amount <span className="font-normal">(provide one side; the other is computed)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Asset A</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountA}
                  onChange={(e) => { setAmountA(e.target.value); if (e.target.value) setAmountB(''); }}
                  placeholder="e.g. 100.0000000"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Asset B</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountB}
                  onChange={(e) => { setAmountB(e.target.value); if (e.target.value) setAmountA(''); }}
                  placeholder="e.g. 250.0000000"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Withdrawal amount <span className="font-normal">(LP shares or desired A-side)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">LP Shares to burn</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={shares}
                  onChange={(e) => { setShares(e.target.value); if (e.target.value) setWithdrawAmountA(''); }}
                  placeholder="e.g. 50.0000000"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Desired Asset A out</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={withdrawAmountA}
                  onChange={(e) => { setWithdrawAmountA(e.target.value); if (e.target.value) setShares(''); }}
                  placeholder="e.g. 80.0000000"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !isFormValid()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Droplets className="h-4 w-4" />}
          Get Pool Quote
        </button>
      </form>

      {/* Error */}
      {error && (
        <ErrorState
          title="Pool quote failed"
          message={error}
          onRetry={() => setError('')}
          retryLabel="Dismiss"
          details={error}
        />
      )}

      {/* Result */}
      {result && !loading && (
        <LpQuoteResultCard result={result} onUseInComposer={handleUseInComposer} />
      )}
    </div>
  );
}

function LpStatRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-xs font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function LpQuoteResultCard({
  result,
  onUseInComposer,
}: {
  result: PoolQuoteResult;
  onUseInComposer: () => void;
}) {
  const isDeposit = result.scenario === 'deposit';
  const deposit = isDeposit ? (result as DepositQuoteResult) : null;
  const withdrawal = !isDeposit ? (result as WithdrawalQuoteResult) : null;

  const impactBps = parseInt(result.priceImpactBps, 10);
  const impactColor =
    impactBps < 10 ? 'text-emerald-600' :
    impactBps < 50 ? 'text-yellow-600' :
    'text-red-600';

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-4">
      {/* Pool info header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
            {isDeposit ? 'Deposit Quote' : 'Withdrawal Quote'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]" title={result.poolId}>
          Pool: {result.poolId.slice(0, 8)}…{result.poolId.slice(-6)}
        </span>
      </div>

      {/* Pool reserves */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-md bg-background/60 p-2.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Asset A reserve</p>
          <p className="font-mono font-medium">{result.assetA.reserve}</p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">{result.assetA.asset}</p>
        </div>
        <div className="rounded-md bg-background/60 p-2.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Asset B reserve</p>
          <p className="font-mono font-medium">{result.assetB.reserve}</p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">{result.assetB.asset}</p>
        </div>
      </div>

      {/* Scenario-specific outputs */}
      {isDeposit && deposit && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Deposit estimate</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <LpStatRow label="Asset A in" value={deposit.depositA} />
            <LpStatRow label="Asset B in" value={deposit.depositB} />
            <LpStatRow label="Shares minted" value={deposit.sharesOut} />
            <LpStatRow label="Min shares (0.5% slip)" value={deposit.minSharesOut} />
          </div>
        </div>
      )}

      {!isDeposit && withdrawal && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Withdrawal estimate</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <LpStatRow label="Shares burned" value={withdrawal.sharesToBurn} />
            <LpStatRow label="Asset A out" value={withdrawal.reserveAOut} />
            <LpStatRow label="Asset B out" value={withdrawal.reserveBOut} />
            <LpStatRow label="Min A (0.5% slip)" value={withdrawal.minReserveAOut} />
            <LpStatRow label="Min B (0.5% slip)" value={withdrawal.minReserveBOut} />
          </div>
        </div>
      )}

      {/* Pool metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-emerald-500/15">
        <LpStatRow label="Pool fee" value={result.feePct} mono={false} />
        <LpStatRow label="Spot A/B" value={result.spotPriceAperB} />
        <LpStatRow label="Spot B/A" value={result.spotPriceBperA} />
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Price impact</p>
          <p className={`text-xs font-medium font-mono ${impactColor}`}>
            {(impactBps / 100).toFixed(2)}% ({impactBps} bps)
          </p>
        </div>
      </div>

      {/* Composer link */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onUseInComposer}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          {isDeposit ? 'Build liquidityPoolDeposit in Composer' : 'Build liquidityPoolWithdraw in Composer'}
        </button>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Pre-fills pool ID, amounts, and price bounds from this quote.
        </p>
      </div>
    </div>
  );
}

export function SimulatorTool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useExampleOnboarding('simulate');

  // ── top-level tab: path payments vs LP pool quotes ─────────────────────
  type SimulatorTab = 'paths' | 'lp';
  const [activeTab, setActiveTab] = useState<SimulatorTab>(
    (searchParams.get('tab') as SimulatorTab) ?? 'paths',
  );

  const [network, setNetwork] = useState<NetworkChoice>(
    (searchParams.get('network') as NetworkChoice) ?? 'testnet',
  );
  const [direction, setDirection] = useState<Direction>(
    (searchParams.get('direction') as Direction) ?? 'strict_send',
  );

  const [srcType, setSrcType] = useState<AssetType>(
    searchParams.get('src_type') as AssetType ?? 'native',
  );
  const [srcCode, setSrcCode] = useState(searchParams.get('src_code') ?? '');
  const [srcIssuer, setSrcIssuer] = useState(searchParams.get('src_issuer') ?? '');

  const [dstType, setDstType] = useState<AssetType>(
    searchParams.get('dst_type') as AssetType ?? 'credit_alphanum4',
  );
  const [dstCode, setDstCode] = useState(searchParams.get('dst_code') ?? 'USDC');
  const [dstIssuer, setDstIssuer] = useState(
    searchParams.get('dst_issuer') ?? EXAMPLE_USDC_ISSUER,
  );

  const [amount, setAmount] = useState(searchParams.get('amount') ?? '10');

  const [paths, setPaths] = useState<SimulatedPath[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const loadExample = useCallback(() => {
    setSrcType('native');
    setSrcCode('');
    setSrcIssuer('');
    setDstType('credit_alphanum4');
    setDstCode('USDC');
    setDstIssuer(EXAMPLE_USDC_ISSUER);
    setAmount('10');
    setDirection('strict_send');

    setTimeout(() => {
      findSimulatorPaths({
        direction: 'strict_send',
        source_asset_type: 'native',
        amount: '10',
        destination_asset_type: 'credit_alphanum4',
        destination_asset_code: 'USDC',
        destination_asset_issuer: EXAMPLE_USDC_ISSUER,
        network: 'testnet',
      })
        .then((res) => {
          setPaths(res.paths);
          setHasSearched(true);
          markStepComplete();
        })
        .catch((err) => {
          setError(err.message);
        });
    }, 0);
  }, []);

  useEffect(() => {
    if (searchParams.get('example') === '1') {
      loadExample();
    }
  }, [searchParams, loadExample]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    params.set('network', network);
    params.set('direction', direction);
    params.set('src_type', srcType);
    params.set('dst_type', dstType);
    params.set('amount', amount);
    if (srcCode) params.set('src_code', srcCode);
    else params.delete('src_code');
    if (srcIssuer) params.set('src_issuer', srcIssuer);
    else params.delete('src_issuer');
    if (dstCode) params.set('dst_code', dstCode);
    else params.delete('dst_code');
    if (dstIssuer) params.set('dst_issuer', dstIssuer);
    else params.delete('dst_issuer');
    params.delete('example');
    const query = params.toString();
    if (window.location.search !== `?${query}`) {
      router.replace(`/simulator?${query}`, { scroll: false });
    }
  }, [activeTab, amount, direction, dstCode, dstIssuer, dstType, network, router, srcCode, srcIssuer, srcType]);

  const markStepComplete = () => {
    import('@/lib/onboarding').then((m) => m.markStepComplete('simulate'));
  };

  const handleFindPaths = async () => {
    setLoading(true);
    setError('');
    setPaths([]);

    try {
      const res = await findSimulatorPaths({
        direction,
        source_asset_type: srcType,
        source_asset_code: srcType !== 'native' ? srcCode : undefined,
        source_asset_issuer: srcType !== 'native' ? srcIssuer : undefined,
        amount,
        destination_asset_type: dstType,
        destination_asset_code: dstType !== 'native' ? dstCode : undefined,
        destination_asset_issuer: dstType !== 'native' ? dstIssuer : undefined,
        network,
      });
      setPaths(res.paths);
      setHasSearched(true);
      markStepComplete();
    } catch (err: any) {
      setError(err.message ?? 'Failed to find paths');
    } finally {
      setLoading(false);
    }
  };

  const handleUseInComposer = (path: SimulatedPath) => {
    const params = new URLSearchParams({
      operation: direction === 'strict_send' ? 'pathPaymentStrictSend' : 'pathPaymentStrictReceive',
      source_asset_type: path.source_asset.type,
      destination_asset_type: path.destination_asset.type,
      source_amount: path.source_amount,
      destination_amount: path.destination_amount,
      network,
    });
    if (path.source_asset.code) params.set('source_asset_code', path.source_asset.code);
    if (path.source_asset.issuer) params.set('source_asset_issuer', path.source_asset.issuer);
    if (path.destination_asset.code) params.set('destination_asset_code', path.destination_asset.code);
    if (path.destination_asset.issuer) params.set('destination_asset_issuer', path.destination_asset.issuer);
    if (path.path.length > 0) params.set('path_assets', JSON.stringify(path.path));
    router.push(`/composer?${params.toString()}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFindPaths();
  };

  return (
    <div className="space-y-6">
      {/* Top-level tab: Path Payments vs LP Pool Quote */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-secondary p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('paths')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'paths'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Path Payments
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lp')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'lp'
                ? 'bg-background shadow-sm text-emerald-600'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Droplets className="h-3.5 w-3.5" />
            LP Pool Quote
          </button>
        </div>

        {/* Network toggle — shared across both tabs */}
        <div className="flex bg-secondary p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setNetwork('mainnet')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              network === 'mainnet'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mainnet
          </button>
          <button
            type="button"
            onClick={() => setNetwork('testnet')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              network === 'testnet'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Testnet
          </button>
        </div>
      </div>

      {/* LP Pool Quote tab */}
      {activeTab === 'lp' && <LpQuotePanel network={network} />}

      {/* Path Payments tab */}
      {activeTab === 'paths' && (
        <>
      {/* Direction toggle row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex bg-secondary p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setDirection('strict_send')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              direction === 'strict_send'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Send exactly
          </button>
          <button
            type="button"
            onClick={() => setDirection('strict_receive')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              direction === 'strict_receive'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Receive exactly
          </button>
        </div>
      </div>

      {/* Asset pickers + amount */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <AssetPicker
            label="Source asset"
            assetType={srcType}
            assetCode={srcCode}
            assetIssuer={srcIssuer}
            onTypeChange={setSrcType}
            onCodeChange={setSrcCode}
            onIssuerChange={setSrcIssuer}
          />

          <div className="flex items-end pb-0.5">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>

          <AssetPicker
            label="Destination asset"
            assetType={dstType}
            assetCode={dstCode}
            assetIssuer={dstIssuer}
            onTypeChange={setDstType}
            onCodeChange={setDstCode}
            onIssuerChange={setDstIssuer}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[160px] max-w-[240px] space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !amount.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Find Paths
            </button>
            <button
              type="button"
              onClick={loadExample}
              className="px-4 py-2 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
            >
              Try XLM → USDC
            </button>
          </div>
        </div>
      </form>

      {/* Error */}
      {error && (
        <ErrorState
          title="Error finding paths"
          message={error}
          onRetry={handleFindPaths}
          retryLabel="Retry search"
          details={error}
        />
      )}

      {/* Results */}
      {loading ? (
        <SimulatorPathSkeleton />
      ) : hasSearched && !error ? (
        <div className="space-y-3">
          {paths.length === 0 ? (
            <NoResultsState direction={direction} onRetry={handleFindPaths} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {paths.length} route{paths.length !== 1 ? 's' : ''} found
              </p>
              {paths.map((path, i) => (
                <PathCard
                  key={i}
                  path={path}
                  direction={direction}
                  network={network}
                  onSelect={handleUseInComposer}
                />
              ))}
            </>
          )}
        </div>
      ) : null}

      {/* Empty state */}
      {!hasSearched && !loading && !error && (
        <SimulatorEmptyState onExample={loadExample} />
      )}
        </>
      )}
    </div>
  );
}
