import { BadRequestException } from '@nestjs/common';

/**
 * Whitelisted Soroban RPC surface for the method console
 * (Savitura/Savitools#358).
 *
 * Every method below is read-only: the console forwards a single JSON-RPC
 * request to the configured RPC endpoint and returns what came back.
 * `sendTransaction` and anything else that mutates ledger state is
 * deliberately absent, which is also why the endpoint takes no URL from the
 * caller — the target host always comes from `STELLAR_RPC_URL`.
 */

export type RpcParamType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object';

export interface RpcParamSpec {
  readonly name: string;
  readonly type: RpcParamType;
  readonly required: boolean;
  readonly description: string;
  readonly example?: unknown;
  /** Declared member type for `array` parameters. */
  readonly itemType?: 'string' | 'integer';
  /**
   * Extra shape check applied to string values (hashes, base64 envelopes…).
   * Kept as a source string so the catalog serializes cleanly over JSON and the
   * console can render the constraint.
   */
  readonly pattern?: string;
  /** Human-readable text shown next to `pattern` in the console. */
  readonly patternHint?: string;
  readonly min?: number;
  readonly max?: number;
  /** Closed set of accepted values; the console renders these as a select. */
  readonly enum?: readonly string[];
  /** Maximum number of entries for `array` parameters. */
  readonly maxItems?: number;
}

export interface RpcMethodSpec {
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly params: readonly RpcParamSpec[];
}

const HEX_64 = '^[0-9a-fA-F]{64}$';
const BASE64 = '^[A-Za-z0-9+/=\\s]+$';

export const SOROBAN_RPC_METHODS: readonly RpcMethodSpec[] = [
  {
    name: 'getHealth',
    summary: 'Report whether the RPC server is healthy',
    description:
      'Returns the server status and, when unhealthy, the reason. Useful as a first check when the console cannot reach anything else.',
    params: [],
  },
  {
    name: 'getNetwork',
    summary: 'Describe the network the server is connected to',
    description:
      'Returns the network passphrase, protocol version, friendbot URL and the current Soroban protocol version.',
    params: [],
  },
  {
    name: 'getLatestLedger',
    summary: 'Read the newest ledger the server has ingested',
    description:
      'Returns the latest ledger sequence number and the protocol version the server is running.',
    params: [],
  },
  {
    name: 'getLedgerEntries',
    summary: 'Read raw ledger entries by XDR key',
    description:
      'Fetches the current value of the given ledger entries (accounts, contracts, contract data, ttl). Keys are base64-encoded `LedgerKey` XDR.',
    params: [
      {
        name: 'keys',
        type: 'array',
        itemType: 'string',
        required: true,
        maxItems: 200,
        description: 'Base64-encoded LedgerKey XDR entries to resolve.',
        example: ['AAAA'],
      },
      {
        name: 'xdr',
        type: 'boolean',
        required: false,
        description: 'Ask the server to return the entries as base64 XDR.',
        example: true,
      },
    ],
  },
  {
    name: 'getTransaction',
    summary: 'Fetch one transaction by hash',
    description:
      'Returns the transaction envelope, result and metadata when the server has it, or `status: NOT_FOUND`.',
    params: [
      {
        name: 'hash',
        type: 'string',
        required: true,
        pattern: HEX_64,
        patternHint: '64 hexadecimal characters',
        description: 'Transaction hash to look up.',
        example: 'e9f2a4e2c0f1c1b1e1a1d1b1c1a1f1e1d1c1b1a1f1e1d1c1b1a1f1e1d1c1b1a1',
      },
    ],
  },
  {
    name: 'getTransactions',
    summary: 'Fetch a page of transactions by hash',
    description:
      'Returns transaction summaries for the requested hashes, optionally starting at a ledger.',
    params: [
      {
        name: 'ids',
        type: 'array',
        itemType: 'string',
        required: true,
        maxItems: 200,
        description: 'Transaction hashes to look up.',
        example: [
          'e9f2a4e2c0f1c1b1e1a1d1b1c1a1f1e1d1c1b1a1f1e1d1c1b1a1f1e1d1c1b1a1',
        ],
      },
      {
        name: 'startLedger',
        type: 'integer',
        required: false,
        min: 0,
        description: 'Ledger sequence to start the page from.',
        example: 1000,
      },
      {
        name: 'pagination',
        type: 'object',
        required: false,
        description: 'Optional `limit`/`cursor` pagination object.',
        example: { limit: 10 },
      },
    ],
  },
  {
    name: 'getEvents',
    summary: 'Page through Soroban contract events',
    description:
      'Returns contract events matching the supplied filters, from `startLedger` or a cursor.',
    params: [
      {
        name: 'startLedger',
        type: 'integer',
        required: false,
        min: 0,
        description: 'Ledger sequence to start scanning from (mutually exclusive with cursor).',
        example: 1000,
      },
      {
        name: 'filters',
        type: 'array',
        required: false,
        maxItems: 5,
        description: 'Event filter objects (type, contract ids, topics) as accepted by the RPC spec.',
        example: [{ type: 'contract', contractIds: ['CBQ…'] }],
      },
      {
        name: 'cursor',
        type: 'string',
        required: false,
        description: 'Opaque pagination cursor returned by a previous call.',
      },
      {
        name: 'limit',
        type: 'integer',
        required: false,
        min: 1,
        max: 200,
        description: 'Maximum number of events to return (1-200).',
        example: 50,
      },
      {
        name: 'order',
        type: 'string',
        required: false,
        enum: ['asc', 'desc'],
        description: 'Scan direction.',
        example: 'desc',
      },
    ],
  },
  {
    name: 'simulateTransaction',
    summary: 'Simulate a transaction without submitting it',
    description:
      'Dry-runs a base64 `TransactionEnvelope` and returns the simulated resource usage, return value, events and footprint. Nothing is written to the ledger.',
    params: [
      {
        name: 'transaction',
        type: 'string',
        required: true,
        pattern: BASE64,
        patternHint: 'base64-encoded TransactionEnvelope XDR',
        description: 'Base64 XDR of the transaction to simulate.',
      },
      {
        name: 'resourceConfig',
        type: 'object',
        required: false,
        description: 'Optional resource fee configuration override.',
        example: { instructionLimit: 100000000 },
      },
      {
        name: 'auth',
        type: 'array',
        required: false,
        maxItems: 64,
        description: 'Optional auth entries used during the simulation.',
      },
    ],
  },
];

