'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  ClipboardPaste,
  Download,
  FileUp,
  Pause,
  Play,
  RefreshCw,
  ScanLine,
} from 'lucide-react';

import { ErrorState, LoadingState } from '@/components/tools/state-display';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import {
  QR_HANDOFF_MAX_PAYLOAD_CHARS,
  QrHandoffError,
  compareHandoffTransactions,
  createHandoffCollector,
  describeHandoffXdr,
  encodeHandoffFrames,
  type HandoffAcceptResult,
  type HandoffNetwork,
  type HandoffSignatureDiff,
  type HandoffTxSummary,
  type QrHandoffFrame,
} from '@/lib/qr-handoff';

type ScanState = {
  kind: 'idle' | 'starting' | 'scanning' | 'blocked';
  message: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof QrHandoffError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong';
}

function shortAddress(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function SummaryGrid({ summary }: { summary: HandoffTxSummary }) {
  const rows: Array<[string, string]> = [
    ['Network', summary.network],
    ['Source', shortAddress(summary.source)],
    ['Sequence', summary.sequence],
    ['Fee', summary.fee],
    ['Operations', String(summary.operationCount)],
    ['Signatures', String(summary.signatureCount)],
    ['Hash', shortAddress(summary.hash)],
  ];
  if (summary.timeBounds) {
    rows.push([
      'Time bounds',
      `${summary.timeBounds.minTime} – ${summary.timeBounds.maxTime}`,
    ]);
  }

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="font-mono text-xs text-foreground break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SignatureDiff({ diff }: { diff: HandoffSignatureDiff }) {
  if (diff.sameBody && diff.addedSignatures > 0) {
    return (
      <p className="text-xs text-emerald-600">
        {diff.addedSignatures} new signature
        {diff.addedSignatures === 1 ? '' : 's'} — the transaction body is unchanged, so
        importing merges them and keeps the {diff.currentSignatures} you already have.
      </p>
    );
  }
  if (diff.sameBody) {
    return (
      <p className="text-xs text-muted-foreground">
        Identical transaction and identical {diff.currentSignatures} signature
        {diff.currentSignatures === 1 ? '' : 's'}.
      </p>
    );
  }
  return (
    <p className="text-xs text-destructive">
      The imported envelope changes the transaction body
      {diff.removedSignatures > 0 ? ` and drops ${diff.removedSignatures} signature(s)` : ''}.
      Importing is blocked unless you explicitly replace your transaction.
    </p>
  );
}

/**
 * Offline XDR handoff with animated QR frames (Savitura/Savitools#344).
 */
export default function QrHandoffTool() {
  const [network, setNetwork] = useState<HandoffNetwork>('testnet');
  const [xdr, setXdr] = useState('');
  const [exportError, setExportError] = useState('');
  const [frames, setFrames] = useState<QrHandoffFrame[]>([]);
  const [frameImages, setFrameImages] = useState<string[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [animating, setAnimating] = useState(true);

  const [scan, setScan] = useState<ScanState>({ kind: 'idle', message: '' });
  const [received, setReceived] = useState(0);
  const [total, setTotal] = useState(0);
  const [scanNote, setScanNote] = useState('');
  const [pasteValue, setPasteValue] = useState('');
  const [fileNote, setFileNote] = useState('');

  const [pendingXdr, setPendingXdr] = useState('');
  const [preview, setPreview] = useState<HandoffTxSummary | null>(null);
  const [previewDiff, setPreviewDiff] = useState<HandoffSignatureDiff | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const collectorRef = useRef(createHandoffCollector(network));

  // Keep the collector on the network the user selected; a network switch
  // invalidates anything scanned so far.
  useEffect(() => {
    collectorRef.current = createHandoffCollector(network);
    setReceived(0);
    setTotal(0);
    setScanNote('');
    setScan((current) =>
      current.kind === 'scanning' ? { kind: 'scanning', message: current.message } : current,
    );
  }, [network]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const resetCollector = useCallback(() => {
    collectorRef.current.reset();
    setReceived(0);
    setTotal(0);
    setScanNote('');
    setPendingXdr('');
    setPreview(null);
    setPreviewDiff(null);
    setPreviewError('');
    setReplaceConfirmed(false);
  }, []);

  const generate = useCallback(() => {
    setExportError('');
    try {
      const next = encodeHandoffFrames(xdr, network);
      setFrames(next);
      setFrameIndex(0);
      setAnimating(true);
    } catch (error: unknown) {
      setFrames([]);
      setFrameImages([]);
      setExportError(errorMessage(error));
    }
  }, [network, xdr]);

  // Render each frame once; the animation then only swaps <img> sources.
  useEffect(() => {
    let cancelled = false;
    if (frames.length === 0) {
      setFrameImages([]);
      return;
    }

    Promise.all(
      frames.map((frame) =>
        QRCode.toDataURL(JSON.stringify(frame), {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 320,
        }),
      ),
    )
      .then((images) => {
        if (!cancelled) setFrameImages(images);
      })
      .catch((error: unknown) => {
        if (!cancelled) setExportError(errorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [frames]);

  useEffect(() => {
    if (!animating || frames.length < 2) return;
    const timer = setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, 800);
    return () => clearInterval(timer);
  }, [animating, frames.length]);

  const showPreview = useCallback(
    (incoming: string) => {
      setPreviewError('');
      setReplaceConfirmed(false);
      try {
        const summary = describeHandoffXdr(incoming, network);
        setPreview(summary);
        setPreviewDiff(
          xdr.trim() ? compareHandoffTransactions(xdr, incoming, network) : null,
        );
        setPendingXdr(incoming);
      } catch (error: unknown) {
        setPreview(null);
        setPreviewDiff(null);
        setPendingXdr('');
        setPreviewError(errorMessage(error));
      }
    },
    [network, xdr],
  );

  const handleScanResult = useCallback(
    (raw: string) => {
      const outcome: HandoffAcceptResult = collectorRef.current.accept(raw);
      setReceived(outcome.progress.received);
      setTotal(outcome.progress.total);

      switch (outcome.status) {
        case 'accepted':
          setScanNote(`Frame ${outcome.progress.received} of ${outcome.progress.total} received.`);
          break;
        case 'duplicate':
          setScanNote('Already had that frame — waiting for the rest.');
          break;
        case 'mismatched':
          setScanNote(outcome.message);
          break;
        case 'invalid':
          setScanNote(outcome.message);
          break;
        case 'complete':
          setScanNote('All frames received and checksum verified.');
          stopCamera();
          setScan({ kind: 'idle', message: '' });
          showPreview(outcome.xdr);
          break;
        default:
          setScanNote('');
      }
    },
    [showPreview, stopCamera],
  );

  const startCamera = useCallback(async () => {
    setScan({ kind: 'starting', message: 'Requesting camera access…' });
    setScanNote('');
    resetCollector();

    if (!navigator.mediaDevices?.getUserMedia) {
      setScan({
        kind: 'blocked',
        message:
          'Camera access is unavailable in this browser or context. Use the paste or file import below — it accepts the same transaction.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setScan({ kind: 'scanning', message: 'Point the camera at the frames.' });
    } catch {
      setScan({
        kind: 'blocked',
        message:
          'Camera permission was denied or no camera is available. The paste and file fallbacks below still work.',
      });
      stopCamera();
    }
  }, [resetCollector, stopCamera]);

  // Scan loop: decode whatever is on screen until the session completes.
  useEffect(() => {
    if (scan.kind !== 'scanning') return;

    let handle = 0;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (width > 0 && height > 0) {
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context) {
            context.drawImage(video, 0, 0, width, height);
            const image = context.getImageData(0, 0, width, height);
            const code = jsQR(image.data, width, height);
            if (code?.data) handleScanResult(code.data);
          }
        }
      }
      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [handleScanResult, scan.kind]);

  const acceptPending = useCallback(() => {
    if (!pendingXdr) return;
    if (previewDiff && !previewDiff.sameBody && !replaceConfirmed) return;
    setXdr(pendingXdr);
    setExportError('');
    resetCollector();
    setPendingXdr('');
    setPreview(null);
    setPreviewDiff(null);
  }, [pendingXdr, previewDiff, replaceConfirmed, resetCollector]);

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const text = (await file.text()).trim();
      setFileNote(`Loaded ${file.name}`);
      showPreview(text);
    },
    [showPreview],
  );

  const download = useCallback(() => {
    const blob = new Blob([xdr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `handoff-${network}.xdr`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [network, xdr]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(xdr);
      setScanNote('Transaction copied to the clipboard.');
    } catch {
      setScanNote('Copy was blocked by the browser — use Download instead.');
    }
  }, [xdr]);

  const currentSummary = useMemo(() => {
    if (!xdr.trim()) return null;
    try {
      return describeHandoffXdr(xdr, network);
    } catch {
      return null;
    }
  }, [network, xdr]);

  const blockedByBodyChange = Boolean(previewDiff && !previewDiff.sameBody);

  return (
    <ToolPageShell
      title="QR Handoff"
      description="Move an unsigned or partially signed transaction across an air gap with checksummed QR frames — scan out of order, review the envelope, then import."
      docsHref="/docs/qr-handoff"
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
              Network
              <select
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={network}
                onChange={(event) => setNetwork(event.target.value as HandoffNetwork)}
              >
                <option value="testnet">Testnet</option>
                <option value="mainnet">Mainnet</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copy}
                disabled={!xdr.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                Copy XDR
              </button>
              <button
                type="button"
                onClick={download}
                disabled={!xdr.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download file
              </button>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              Transaction XDR {currentSummary && `· ${currentSummary.operationCount} op(s) · ${currentSummary.signatureCount} sig(s)`}
            </span>
            <textarea
              rows={4}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
              placeholder="AAAA… base64 transaction envelope"
              value={xdr}
              onChange={(event) => setXdr(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Stored in this tab only. Export limits: {QR_HANDOFF_MAX_PAYLOAD_CHARS} characters.
            </p>
          </label>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Export ── */}
          <section className="rounded-lg border border-border bg-card p-5 space-y-4" aria-label="Export frames">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Export as QR frames</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={generate}
                  disabled={!xdr.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
                  Generate frames
                </button>
                <button
                  type="button"
                  onClick={() => setAnimating((value) => !value)}
                  disabled={frames.length < 2}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {animating ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {animating ? 'Pause' : 'Resume'}
                </button>
              </div>
            </div>

            {exportError && (
              <ErrorState title="Cannot export this transaction" message={exportError} />
            )}

            {frames.length === 0 && !exportError && (
              <p className="text-xs text-muted-foreground">
                Paste a transaction above and generate frames. Each frame carries its index,
                the frame count, and a CRC32 of both the chunk and the full payload.
              </p>
            )}

            {frames.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-center rounded-lg border border-border bg-white p-4">
                  {frameImages[frameIndex] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- QR frames are generated at runtime as data URLs
                    <img
                      src={frameImages[frameIndex]}
                      alt={`Handoff frame ${frameIndex + 1} of ${frames.length}`}
                      className="h-64 w-64"
                    />
                  ) : (
                    <LoadingState label="Rendering frames…" className="py-6" />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Frame {frameIndex + 1} of {frames.length}
                    {animating ? ' · animating' : ' · paused'}
                  </span>
                  <span className="font-mono">
                    {frames[frameIndex].id} · crc {frames[frameIndex].sum}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* ── Import ── */}
          <section className="rounded-lg border border-border bg-card p-5 space-y-4" aria-label="Import frames">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Scan QR frames</h2>
              <button
                type="button"
                onClick={scan.kind === 'scanning' ? stopCamera : startCamera}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {scan.kind === 'scanning' ? (
                  <CameraOff className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {scan.kind === 'scanning' ? 'Stop camera' : 'Start camera'}
              </button>
            </div>

            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full rounded-md border border-border bg-black ${scan.kind === 'scanning' ? '' : 'hidden'}`}
            />
            <canvas ref={canvasRef} className="hidden" />

            {scan.kind === 'starting' && <LoadingState label={scan.message} />}
            {scan.kind === 'blocked' && (
              <ErrorState title="Camera unavailable" message={scan.message} />
            )}
            {scan.kind === 'scanning' && (
              <p className="text-xs text-muted-foreground">{scan.message}</p>
            )}

            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Progress</p>
              <div className="h-2 w-full rounded bg-muted" role="progressbar"
                aria-valuenow={received}
                aria-valuemin={0}
                aria-valuemax={total || 0}
              >
                <div
                  className="h-2 rounded bg-primary transition-all"
                  style={{ width: total ? `${(received / total) * 100}%` : '0%' }}
                />
              </div>
              <p>
                {total ? `${received} / ${total} frames` : 'No frames scanned yet'}
              </p>
              {scanNote && <p className="text-foreground">{scanNote}</p>}
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-medium text-foreground">
                <ClipboardPaste className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                Fallback: paste the XDR or load it from a file
              </p>
              <textarea
                rows={3}
                aria-label="Paste transaction XDR"
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
                placeholder="AAAA…"
                value={pasteValue}
                onChange={(event) => setPasteValue(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => showPreview(pasteValue.trim())}
                  disabled={!pasteValue.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Preview pasted XDR
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                  Load file
                  <input
                    type="file"
                    accept=".xdr,.txt,text/plain"
                    className="hidden"
                    onChange={(event) => onFile(event.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  onClick={resetCollector}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset scan
                </button>
              </div>
              {fileNote && <p className="text-[11px] text-muted-foreground">{fileNote}</p>}
            </div>
          </section>
        </div>

        {previewError && (
          <ErrorState title="Cannot decode this envelope" message={previewError} />
        )}

        {preview && (
          <section className="rounded-lg border border-border bg-card p-5 space-y-4" aria-label="Import preview">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Review before importing</h2>
              <span className="text-[11px] text-muted-foreground">{preview.network}</span>
            </div>

            <SummaryGrid summary={preview} />
            {previewDiff && <SignatureDiff diff={previewDiff} />}

            {blockedByBodyChange && (
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={replaceConfirmed}
                  onChange={(event) => setReplaceConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                Replace my transaction with the imported body (discard the one loaded above).
              </label>
            )}

            <div className="flex items-center gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={acceptPending}
                disabled={blockedByBodyChange && !replaceConfirmed}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {previewDiff && !previewDiff.sameBody
                  ? 'Replace transaction'
                  : previewDiff && previewDiff.addedSignatures > 0
                    ? 'Merge signatures'
                    : 'Import transaction'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingXdr('');
                  setPreview(null);
                  setPreviewDiff(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              {blockedByBodyChange && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Blocked until you confirm the replacement.
                </span>
              )}
            </div>
          </section>
        )}
      </div>
    </ToolPageShell>
  );
}
