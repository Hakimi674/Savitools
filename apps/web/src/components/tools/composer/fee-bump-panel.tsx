'use client';

import { buildFeeBump, FeeBumpResult, inspectFeeBump, FeeBumpInspectResult } from '@/lib/composer-api';
import { Loader2, WrapText } from 'lucide-react';
import { useState } from 'react';

interface FeeBumpPanelProps {
  network: 'testnet' | 'mainnet';
  /** Called when a fee-bump envelope was built — the result XDR feeds the shared preview/sign path. */
  onResult: (result: FeeBumpResult) => void;
}

/**
 * Fee-bump build mode (Savitura/Savitools#207) with layer inspection
 * (Savitura/Savitools#340). Wraps an existing classic envelope with a new
 * fee source and base fee; the server returns an unsigned envelope that is
 * signed in the browser like any other XDR.
 */
export function FeeBumpPanel({ network, onResult }: FeeBumpPanelProps) {
  const [open, setOpen] = useState(false);
  const [innerXdr, setInnerXdr] = useState('');
  const [feeSource, setFeeSource] = useState('');
  const [baseFee, setBaseFee] = useState('5000');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeeBumpResult | null>(null);
  const [inspect, setInspect] = useState<FeeBumpInspectResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const handleBuild = async () => {
    if (!innerXdr.trim() || !feeSource.trim() || !baseFee.trim()) {
      setError('Inner XDR, fee source, and base fee are all required.');
      return;
    }
    setBuilding(true);
    setError(null);
    try {
      const built = await buildFeeBump({
        innerXdr: innerXdr.trim(),
        feeSource: feeSource.trim(),
        baseFee: baseFee.trim(),
        network,
      });
      setResult(built);
      onResult(built);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'Failed to build fee-bump envelope');
    } finally {
      setBuilding(false);
    }
  };

  const handleInspect = async () => {
    if (!innerXdr.trim()) {
      setInspectError('Paste a fee-bump envelope XDR to inspect.');
      return;
    }
    setInspecting(true);
    setInspectError(null);
    try {
      const decoded = await inspectFeeBump(innerXdr.trim());
      setInspect(decoded);
    } catch (e) {
      setInspect(null);
      setInspectError(e instanceof Error ? e.message : 'Failed to inspect envelope');
    } finally {
      setInspecting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
          <WrapText className="h-3.5 w-3.5 text-violet-400" />
          Fee Bump
          <span className="text-[10px] font-normal text-muted-foreground">
            wrap a submitted transaction with a new fee
          </span>
        </span>
        <span className="text-[10px] text-muted-foreground">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-border/60 pt-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="fee-bump-inner-xdr"
              className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Inner Transaction XDR <span className="text-rose-400">*</span>
            </label>
            <textarea
              id="fee-bump-inner-xdr"
              value={innerXdr}
              onChange={(e) => setInnerXdr(e.target.value)}
              placeholder="AAAA… (classic transaction envelope, base64)"
              rows={3}
              spellCheck={false}
              className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 transition-colors resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="fee-bump-source"
                className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Fee Source <span className="text-rose-400">*</span>
              </label>
              <input
                id="fee-bump-source"
                type="text"
                value={feeSource}
                onChange={(e) => setFeeSource(e.target.value)}
                placeholder="G… (pays the bumped fee)"
                maxLength={56}
                spellCheck={false}
                className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="fee-bump-base-fee"
                className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Base Fee (stroops/op) <span className="text-rose-400">*</span>
              </label>
              <input
                id="fee-bump-base-fee"
                type="text"
                inputMode="numeric"
                value={baseFee}
                onChange={(e) => setBaseFee(e.target.value)}
                placeholder="5000"
                className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 transition-colors"
              />
            </div>
          </div>

          {error && <p className="text-[11px] text-rose-400">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleBuild()}
              disabled={building}
              className="flex items-center gap-1.5 bg-violet-600 text-white rounded-lg px-4 py-2 text-xs font-medium hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {building ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building…
                </>
              ) : (
                <>Build Fee Bump</>
              )}
            </button>
            <p className="text-[10px] text-muted-foreground">
              Unsigned envelope — sign it in the browser like any transaction.
            </p>
          </div>

          {result && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col gap-1.5 text-[11px]">
              <p className="text-emerald-300 font-semibold">Fee-bump envelope built</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <span>
                  Hash{' '}
                  <span className="font-mono text-foreground/80" title={result.hash}>
                    {result.hash.slice(0, 16)}…
                  </span>
                </span>
                <span>
                  Inner hash{' '}
                  <span className="font-mono text-foreground/80" title={result.innerHash}>
                    {result.innerHash.slice(0, 16)}…
                  </span>
                </span>
                <span>
                  Total fee <span className="font-mono text-foreground/80">{result.fee}</span> stroops
                </span>
                <span>
                  Ops <span className="font-mono text-foreground/80">{result.operationCount}</span>
                </span>
              </div>
              <p className="text-muted-foreground">
                Loaded into the XDR preview below — use Simulate or Sign &amp; Submit.
              </p>
            </div>
          )}

          {/* Layer inspection (Savitura/Savitools#340) */}
          <div className="border-t border-border/60 pt-3 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleInspect()}
                disabled={inspecting}
                className="flex items-center gap-1.5 border border-violet-500/50 text-violet-300 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-violet-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {inspecting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Decoding…
                  </>
                ) : (
                  <>Inspect Envelope</>
                )}
              </button>
              <p className="text-[10px] text-muted-foreground">
                Decode a fee-bump envelope — inner + outer layers, fees, and signatures.
              </p>
            </div>

            {inspectError && <p className="text-[11px] text-rose-400">{inspectError}</p>}

            {inspect && (
              <div className="rounded-lg border border-border/60 bg-background/30 p-3 flex flex-col gap-1.5 text-[11px]">
                <p className="font-semibold text-foreground/80">Outer envelope</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <span>
                    Fee source{' '}
                    <span className="font-mono text-foreground/80" title={inspect.feeSource}>
                      {inspect.feeSource.slice(0, 14)}…
                    </span>
                  </span>
                  <span>
                    Effective fee <span className="font-mono text-foreground/80">{inspect.effectiveFee}</span> stroops
                  </span>
                  <span>
                    Network minimum <span className="font-mono text-foreground/80">{inspect.networkMinimumFee}</span> stroops
                  </span>
                  <span>
                    Outer signatures <span className="font-mono text-foreground/80">{inspect.outerSignatures.length}</span>
                  </span>
                  <span className="sm:col-span-2">
                    Envelope hash{' '}
                    <span className="font-mono text-foreground/80" title={inspect.hash}>
                      {inspect.hash.slice(0, 20)}…
                    </span>
                  </span>
                </div>
                {BigInt(inspect.effectiveFee) < BigInt(inspect.networkMinimumFee) && (
                  <p className="text-amber-400">
                    Effective fee is below the network minimum for this inner transaction.
                  </p>
                )}

                <p className="font-semibold text-foreground/80 mt-1">Inner transaction</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <span>
                    Source{' '}
                    <span className="font-mono text-foreground/80" title={inspect.inner.source}>
                      {inspect.inner.source.slice(0, 14)}…
                    </span>
                  </span>
                  <span>
                    Sequence <span className="font-mono text-foreground/80">{inspect.inner.sequence}</span>
                  </span>
                  <span>
                    Inner fee <span className="font-mono text-foreground/80">{inspect.inner.fee}</span> stroops
                  </span>
                  <span>
                    Type <span className="font-mono text-foreground/80">{inspect.inner.isSoroban ? 'Soroban' : 'Classic'}</span>
                  </span>
                  <span className="sm:col-span-2">
                    Operations ({inspect.inner.operationCount}){' '}
                    <span className="font-mono text-foreground/80">{inspect.inner.operations.join(', ')}</span>
                  </span>
                  {inspect.inner.timeBounds && (
                    <span className="sm:col-span-2">
                      Time bounds{' '}
                      <span className="font-mono text-foreground/80">
                        {inspect.inner.timeBounds.minTime} → {inspect.inner.timeBounds.maxTime}
                      </span>
                    </span>
                  )}
                </div>
                {inspect.inner.signatures.length > 0 && (
                  <div className="text-muted-foreground">
                    Inner signatures{' '}
                    <span className="font-mono text-foreground/80">
                      {inspect.inner.signatureVerifications.filter(Boolean).length}/
                      {inspect.inner.signatures.length}
                    </span>{' '}
                    match the inner source key
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
