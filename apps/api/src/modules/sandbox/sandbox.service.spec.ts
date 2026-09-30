import { SandboxService } from './sandbox.service';
import { BadRequestException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';

describe('SandboxService', () => {
  let service: SandboxService;

  beforeEach(() => {
    service = new SandboxService();
  });

  describe('generateKeypair', () => {
    it('returns a valid Stellar keypair', () => {
      const keypair = service.generateKeypair();

      expect(keypair.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(keypair.secretKey).toMatch(/^S[A-Z0-9]{55}$/);
    });

    it('generates unique keypairs each call', () => {
      const kp1 = service.generateKeypair();
      const kp2 = service.generateKeypair();

      expect(kp1.publicKey).not.toBe(kp2.publicKey);
      expect(kp1.secretKey).not.toBe(kp2.secretKey);
    });

    it('public key corresponds to secret key', () => {
      const keypair = service.generateKeypair();

      const reconstructed = Keypair.fromSecret(keypair.secretKey);
      expect(reconstructed.publicKey()).toBe(keypair.publicKey);
    });
  });

  describe('fundFromFriendbot', () => {
    it('returns funding details on success', async () => {
      jest.spyOn((service as any).server, 'loadAccount').mockRejectedValueOnce(new Error('not found'));
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'tx-hash-123' }),
      });

      const result = await service.fundFromFriendbot('GTEST');

      expect(result.publicKey).toBe('GTEST');
      expect(result.funded).toBe(true);
      expect(result.txHash).toBe('tx-hash-123');
      expect(result.startingBalance).toBe('10,000 XLM');
    });

    it('handles already funded account gracefully via initial loadAccount check', async () => {
      jest.spyOn((service as any).server, 'loadAccount').mockResolvedValueOnce({
        balances: [{ asset_type: 'native', balance: '10000.0000000' }],
      });
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy;

      const result = await service.fundFromFriendbot('GTEST');

      expect(result.funded).toBe(true);
      expect(result.startingBalance).toBe('10000.0000000 XLM');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('handles already funded response from friendbot concurrently', async () => {
      jest.spyOn((service as any).server, 'loadAccount')
        .mockRejectedValueOnce(new Error('not found'))
        .mockResolvedValueOnce({
          balances: [{ asset_type: 'native', balance: '10000.0000000' }],
        });

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'account already funded',
      });

      const result = await service.fundFromFriendbot('GTEST');

      expect(result.funded).toBe(true);
      expect(result.startingBalance).toBe('10000.0000000 XLM');
    });

    it('throws on fetch failure', async () => {
      jest.spyOn((service as any).server, 'loadAccount').mockRejectedValueOnce(new Error('not found'));
      global.fetch = jest.fn().mockRejectedValue(new Error('Timeout'));

      await expect(service.fundFromFriendbot('GTEST')).rejects.toThrow(BadRequestException);
    });

    it('throws on non-ok response', async () => {
      jest.spyOn((service as any).server, 'loadAccount').mockRejectedValueOnce(new Error('not found'));
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server Error',
      });

      await expect(service.fundFromFriendbot('GTEST')).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendPayment input validation', () => {
    it('throws on invalid secret key', async () => {
      await expect(
        service.sendPayment({
          fromSecret: 'INVALID',
          toPublicKey: 'GDESTINATION',
          asset: 'XLM',
          amount: '10',
        }),
      ).rejects.toThrow('Invalid source secret key');
    });

    it('throws on short destination key', async () => {
      const kp = Keypair.random();

      await expect(
        service.sendPayment({
          fromSecret: kp.secret(),
          toPublicKey: 'short',
          asset: 'XLM',
          amount: '10',
        }),
      ).rejects.toThrow('Invalid destination public key');
    });

    it('throws on zero amount', async () => {
      const kp = Keypair.random();
      const dest = Keypair.random().publicKey();

      await expect(
        service.sendPayment({
          fromSecret: kp.secret(),
          toPublicKey: dest,
          asset: 'XLM',
          amount: '0',
        }),
      ).rejects.toThrow('Amount must be a positive number');
    });

    it('throws on negative amount', async () => {
      const kp = Keypair.random();
      const dest = Keypair.random().publicKey();

      await expect(
        service.sendPayment({
          fromSecret: kp.secret(),
          toPublicKey: dest,
          asset: 'XLM',
          amount: '-5',
        }),
      ).rejects.toThrow('Amount must be a positive number');
    });

    it('throws on invalid asset format', async () => {
      const kp = Keypair.random();
      const dest = Keypair.random().publicKey();

      await expect(
        service.sendPayment({
          fromSecret: kp.secret(),
          toPublicKey: dest,
          asset: 'INVALID_FORMAT',
          amount: '10',
        }),
      ).rejects.toThrow('Invalid asset format');
    });
  });
});
