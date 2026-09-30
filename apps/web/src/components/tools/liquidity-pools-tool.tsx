'use client';

import {
  searchPools,
  getPoolDetails,
  calculateShareValue,
  watchPool,
  unwatchPool,
  getWatchedPools,
  type PoolDetails,
  type ShareValueResult,
  type WatchedPoolItem,
  type NetworkChoice,
} from '@/lib/api';
import { Loader2, RefreshCw, Search, Star, Trash2, Calculator, TrendingUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { ErrorState } from './state-display';

const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

interface AssetInput {
  type: 'native' | 'custom';
  code: string;
  issuer: string;
}

function assetToParam(asset: AssetInput): string {
  if (asset.type === 'native') return 'XLM';
  return `${asset.code}:${asset.issuer}`;
}

function shortKey(key: string): string {
  if (!key) return '—';
  return key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key;
}

export function LiquidityPoolsTool() {
  const [network, setNetwork] = useState<NetworkChoice>('testnet');
  const [assetA, setAssetA] = useState<AssetInput>({ type: 'native', code: 'XLM', issuer: '' });
  const [assetB, setAssetB] = useState<AssetInput>({ type: 'custom', code: 'USDC', issuer: TESTNET_USDC_ISSUER });
  
  const [searchResults, setSearchResults] = useState<PoolDetails[]>([]);
  const [selectedPool, setSelectedPool] = useState<PoolDetails | null>(null);
  const [shareAmount, setShareAmount] = useState('');
  const [shareValue, setShareValue] = useState<ShareValueResult | null>(null);
  
  const [watchedPools, setWatchedPools] = useState<WatchedPoolItem[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch watched pools on mount
  useEffect(() => {
    const fetchWatched = async () => {
      try {
        const pools = await getWatchedPools();
        setWatchedPools(pools);
      } catch (err) {
        // Not authenticated - that's okay
        console.log('Not authenticated or no watched pools');
      }
    };
    fetchWatched();
  }, []);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedPool(null);
    setShareValue(null);
    
    try {
      const results = await searchPools(assetToParam(assetA), assetToParam(assetB), network);
      setSearchResults(results);
      if (results.length === 0) {
        setError('No pools found for this asset pair');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [assetA, assetB, network]);

  const handleSelectPool = async (pool: PoolDetails) => {
    setSelectedPool(pool);
    setShareValue(null);
  };

  const handleCalculateValue = async () => {
    if (!selectedPool || !shareAmount) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await calculateShareValue({
        poolId: selectedPool.poolId,
        shares: shareAmount,
        network,
      });
      setShareValue(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleWatchPool = async () => {
    if (!selectedPool) return;
    
    try {
      const watched = await watchPool({
        poolId: selectedPool.poolId,
        assetA: selectedPool.assetA,
        assetB: selectedPool.assetB,
        network,
      });
      setWatchedPools([watched, ...watchedPools]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to watch pool');
    }
  };

  const handleUnwatchPool = async (id: string) => {
    try {
      await unwatchPool(id);
      setWatchedPools(watchedPools.filter((p: WatchedPoolItem) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unwatch pool');
    }
  };

  const handleLoadWatched = async (watched: WatchedPoolItem) => {
    setLoading(true);
    setError(null);
    
    try {
      const pool = await getPoolDetails(watched.poolId, watched.network as NetworkChoice);
      setSelectedPool(pool);
      setSearchResults([pool]);
      setNetwork(watched.network as NetworkChoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pool');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Network Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Network:</label>
        <div className="flex gap-2">
          {(['testnet', 'mainnet'] as NetworkChoice[]).map((n) => (
            <button
              key={n}
              onClick={() => setNetwork(n)}
              className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
                network === n
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-muted'
              }`}
            >
              {n.charAt(0).toUpperCase() + n.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Asset Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Asset A</label>
          <div className="flex gap-2">
            <button
              onClick={() => setAssetA({ ...assetA, type: 'native', code: 'XLM', issuer: '' })}
              className={`px-3 py-2 text-sm font-mono rounded-md border transition-colors ${
                assetA.type === 'native'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-muted'
              }`}
            >
              XLM (Native)
            </button>
            <input
              type="text"
              placeholder="CODE:ISSUER"
              value={assetA.type === 'custom' ? `${assetA.code}:${assetA.issuer}` : ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'XLM') {
                  setAssetA({ type: 'native', code: 'XLM', issuer: '' });
                } else if (val.includes(':')) {
                  const [code, issuer] = val.split(':');
                  setAssetA({ type: 'custom', code, issuer: issuer || '' });
                }
              }}
              className="flex-1 px-3 py-2 text-sm font-mono rounded-md border border-border bg-background"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Asset B</label>
          <div className="flex gap-2">
            <button
              onClick={() => setAssetB({ ...assetB, type: 'native', code: 'XLM', issuer: '' })}
              className={`px-3 py-2 text-sm font-mono rounded-md border transition-colors ${
                assetB.type === 'native'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-muted'
              }`}
            >
              XLM (Native)
            </button>
            <input
              type="text"
              placeholder="CODE:ISSUER"
              value={assetB.type === 'custom' ? `${assetB.code}:${assetB.issuer}` : ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'XLM') {
                  setAssetB({ type: 'native', code: 'XLM', issuer: '' });
                } else if (val.includes(':')) {
                  const [code, issuer] = val.split(':');
                  setAssetB({ type: 'custom', code, issuer: issuer || '' });
                }
              }}
              className="flex-1 px-3 py-2 text-sm font-mono rounded-md border border-border bg-background"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleSearch}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        Search Pools
      </button>

      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      {/* Watched Pools */}
      {watchedPools.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Star className="h-4 w-4" />
            Watched Pools
          </h3>
          <div className="space-y-2">
            {watchedPools.map((watched) => (
              <div
                key={watched.id}
                className="flex items-center justify-between p-3 rounded-md border border-border bg-background"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium">{watched.label || `${watched.assetA}/${watched.assetB}`}</div>
                  <div className="text-xs text-muted-foreground">{shortKey(watched.poolId)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleLoadWatched(watched)}
                    className="p-2 rounded-md hover:bg-muted transition-colors"
                    title="Load pool"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleUnwatchPool(watched.id)}
                    className="p-2 rounded-md hover:bg-muted transition-colors text-destructive"
                    title="Remove from watchlist"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Found Pools</h3>
          <div className="space-y-2">
            {searchResults.map((pool) => (
              <div
                key={pool.poolId}
                onClick={() => handleSelectPool(pool)}
                className={`p-4 rounded-md border cursor-pointer transition-colors ${
                  selectedPool?.poolId === pool.poolId
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium">{pool.assetA} / {pool.assetB}</div>
                    <div className="text-xs text-muted-foreground font-mono">{shortKey(pool.poolId)}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-medium">{pool.feePct}</div>
                    <div className="text-xs text-muted-foreground">{pool.totalTrustlines} trustlines</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Reserve A</div>
                    <div className="font-mono">{pool.reserveA}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Reserve B</div>
                    <div className="font-mono">{pool.reserveB}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected Pool Details & Share Calculator */}
      {selectedPool && (
        <div className="space-y-4 p-4 rounded-md border border-border bg-background">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Share Value Calculator
            </h3>
            <button
              onClick={handleWatchPool}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              title="Add to watchlist"
            >
              <Star className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Total Shares</div>
              <div className="font-mono">{selectedPool.totalShares}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Spot Price (A/B)</div>
              <div className="font-mono">{selectedPool.spotPriceAperB}</div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Your LP Shares</label>
            <input
              type="text"
              placeholder="e.g. 100.0000000"
              value={shareAmount}
              onChange={(e) => setShareAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-md border border-border bg-background"
            />
          </div>

          <button
            onClick={handleCalculateValue}
            disabled={loading || !shareAmount}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            Calculate Value
          </button>

          {shareValue && (
            <div className="space-y-3 p-4 rounded-md bg-muted">
              <h4 className="text-sm font-medium">Share Value</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">{shareValue.assetA} Value</div>
                  <div className="font-mono font-medium">{shareValue.valueA}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{shareValue.assetB} Value</div>
                  <div className="font-mono font-medium">{shareValue.valueB}</div>
                </div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Pool Ownership</div>
                <div className="font-mono font-medium">{shareValue.sharePercentage}%</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
