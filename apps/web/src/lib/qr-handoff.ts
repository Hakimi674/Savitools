/**
 * Offline XDR handoff using checksummed, animated QR frames
 * (Savitura/Savitools#344).
 *
 * The XDR a wallet receives is already base64, so a frame is a slice of that
 * string plus versioning, ordering and checksum metadata. Nothing is
 * re-encoded, which is what makes the round-trip byte-for-byte safe.
 *
 * Everything here is pure and synchronous so it can be unit tested without a
 * camera, a canvas or a DOM.
 */
import {
  FeeBumpTransaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

/** Frame format version. Bump when the envelope shape changes. */
export const QR_HANDOFF_VERSION = 1;

/** Characters of XDR carried by a single frame (keeps the QR dense but scannable). */
export const QR_HANDOFF_FRAME_CHARS = 512;

/** Hard ceiling on the XDR itself; anything larger is refused up front. */
export const QR_HANDOFF_MAX_PAYLOAD_CHARS = 100_000;

/** Hard ceiling on the frame count, even if the payload would fit. */
export const QR_HANDOFF_MAX_FRAMES = 256;

export type HandoffNetwork = 'testnet' | 'mainnet';

export const HANDOFF_NETWORK_PASSPHRASE: Record<HandoffNetwork, string> = {
  testnet: 'Test SDF Network ; September 2015',
  mainnet: 'Public Global Stellar Network ; September 2015',
};

export type QrHandoffErrorCode =
  | 'empty-payload'
  | 'payload-too-large'
  | 'too-many-frames'
  | 'not-a-frame'
  | 'unsupported-version'
  | 'checksum-mismatch'
  | 'network-mismatch'
  | 'session-mismatch'
  | 'index-out-of-range'
  | 'incomplete'
  | 'invalid-transaction';

export class QrHandoffError extends Error {
  constructor(
    readonly code: QrHandoffErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'QrHandoffError';
  }
}

export interface QrHandoffFrame {
  /** Format version. */
  v: number;
  /** Session id: payload checksum plus length, so mixed sessions are caught. */
  id: string;
  /** Network the frames were produced for. */
  net: HandoffNetwork;
  /** 0-based frame index. */
  i: number;
  /** Total frames in the session. */
  n: number;
  /** CRC32 (hex) of the complete XDR payload. */
  sum: string;
  /** CRC32 (hex) of this frame's chunk. */
  c: string;
  /** Slice of the base64 XDR. */
  d: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/** CRC32 of a string (UTF-8), returned as an unsigned 32-bit integer. */
export function crc32(input: string): number {
  const bytes = new TextEncoder().encode(input);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Hex encoder that works on browser Uint8Arrays as well as Node Buffers. */
function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

export function crc32Hex(input: string): string {
  return crc32(input).toString(16).padStart(8, '0');
}

function sessionId(payload: string, network: HandoffNetwork): string {
  return `${crc32Hex(payload)}-${payload.length}-${network}`;
}

/**
 * Splits `xdr` into ordered, checksummed frames ready for animation.
 *
 * @throws {QrHandoffError} when the payload is empty, oversized, or would need
 * more frames than the format allows.
 */
export function encodeHandoffFrames(
  xdr: string,
  network: HandoffNetwork,
): QrHandoffFrame[] {
  if (xdr.length === 0) {
    throw new QrHandoffError('empty-payload', 'Nothing to export: the XDR is empty.');
  }
  if (xdr.length > QR_HANDOFF_MAX_PAYLOAD_CHARS) {
    throw new QrHandoffError(
      'payload-too-large',
      `XDR is ${xdr.length} characters; the limit is ${QR_HANDOFF_MAX_PAYLOAD_CHARS}.`,
    );
  }

  const total = Math.ceil(xdr.length / QR_HANDOFF_FRAME_CHARS);
  if (total > QR_HANDOFF_MAX_FRAMES) {
    throw new QrHandoffError(
      'too-many-frames',
      `The payload needs ${total} frames; the limit is ${QR_HANDOFF_MAX_FRAMES}.`,
    );
  }

  const sum = crc32Hex(xdr);
  const id = sessionId(xdr, network);
  const frames: QrHandoffFrame[] = [];

  for (let index = 0; index < total; index += 1) {
    const chunk = xdr.slice(
      index * QR_HANDOFF_FRAME_CHARS,
      (index + 1) * QR_HANDOFF_FRAME_CHARS,
    );
    frames.push({
      v: QR_HANDOFF_VERSION,
      id,
      net: network,
      i: index,
      n: total,
      sum,
      c: crc32Hex(chunk),
      d: chunk,
    });
  }

  return frames;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses and fully validates a single scanned frame.
 *
 * @throws {QrHandoffError} when the text is not a frame, uses an unknown
 * version, or fails its own checksum.
 */
export function parseHandoffFrame(raw: string): QrHandoffFrame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new QrHandoffError('not-a-frame', 'Scanned text is not a handoff frame.');
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.v !== 'number' ||
    typeof parsed.id !== 'string' ||
    typeof parsed.net !== 'string' ||
    typeof parsed.i !== 'number' ||
    typeof parsed.n !== 'number' ||
    typeof parsed.sum !== 'string' ||
    typeof parsed.c !== 'string' ||
    typeof parsed.d !== 'string'
  ) {
    throw new QrHandoffError('not-a-frame', 'Scanned text is not a handoff frame.');
  }

  if (parsed.v !== QR_HANDOFF_VERSION) {
    throw new QrHandoffError(
      'unsupported-version',
      `Frame version ${parsed.v} is not supported (expected ${QR_HANDOFF_VERSION}).`,
    );
  }

  if (parsed.net !== 'testnet' && parsed.net !== 'mainnet') {
    throw new QrHandoffError('not-a-frame', 'Frame declares an unknown network.');
  }

  if (crc32Hex(parsed.d) !== parsed.c) {
    throw new QrHandoffError('checksum-mismatch', 'Frame checksum failed.');
  }

  if (!Number.isInteger(parsed.i) || !Number.isInteger(parsed.n) || parsed.n < 1) {
    throw new QrHandoffError('not-a-frame', 'Frame ordering metadata is invalid.');
  }

  return {
    v: parsed.v,
    id: parsed.id,
    net: parsed.net as HandoffNetwork,
    i: parsed.i,
    n: parsed.n,
    sum: parsed.sum,
    c: parsed.c,
    d: parsed.d,
  };
}

export interface HandoffProgress {
  received: number;
  total: number;
}

export type HandoffAcceptResult =
  | { status: 'accepted' | 'duplicate'; progress: HandoffProgress }
  | {
      status: 'mismatched';
      reason: 'network-mismatch' | 'session-mismatch';
      message: string;
      progress: HandoffProgress;
    }
  | { status: 'invalid'; code: QrHandoffErrorCode; message: string; progress: HandoffProgress }
  | { status: 'complete'; xdr: string; progress: HandoffProgress };

export interface HandoffCollector {
  accept(raw: string): HandoffAcceptResult;
  readonly progress: HandoffProgress;
  reset(): void;
}

/**
 * Collects frames in any order, deduplicates them, and only reconstructs once
 * every frame is present and the assembled payload matches its checksum.
 */
export function createHandoffCollector(network: HandoffNetwork): HandoffCollector {
  let chunks: (string | undefined)[] = [];
  let expected: { id: string; n: number; sum: string } | null = null;

  const progress = (): HandoffProgress => ({
    received: chunks.filter((chunk) => chunk !== undefined).length,
    total: expected?.n ?? 0,
  });

  const fail = (code: QrHandoffErrorCode, message: string): HandoffAcceptResult => ({
    status: 'invalid',
    code,
    message,
    progress: progress(),
  });

  return {
    get progress() {
      return progress();
    },

    reset() {
      chunks = [];
      expected = null;
    },

    accept(raw: string): HandoffAcceptResult {
      let frame: QrHandoffFrame;
      try {
        frame = parseHandoffFrame(raw);
      } catch (error: unknown) {
        const handoffError =
          error instanceof QrHandoffError
            ? error
            : new QrHandoffError('not-a-frame', 'Scanned text is not a handoff frame.');
        return fail(handoffError.code, handoffError.message);
      }

      if (frame.net !== network) {
        return {
          status: 'mismatched',
          reason: 'network-mismatch',
          message: `Frames are for ${frame.net}, but this handoff is on ${network}.`,
          progress: progress(),
        };
      }

      if (expected && frame.id !== expected.id) {
        return {
          status: 'mismatched',
          reason: 'session-mismatch',
          message: 'Frame belongs to a different transaction session.',
          progress: progress(),
        };
      }

      if (expected && (frame.n !== expected.n || frame.sum !== expected.sum)) {
        return {
          status: 'mismatched',
          reason: 'session-mismatch',
          message: 'Frame disagrees with the session it belongs to.',
          progress: progress(),
        };
      }

      if (frame.i >= frame.n) {
        return fail('index-out-of-range', `Frame index ${frame.i} is out of range.`);
      }

      if (!expected) {
        expected = { id: frame.id, n: frame.n, sum: frame.sum };
        chunks = new Array<string | undefined>(frame.n).fill(undefined);
      }

      if (chunks[frame.i] !== undefined) {
        return { status: 'duplicate', progress: progress() };
      }

      chunks[frame.i] = frame.d;

      const received = chunks.filter((chunk) => chunk !== undefined).length;
      if (received < expected.n) {
        return { status: 'accepted', progress: progress() };
      }

      const assembled = chunks.join('');
      if (crc32Hex(assembled) !== expected.sum) {
        chunks = new Array<string | undefined>(expected.n).fill(undefined);
        return fail('checksum-mismatch', 'Reassembled payload failed its checksum.');
      }

      const xdr = assembled;
      chunks = [];
      expected = null;
      return { status: 'complete', xdr, progress: { received: received, total: received } };
    },
  };
}

export interface HandoffTxSummary {
  network: HandoffNetwork;
  source: string;
  sequence: string;
  fee: string;
  operationCount: number;
  signatureCount: number;
  hash: string;
  timeBounds: { minTime: string; maxTime: string } | null;
  /** True when the envelope is a fee bump wrapping an inner transaction. */
  feeBump: boolean;
}

/**
 * Decodes an envelope for the pre-accept preview: network, source, sequence,
 * fee, operations and signature count.
 *
 * @throws {QrHandoffError} when the envelope cannot be decoded.
 */
export function describeHandoffXdr(
  xdr: string,
  network: HandoffNetwork,
): HandoffTxSummary {
  let transaction: FeeBumpTransaction | import('@stellar/stellar-sdk').Transaction;
  try {
    transaction = TransactionBuilder.fromXDR(
      xdr,
      HANDOFF_NETWORK_PASSPHRASE[network],
    );
  } catch {
    throw new QrHandoffError('invalid-transaction', 'The XDR is not a valid transaction envelope.');
  }

  const feeBump = transaction instanceof FeeBumpTransaction;
  const inner = feeBump
    ? (transaction as FeeBumpTransaction).innerTransaction
    : (transaction as import('@stellar/stellar-sdk').Transaction);

  const timeBounds = inner.timeBounds;
  const bounds =
    timeBounds && (timeBounds.minTime !== '0' || timeBounds.maxTime !== '0')
      ? { minTime: timeBounds.minTime, maxTime: timeBounds.maxTime }
      : null;

  return {
    network,
    source: inner.source,
    sequence: inner.sequence,
    fee: feeBump
      ? (transaction as FeeBumpTransaction).fee
      : String(inner.fee),
    operationCount: inner.operations.length,
    signatureCount: inner.signatures.length,
    hash: toHex(inner.hash()),
    timeBounds: bounds,
    feeBump,
  };
}

export interface HandoffSignatureDiff {
  /** False when the incoming envelope changes the transaction body. */
  sameBody: boolean;
  addedSignatures: number;
  removedSignatures: number;
  currentSignatures: number;
  incomingSignatures: number;
}

function signatureKeys(
  transaction: import('@stellar/stellar-sdk').Transaction,
): string[] {
  return transaction.signatures.map(
    (signature) => `${toHex(signature.hint())}:${toHex(signature.signature())}`,
  );
}

/**
 * Compares a locally loaded transaction with an imported one.
 *
 * The body hash ignores signatures, so a "same body, more signatures" import
 * is a merge candidate while any body change is reported as such and blocked
 * by default in the UI.
 *
 * @throws {QrHandoffError} when either envelope cannot be decoded.
 */
export function compareHandoffTransactions(
  currentXdr: string,
  incomingXdr: string,
  network: HandoffNetwork,
): HandoffSignatureDiff {
  const passphrase = HANDOFF_NETWORK_PASSPHRASE[network];
  const decode = (value: string): import('@stellar/stellar-sdk').Transaction => {
    let decoded: FeeBumpTransaction | import('@stellar/stellar-sdk').Transaction;
    try {
      decoded = TransactionBuilder.fromXDR(value, passphrase);
    } catch {
      throw new QrHandoffError('invalid-transaction', 'The XDR is not a valid transaction envelope.');
    }
    if (decoded instanceof FeeBumpTransaction) return decoded.innerTransaction;
    return decoded;
  };

  const current = decode(currentXdr);
  const incoming = decode(incomingXdr);

  const currentKeys = new Set(signatureKeys(current));
  const incomingKeys = new Set(signatureKeys(incoming));

  const addedSignatures = [...incomingKeys].filter((key) => !currentKeys.has(key)).length;
  const removedSignatures = [...currentKeys].filter((key) => !incomingKeys.has(key)).length;

  return {
    sameBody: equalBytes(current.hash(), incoming.hash()),
    addedSignatures,
    removedSignatures,
    currentSignatures: currentKeys.size,
    incomingSignatures: incomingKeys.size,
  };
}