const METHOD_INDEX = new Map(
  SOROBAN_RPC_METHODS.map((method) => [method.name, method]),
);

/** Upper bound on the serialized `params` object accepted from the console. */
export const MAX_PARAMS_BYTES = 64 * 1024;

export function findRpcMethod(name: string): RpcMethodSpec | undefined {
  return METHOD_INDEX.get(name);
}

export function listRpcMethods(): readonly RpcMethodSpec[] {
  return SOROBAN_RPC_METHODS;
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function checkScalar(spec: RpcMethodSpec, param: RpcParamSpec, value: unknown): void {
  const at = `"${spec.name}.${param.name}"`;

  switch (param.type) {
    case 'string': {
      if (typeof value !== 'string') {
        throw new BadRequestException(`${at} must be a string, received ${typeName(value)}`);
      }
      if (param.pattern && !new RegExp(param.pattern).test(value)) {
        throw new BadRequestException(
          `${at} must match ${param.patternHint ?? param.pattern}`,
        );
      }
      if (param.enum && !param.enum.includes(value)) {
        throw new BadRequestException(
          `${at} must be one of: ${param.enum.join(', ')}`,
        );
      }
      return;
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException(`${at} must be a number, received ${typeName(value)}`);
      }
      if (param.type === 'integer' && !Number.isInteger(value)) {
        throw new BadRequestException(`${at} must be an integer`);
      }
      if (param.min !== undefined && value < param.min) {
        throw new BadRequestException(`${at} must be >= ${param.min}`);
      }
      if (param.max !== undefined && value > param.max) {
        throw new BadRequestException(`${at} must be <= ${param.max}`);
      }
      return;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        throw new BadRequestException(`${at} must be a boolean, received ${typeName(value)}`);
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        throw new BadRequestException(`${at} must be an array, received ${typeName(value)}`);
      }
      if (param.maxItems !== undefined && value.length > param.maxItems) {
        throw new BadRequestException(`${at} accepts at most ${param.maxItems} entries`);
      }
      if (param.itemType === 'string') {
        value.forEach((item, index) => {
          if (typeof item !== 'string') {
            throw new BadRequestException(
              `${at}[${index}] must be a string, received ${typeName(item)}`,
            );
          }
          if (param.pattern && !new RegExp(param.pattern).test(item)) {
            throw new BadRequestException(
              `${at}[${index}] must match ${param.patternHint ?? param.pattern}`,
            );
          }
        });
      }
      if (param.itemType === 'integer') {
        value.forEach((item, index) => {
          if (typeof item !== 'number' || !Number.isInteger(item)) {
            throw new BadRequestException(`${at}[${index}] must be an integer`);
          }
        });
      }
      return;
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new BadRequestException(`${at} must be an object, received ${typeName(value)}`);
      }
      return;
    }
    default: {
      throw new BadRequestException(`${at} has an unsupported schema type`);
    }
  }
}

/**
 * Validates `params` against the method schema and returns the normalized
 * object that is forwarded to the RPC server.
 *
 * Unknown keys are rejected rather than dropped: a typo should fail loudly in
 * the console instead of silently producing a different call.
 */
export function validateRpcParams(
  spec: RpcMethodSpec,
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const provided = params ?? {};
  const serialized = JSON.stringify(provided);
  if (serialized.length > MAX_PARAMS_BYTES) {
    throw new BadRequestException(
      `params exceeds the ${MAX_PARAMS_BYTES} byte limit for "${spec.name}"`,
    );
  }

  const allowed = spec.params.map((param) => param.name);
  const unknown = Object.keys(provided).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new BadRequestException(
      `Unknown parameter${unknown.length > 1 ? 's' : ''} ${unknown
        .map((key) => `"${key}"`)
        .join(', ')} for "${spec.name}"; allowed: ${allowed.join(', ') || '(none)'}`,
    );
  }

  for (const param of spec.params) {
    const value = provided[param.name];
    if (value === undefined || value === null) {
      if (param.required) {
        throw new BadRequestException(`"${spec.name}.${param.name}" is required`);
      }
      continue;
    }
    checkScalar(spec, param, value);
  }

  return provided;
}
