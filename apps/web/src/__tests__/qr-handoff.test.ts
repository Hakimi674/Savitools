/**
 * Offline XDR handoff (Savitura/Savitools#344): frame ordering, checksums,
 * size limits, signature merge and network mismatch.
 *
 * The camera path is exercised separately by the tool component; everything
 * here is the pure format logic the acceptance criteria describe.
 */
import {
  Account,
  Asset,
  FeeBumpTransaction,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

import {
  HANDOFF_NETWORK_PASSPHRASE,
  QR_HANDOFF_FRAME_CHARS,
  QR_HANDOFF_MAX_FRAMES,
  QR_HANDOFF_MAX_PAYLOAD_CHARS,
  QR_HANDOFF_VERSION,
  QrHandoffError,
  compareHandoffTransactions,
  createHandoffCollector,
  crc32,
  crc32Hex,
  describeHandoffXdr,
  encodeHandoffFrames,
  parseHandoffFrame,
} from '@/lib/qr-handoff';

function buildEnvelope(options: { amount?: string; memo?: string } = {}): string {
  const source = Keypair.random();
  const destination = Keypair.random();
  const builder = new TransactionBuilder(
    new Account(source.publicKey(), '1'),
    { networkPassphrase: Networks.TESTNET, fee: '100' },
  )
    .addOperation(
      Operation.payment({
        destination: destination.publicKey(),
        asset: Asset.native(),
        amount: options.amount ?? '25',
      }),
    )
    .setTimeout(0);

  const transaction = builder.build();
  transaction.sign(source);
  return transaction.toEnvelope().toXDR('base64');
}

function signWithExtraKey(envelope: string): string {
  const decoded = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
  if (decoded instanceof FeeBumpTransaction) throw new Error('unexpected fee bump');
  decoded.sign(Keypair.random());
  return decoded.toEnvelope().toXDR('base64');
}

describe('qr-handoff frame format', () => {
  const xdr = buildEnvelope();
  // A padded payload guarantees the multi-frame paths (ordering, dedupe,
  // partial progress) are exercised regardless of how short the real
  // envelope happens to be. The collector never decodes the payload itself.
  const longXdr = `${xdr}${'A'.repeat(QR_HANDOFF_FRAME_CHARS)}`;
  const longFrames = encodeHandoffFrames(longXdr, 'testnet');

  it('computes the standard CRC32', () => {
    expect(crc32('')).toBe(0);
    expect(crc32('123456789')).toBe(0xcbf43926);
  });

  it('round-trips the XDR byte for byte', () => {
    const frames = encodeHandoffFrames(xdr, 'testnet');
    const collector = createHandoffCollector('testnet');

    let outcome = collector.accept(JSON.stringify(frames[0]));
    for (const frame of frames.slice(1)) {
      outcome = collector.accept(JSON.stringify(frame));
    }

    expect(outcome.status).toBe('complete');
    expect(outcome.status === 'complete' ? outcome.xdr : '').toBe(xdr);
  });

  it('rebuilds frames scanned out of order', () => {
    const frames = encodeHandoffFrames(xdr, 'testnet').reverse();
    const collector = createHandoffCollector('testnet');

    const results = frames.map((frame) => collector.accept(JSON.stringify(frame)));
    const complete = results.at(-1);

    expect(complete?.status).toBe('complete');
    expect(complete?.status === 'complete' && complete.xdr).toBe(xdr);
    expect(results.slice(0, -1).every((result) => result.status === 'accepted')).toBe(true);
  });

  it('sizes frames within the per-frame limit', () => {
    const long = `${xdr}${'A'.repeat(QR_HANDOFF_FRAME_CHARS * 3)}`;
    const frames = encodeHandoffFrames(long, 'testnet');

    expect(frames).toHaveLength(Math.ceil(long.length / QR_HANDOFF_FRAME_CHARS));
    expect(frames.every((frame) => frame.d.length <= QR_HANDOFF_FRAME_CHARS)).toBe(true);
    expect(frames.map((frame) => frame.i)).toEqual(frames.map((_, index) => index));
    expect(new Set(frames.map((frame) => frame.id)).size).toBe(1);
    expect(new Set(frames.map((frame) => frame.sum)).size).toBe(1);
    expect(frames.every((frame) => frame.v === QR_HANDOFF_VERSION)).toBe(true);
    expect(frames.every((frame) => frame.net === 'testnet')).toBe(true);
  });

  it('deduplicates repeated frames without changing progress', () => {
    expect(longFrames.length).toBeGreaterThan(1);
    const collector = createHandoffCollector('testnet');

    const first = collector.accept(JSON.stringify(longFrames[0]));
    const duplicate = collector.accept(JSON.stringify(longFrames[0]));

    expect(first).toMatchObject({ status: 'accepted', progress: { received: 1 } });
    expect(duplicate).toMatchObject({ status: 'duplicate', progress: { received: 1 } });
  });

  it('never completes while a frame is missing', () => {
    const frames = longFrames;
    expect(frames.length).toBeGreaterThan(1);

    const collector = createHandoffCollector('testnet');
    const statuses = frames
      .slice(1)
      .map((frame) => collector.accept(JSON.stringify(frame)));

    expect(statuses.every((status) => status.status === 'accepted')).toBe(true);
    expect(statuses.some((status) => status.status === 'complete')).toBe(false);
    expect(collector.progress).toEqual({ received: frames.length - 1, total: frames.length });
  });

  it('rejects frames whose payload was tampered with', () => {
    const frames = encodeHandoffFrames(xdr, 'testnet');
    // Pick a replacement that actually changes the chunk (the last base64
    // character may already be a `B`).
    const chunk = frames[0].d;
    const last = chunk.slice(0, -1);
    const replacement = chunk.endsWith('B') ? 'C' : 'B';
    const tampered = { ...frames[0], d: `${last}${replacement}` };

    const outcome = createHandoffCollector('testnet').accept(JSON.stringify(tampered));

    expect(outcome).toMatchObject({ status: 'invalid', code: 'checksum-mismatch' });
  });

  it('rejects a tampered payload even when the frame checksum is recomputed', () => {
    const frames = encodeHandoffFrames(xdr, 'testnet');
    const chunk = frames[0].d;
    const tamperedChunk = `${chunk.slice(0, -1)}${chunk.endsWith('B') ? 'C' : 'B'}`;
    const tampered = {
      ...frames[0],
      d: tamperedChunk,
      c: crc32Hex(tamperedChunk),
    };

    const outcome = createHandoffCollector('testnet').accept(JSON.stringify(tampered));

    expect(outcome).toMatchObject({ status: 'invalid', code: 'checksum-mismatch' });
  });

  it('rejects text that is not a frame', () => {
    const collector = createHandoffCollector('testnet');

    expect(collector.accept('hello world')).toMatchObject({
      status: 'invalid',
      code: 'not-a-frame',
    });
    expect(
      collector.accept(
        JSON.stringify({ ...encodeHandoffFrames(xdr, 'testnet')[0], v: 99 }),
      ),
    ).toMatchObject({ status: 'invalid', code: 'unsupported-version' });
  });

  it('refuses frames from a different transaction session', () => {
    const other = encodeHandoffFrames(
      `${buildEnvelope({ amount: '99' })}${'A'.repeat(QR_HANDOFF_FRAME_CHARS)}`,
      'testnet',
    );
    const collector = createHandoffCollector('testnet');
    collector.accept(JSON.stringify(longFrames[0]));

    expect(collector.accept(JSON.stringify(other[0]))).toMatchObject({
      status: 'mismatched',
      reason: 'session-mismatch',
    });
  });

  it('refuses frames produced for another network', () => {
    const mainnet = encodeHandoffFrames(xdr, 'mainnet');
    const outcome = createHandoffCollector('testnet').accept(JSON.stringify(mainnet[0]));

    expect(outcome).toMatchObject({ status: 'mismatched', reason: 'network-mismatch' });
    expect(outcome.status === 'mismatched' && outcome.message).toMatch(/mainnet/);
  });

  it('enforces the payload and frame limits', () => {
    expect(() => encodeHandoffFrames('', 'testnet')).toThrow(QrHandoffError);
    expect(() => encodeHandoffFrames('', 'testnet')).toThrow('empty');

    expect(() =>
      encodeHandoffFrames('A'.repeat(QR_HANDOFF_MAX_PAYLOAD_CHARS + 1), 'testnet'),
    ).toThrow('limit');

    expect(QR_HANDOFF_MAX_FRAMES).toBeGreaterThan(1);

    const frame = encodeHandoffFrames(xdr, 'testnet')[0];
    expect(() => parseHandoffFrame(JSON.stringify({ ...frame, i: frame.n }))).not.toThrow();
    expect(
      createHandoffCollector('testnet').accept(JSON.stringify({ ...frame, i: frame.n })),
    ).toMatchObject({ status: 'invalid', code: 'index-out-of-range' });
  });
});

describe('qr-handoff transaction preview', () => {
  it('summarizes network, source, sequence, fee, operations and signatures', () => {
    const xdr = buildEnvelope();
    const summary = describeHandoffXdr(xdr, 'testnet');

    expect(summary.network).toBe('testnet');
    expect(summary.source).toMatch(/^G[A-Z2-7]{55}$/);
    // The builder consumes the account sequence (1) and issues sequence 2.
    expect(summary.sequence).toBe('2');
    expect(summary.fee).toBe('100');
    expect(summary.operationCount).toBe(1);
    expect(summary.signatureCount).toBe(1);
    expect(summary.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(summary.feeBump).toBe(false);
    expect(HANDOFF_NETWORK_PASSPHRASE.mainnet).toContain('Public Global');
  });

  it('rejects envelopes that do not decode', () => {
    expect(() => describeHandoffXdr('not-xdr', 'testnet')).toThrow(QrHandoffError);
    try {
      describeHandoffXdr('not-xdr', 'testnet');
    } catch (error) {
      expect((error as QrHandoffError).code).toBe('invalid-transaction');
    }
  });

  it('highlights added signatures and blocks changed bodies', () => {
    const unsigned = buildEnvelope();
    const resigned = signWithExtraKey(unsigned);
    const different = buildEnvelope({ amount: '26' });

    const merge = compareHandoffTransactions(unsigned, resigned, 'testnet');
    expect(merge).toMatchObject({
      sameBody: true,
      addedSignatures: 1,
      removedSignatures: 0,
      currentSignatures: 1,
      incomingSignatures: 2,
    });

    const bodyChange = compareHandoffTransactions(unsigned, different, 'testnet');
    expect(bodyChange.sameBody).toBe(false);
    expect(bodyChange.addedSignatures).toBeGreaterThanOrEqual(0);
  });

  it('binds the preview to the network passphrase', () => {
    const xdr = buildEnvelope();
    const testnet = describeHandoffXdr(xdr, 'testnet');
    const mainnet = describeHandoffXdr(xdr, 'mainnet');

    expect(mainnet.network).toBe('mainnet');
    // The body hash is computed over the passphrase, so a preview built for
    // the wrong network is detectable instead of silently accepted.
    expect(mainnet.hash).not.toBe(testnet.hash);
    expect(testnet.hash).toBe(describeHandoffXdr(xdr, 'testnet').hash);
  });
});
