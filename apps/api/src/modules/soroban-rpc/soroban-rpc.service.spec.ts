import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SorobanRpcService } from './soroban-rpc.service';
import {
  MAX_PARAMS_BYTES,
  SOROBAN_RPC_METHODS,
  findRpcMethod,
  validateRpcParams,
} from './soroban-rpc.methods';

const TESTNET_URL = 'https://soroban-testnet.stellar.org';
const MAINNET_URL = 'https://mainnet.sorobanrpc.com';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

describe('SorobanRpcService (Savitura/Savitools#358)', () => {
  let service: SorobanRpcService;
  let fetchSpy: jest.SpyInstance;

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'STELLAR_RPC_URL') return TESTNET_URL;
      if (key === 'STELLAR_RPC_PUBLIC_URL') return MAINNET_URL;
      return undefined;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    service = new SorobanRpcService(config);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('method catalog', () => {
    it('publishes unique read-only methods with complete schemas', () => {
      const names = SOROBAN_RPC_METHODS.map((method) => method.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names).not.toContain('sendTransaction');
      expect(names).toEqual(expect.arrayContaining(['getHealth', 'getLatestLedger', 'getEvents']));

      for (const method of SOROBAN_RPC_METHODS) {
        expect(method.summary.length).toBeGreaterThan(0);
        expect(method.description.length).toBeGreaterThan(0);
        for (const param of method.params) {
          expect(param.name).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
          expect(typeof param.required).toBe('boolean');
          expect(param.description.length).toBeGreaterThan(0);
        }
      }
    });

    it('exposes the catalog through the service', () => {
      expect(service.listMethods().methods).toEqual(SOROBAN_RPC_METHODS);
      expect(service.getMethod('getLatestLedger')).toEqual(
        findRpcMethod('getLatestLedger'),
      );
      expect(() => service.getMethod('sendTransaction')).toThrow(NotFoundException);
    });
  });

  describe('parameter validation', () => {
    it('rejects unknown parameters instead of dropping them', () => {
      const spec = findRpcMethod('getLatestLedger')!;
      expect(() => validateRpcParams(spec, { nope: 1 })).toThrow(BadRequestException);
      expect(() => validateRpcParams(spec, { nope: 1 })).toThrow(
        'Unknown parameter "nope" for "getLatestLedger"',
      );
    });

    it('rejects missing and malformed required parameters', () => {
      const spec = findRpcMethod('getTransaction')!;
      expect(() => validateRpcParams(spec, {})).toThrow('"getTransaction.hash" is required');
      expect(() => validateRpcParams(spec, { hash: 'nope' })).toThrow(
        '64 hexadecimal characters',
      );
      expect(() => validateRpcParams(spec, { hash: 'a'.repeat(64) })).not.toThrow();
    });

    it('enforces ranges, item types and size limits', () => {
      const events = findRpcMethod('getEvents')!;
      expect(() => validateRpcParams(events, { limit: 0 })).toThrow('>= 1');
      expect(() => validateRpcParams(events, { limit: 1000 })).toThrow('<= 200');
      expect(() => validateRpcParams(events, { limit: 1.5 })).toThrow('integer');
      expect(() => validateRpcParams(events, { order: 'sideways' })).toThrow(
        'must be one of: asc, desc',
      );
      expect(() => validateRpcParams(events, { order: 'asc' })).not.toThrow();

      const entries = findRpcMethod('getLedgerEntries')!;
      expect(() =>
        validateRpcParams(entries, { keys: new Array(201).fill('AAAA') }),
      ).toThrow('at most 200 entries');
      expect(() => validateRpcParams(entries, { keys: [1] })).toThrow(
        'must be a string',
      );

      const oversized = `{"${'a'.repeat(MAX_PARAMS_BYTES)}": 1}`;
      expect(() => validateRpcParams(events, JSON.parse(oversized))).toThrow(
        'byte limit',
      );
    });
  });

  describe('execute', () => {
    it('forwards one JSON-RPC request to the configured testnet endpoint', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 7, result: { ledger: 5 } }));

      const result = await service.execute({ method: 'getLatestLedger' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(TESTNET_URL);
      const body = JSON.parse(String(init.body));
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('getLatestLedger');
      expect(body.params).toEqual({});
      expect(typeof body.id).toBe('number');
      expect(result).toMatchObject({ method: 'getLatestLedger', network: 'testnet', result: { ledger: 5 } });
      expect(typeof result.tookMs).toBe('number');
      expect(result.error).toBeUndefined();
    });

    it('never takes the endpoint host from the caller (SSRF guard)', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ result: {} }));

      await service.execute({
        method: 'simulateTransaction',
        params: { transaction: 'AAAA', resourceConfig: { note: 'https://169.254.169.254/' } },
        network: 'mainnet',
      });

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toBe(MAINNET_URL);
    });

    it('passes validated named parameters through untouched', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ result: { events: [] } }));
      const keys = ['a'.repeat(64)];

      await service.execute({
        method: 'getLedgerEntries',
        params: { keys, xdr: true },
      });

      const body = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
      expect(body.params).toEqual({ keys, xdr: true });
    });

    it('surfaces JSON-RPC errors without throwing', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }),
      );

      const result = await service.execute({ method: 'getHealth' });

      expect(result.error).toEqual({ code: -32601, message: 'Method not found' });
      expect(result.result).toBeUndefined();
    });

    it('rejects unsupported methods before any network call', async () => {
      await expect(service.execute({ method: 'sendTransaction' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.execute({ method: 'getLatestLedger', params: { nope: 1 } })).rejects.toThrow(
        BadRequestException,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('maps upstream HTTP failures and non-JSON bodies to 502', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }));
      await expect(service.execute({ method: 'getHealth' })).rejects.toThrow(
        BadGatewayException,
      );

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response);
      await expect(service.execute({ method: 'getHealth' })).rejects.toThrow(
        'non-JSON',
      );
    });

    it('maps transport failures to 502', async () => {
      fetchSpy.mockRejectedValue(new Error('socket hang up'));

      await expect(service.execute({ method: 'getHealth' })).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.execute({ method: 'getHealth' })).rejects.toThrow(
        'socket hang up',
      );
    });
  });
});
