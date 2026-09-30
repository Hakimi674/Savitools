/**
 * Soroban RPC console (Savitura/Savitools#358): schema-aware inputs, the four
 * UI states the issue calls for, and the exact payload handed to the API.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SorobanRpcTool from '@/components/tools/soroban-rpc-tool';
import { executeSorobanRpc, listSorobanRpcMethods } from '@/lib/api';
import type { SorobanRpcMethodSpec } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  listSorobanRpcMethods: jest.fn(),
  executeSorobanRpc: jest.fn(),
}));

const listMethodsMock = listSorobanRpcMethods as jest.MockedFunction<
  typeof listSorobanRpcMethods
>;
const executeMock = executeSorobanRpc as jest.MockedFunction<typeof executeSorobanRpc>;

const CATALOG: SorobanRpcMethodSpec[] = [
  {
    name: 'getHealth',
    summary: 'Report whether the RPC server is healthy',
    description: 'Returns the server status.',
    params: [],
  },
  {
    name: 'getTransaction',
    summary: 'Fetch one transaction by hash',
    description: 'Returns the transaction envelope and result.',
    params: [
      {
        name: 'hash',
        type: 'string',
        required: true,
        description: 'Transaction hash to look up.',
        pattern: '^[0-9a-fA-F]{64}$',
        patternHint: '64 hexadecimal characters',
      },
      {
        name: 'startLedger',
        type: 'integer',
        required: false,
        description: 'Optional ledger to start from.',
        min: 0,
      },
    ],
  },
];

describe('SorobanRpcTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a loading state while the catalog is fetched', () => {
    listMethodsMock.mockReturnValue(new Promise(() => {}));

    render(<SorobanRpcTool />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading Soroban RPC methods…',
    );
  });

  it('renders a method picker and a failure state with retry', async () => {
    listMethodsMock.mockRejectedValueOnce(new Error('API is down'));

    render(<SorobanRpcTool />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('API is down'),
    );

    listMethodsMock.mockResolvedValueOnce({ methods: CATALOG });
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/^Method/)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/^Method/)).toHaveValue('getHealth');
  });

  it('runs a parameter-less method and renders the JSON-RPC result', async () => {
    listMethodsMock.mockResolvedValue({ methods: CATALOG });
    executeMock.mockResolvedValue({
      method: 'getHealth',
      network: 'testnet',
      tookMs: 8,
      result: { status: 'healthy' },
    });

    render(<SorobanRpcTool />);

    await userEvent.click(await screen.findByRole('button', { name: /^Run$/ }));

    expect(executeMock).toHaveBeenCalledWith({
      method: 'getHealth',
      params: {},
      network: 'testnet',
    });
    await waitFor(() =>
      expect(screen.getByTestId('rpc-output')).toHaveTextContent('healthy'),
    );
  });

  it('validates schema-aware inputs before calling the API', async () => {
    listMethodsMock.mockResolvedValue({ methods: CATALOG });

    render(<SorobanRpcTool />);
    await userEvent.selectOptions(
      await screen.findByLabelText(/^Method/),
      'getTransaction',
    );

    await userEvent.click(screen.getByRole('button', { name: /^Run$/ }));

    expect(executeMock).not.toHaveBeenCalled();
    expect(screen.getByText(/"hash" is required/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^hash/), 'zz');
    await userEvent.click(screen.getByRole('button', { name: /^Run$/ }));
    expect(executeMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/must be 64 hexadecimal characters/),
    ).toBeInTheDocument();
  });

  it('sends typed parameters once the inputs are valid', async () => {
    listMethodsMock.mockResolvedValue({ methods: CATALOG });
    executeMock.mockResolvedValue({
      method: 'getTransaction',
      network: 'testnet',
      tookMs: 21,
      result: { status: 'NOT_FOUND' },
    });

    render(<SorobanRpcTool />);
    await userEvent.selectOptions(
      await screen.findByLabelText(/^Method/),
      'getTransaction',
    );
    await userEvent.type(screen.getByLabelText(/^hash/), 'a'.repeat(64));
    await userEvent.type(screen.getByLabelText(/^startLedger/), '100');
    await userEvent.click(screen.getByRole('button', { name: /^Run$/ }));

    expect(executeMock).toHaveBeenCalledWith({
      method: 'getTransaction',
      params: { hash: 'a'.repeat(64), startLedger: 100 },
      network: 'testnet',
    });
  });

  it('shows JSON-RPC errors in the failure panel', async () => {
    listMethodsMock.mockResolvedValue({ methods: CATALOG });
    executeMock.mockResolvedValue({
      method: 'getHealth',
      network: 'testnet',
      tookMs: 4,
      error: { code: -32601, message: 'Method not found' },
    });

    render(<SorobanRpcTool />);
    await userEvent.click(await screen.findByRole('button', { name: /^Run$/ }));

    await waitFor(() =>
      expect(screen.getByTestId('rpc-output')).toHaveTextContent('Method not found'),
    );
    expect(screen.getByText('JSON-RPC error')).toBeInTheDocument();
  });

  it('surfaces transport failures with a readable message', async () => {
    listMethodsMock.mockResolvedValue({ methods: CATALOG });
    executeMock.mockRejectedValue(new Error('Could not reach the Soroban RPC endpoint'));

    render(<SorobanRpcTool />);
    await userEvent.click(await screen.findByRole('button', { name: /^Run$/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not reach the Soroban RPC endpoint',
      ),
    );
  });
});
