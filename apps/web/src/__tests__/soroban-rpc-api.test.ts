/**
 * @jest-environment node
 *
 * Soroban RPC console (Savitura/Savitools#358): the three wrappers in
 * `lib/api.ts` must hit the versioned routes the API actually serves and send
 * the JSON-RPC body the console expects.
 */
import { executeSorobanRpc, getSorobanRpcMethod, listSorobanRpcMethods } from '@/lib/api';

const originalFetch = global.fetch;

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe('Soroban RPC wrappers', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists the method catalog with a GET on the versioned route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ methods: [] }));

    await expect(listSorobanRpcMethods()).resolves.toEqual({ methods: [] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/soroban-rpc/methods');
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('describes a single method through the path-parameter route', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ name: 'getHealth', summary: 's', description: 'd', params: [] }),
    );

    const method = await getSorobanRpcMethod('getHealth');

    expect(method.name).toBe('getHealth');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3001/api/v1/soroban-rpc/methods/getHealth');
  });

  it('posts method, params and network to the execute route', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        method: 'getTransaction',
        network: 'mainnet',
        tookMs: 12,
        result: { status: 'SUCCESS' },
      }),
    );

    const result = await executeSorobanRpc({
      method: 'getTransaction',
      params: { hash: 'a'.repeat(64) },
      network: 'mainnet',
    });

    expect(result.result).toEqual({ status: 'SUCCESS' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/soroban-rpc/execute');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      method: 'getTransaction',
      params: { hash: 'a'.repeat(64) },
      network: 'mainnet',
    });
  });

  it('surfaces API rejections as errors the console can render', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ message: '"getTransaction.hash" is required' }),
    } as unknown as Response);

    await expect(executeSorobanRpc({ method: 'getTransaction' })).rejects.toThrow(
      '"getTransaction.hash" is required',
    );
  });
});
