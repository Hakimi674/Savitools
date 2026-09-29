/**
 * QR handoff UI (Savitura/Savitools#344): the camera-denial fallback and the
 * review-before-accept flow, including the blocked changed-body import.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

import QrHandoffTool from '@/components/tools/qr-handoff-tool';

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn(async () => 'data:image/png;base64,QUJD'),
  },
}));

function buildEnvelope(amount: string): string {
  const source = Keypair.random();
  const destination = Keypair.random();
  const transaction = new TransactionBuilder(
    new Account(source.publicKey(), '41'),
    { networkPassphrase: Networks.TESTNET, fee: '100' },
  )
    .addOperation(
      Operation.payment({
        destination: destination.publicKey(),
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimeout(0)
    .build();
  transaction.sign(source);
  return transaction.toEnvelope().toXDR('base64');
}

const getUserMedia = jest.fn();

/** Setting the value directly keeps these tests off userEvent's per-key cost. */
function setXdr(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function pasteAndPreview(xdr: string) {
  setXdr(/Paste transaction XDR/, xdr);
  await userEvent.click(screen.getByRole('button', { name: 'Preview pasted XDR' }));
}

describe('QrHandoffTool', () => {
  beforeAll(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
  });

  beforeEach(() => {
    getUserMedia.mockReset();
  });

  it('keeps the paste and file fallbacks usable when the camera is denied', async () => {
    getUserMedia.mockRejectedValue(
      new DOMException('denied', 'NotAllowedError'),
    );

    render(<QrHandoffTool />);
    await userEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Camera permission was denied',
      ),
    );

    const paste = screen.getByLabelText('Paste transaction XDR');
    expect(paste).toBeEnabled();

    await pasteAndPreview(buildEnvelope('10'));

    const heading = await screen.findByText('Review before importing');
    expect(heading.closest('section')).toHaveTextContent('Operations');
    expect(heading.closest('section')).toHaveTextContent('Signatures');
  });

  it('blocks an import that changes the loaded transaction body', async () => {
    const first = buildEnvelope('10');
    const second = buildEnvelope('99');

    render(<QrHandoffTool />);

    await pasteAndPreview(first);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Import transaction' }),
    );

    // The imported envelope is now the locally loaded transaction.
    await waitFor(() =>
      expect(screen.getByLabelText(/^Transaction XDR/)).toHaveValue(first),
    );

    setXdr(/Paste transaction XDR/, second);
    await userEvent.click(screen.getByRole('button', { name: 'Preview pasted XDR' }));

    const preview = (await screen.findByText('Review before importing')).closest(
      'section',
    ) as HTMLElement;
    expect(preview).toHaveTextContent('changes the transaction body');

    const replace = screen.getByRole('button', { name: 'Replace transaction' });
    expect(replace).toBeDisabled();

    await userEvent.click(
      screen.getByRole('checkbox', { name: /replace my transaction/i }),
    );
    expect(screen.getByRole('button', { name: 'Replace transaction' })).toBeEnabled();
  });

  it('animates checksummed frames for the envelope being exported', async () => {
    render(<QrHandoffTool />);

    setXdr(/^Transaction XDR/, buildEnvelope('5'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate frames' }));

    const frame = await screen.findByAltText(/Handoff frame 1 of 1/);
    expect(frame).toHaveAttribute('src', 'data:image/png;base64,QUJD');
    expect(screen.getByText(/Frame 1 of 1/)).toBeInTheDocument();
    expect(screen.getByText(/crc/)).toBeInTheDocument();
  });
});
