import { SandboxService } from './sandbox.service';
import { BadRequestException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';

describe('SandboxService', () => {
  let service: SandboxService;

  beforeEach(() => {
    service = new SandboxService();
  });

  describe('Endpoint resolution per network & mainnet safety gate', () => {
    it('resolves testnet endpoints correctly', () => {
      const endpoints = resolveStellarEndpoints('testnet');
      expect(endpoints.network).toBe('testnet');
      expect(endpoints.horizonUrl).toContain('horizon-testnet.stellar.org');
      expect(endpoints.friendbotUrl).toContain('friendbot.stellar.org');
    });

    it('resolves quickstart endpoints for local container nodes', () => {
      const endpoints = resolveStellarEndpoints('quickstart');
      expect(endpoints.network).toBe('quickstart');
      expect(endpoints.horizonUrl).toBe('http://localhost:8000');
      expect(endpoints.friendbotUrl).toBe('http://localhost:8000/friendbot');
      expect(endpoints.passphrase).toBe('Standalone Network ; February 2017');
    });

    it('resolves custom networks when horizonUrl is provided', () => {
      const endpoints = resolveStellarEndpoints('custom', {
        horizonUrl: 'http://custom-node:8000',
        friendbotUrl: 'http://custom-node:8000/friendbot',
      });
      expect(endpoints.network).toBe('custom');
      expect(endpoints.horizonUrl).toBe('http://custom-node:8000');
    });

    it('strictly prohibits mainnet from being used in Sandbox', () => {
      expect(() => resolveStellarEndpoints('mainnet')).toThrow(BadRequestException);
      expect(() => resolveStellarEndpoints('public')).toThrow(BadRequestException);
    });
  });

  describe('generateKeypair with network labelling', () => {
    it('returns a valid Stellar keypair with testnet network label', () => {
      const keypair = service.generateKeypair('testnet');

      expect(keypair.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(keypair.secretKey).toMatch(/^S[A-Z0-9]{55}$/);
      expect(keypair.network).toBe('testnet');
    });

    it('labels a quickstart keypair with quickstart network', () => {
      const keypair = service.generateKeypair('quickstart');

      expect(keypair.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
      expect(keypair.secretKey).toMatch(/^S[A-Z0-9]{55}$/);
      expect(keypair.network).toBe('quickstart');
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

  describe('fundFromFriendbot & Friendbot-unavailable path', () => {
    it('returns funding details with network label on success', async () => {
      const serverMock = (service as any).getServer('testnet');
      jest.spyOn(serverMock, 'loadAccount').mockRejectedValueOnce(new Error('not found'));
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'tx-hash-123' }),
      });

      const result = await service.fundFromFriendbot('GTEST', 'testnet');

      expect(result.publicKey).toBe('GTEST');
      expect(result.funded).toBe(true);
      expect(result.txHash).toBe('tx-hash-123');
      expect(result.startingBalance).toBe('10,000 XLM');
      expect(result.network).toBe('testnet');
    });

    it('produces a clear, specific message when Friendbot is unavailable', async () => {
      const serverMock = (service as any).getServer('quickstart');
      jest.spyOn(serverMock, 'loadAccount').mockRejectedValueOnce(new Error('not found'));
      global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8000'));

      await expect(service.fundFromFriendbot('GTEST', 'quickstart')).rejects.toThrow(
        /Friendbot is unavailable for network "quickstart" at http:\/\/localhost:8000\/friendbot/,
      );
    });

    it('produces a clear error when Friendbot responds with 404 or 500 error', async () => {
      const serverMock = (service as any).getServer('quickstart');
      jest.spyOn(serverMock, 'loadAccount').mockRejectedValueOnce(new Error('not found'));
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Friendbot endpoint disabled',
      });

      await expect(service.fundFromFriendbot('GTEST', 'quickstart')).rejects.toThrow(
        /Friendbot is unavailable for network "quickstart" at http:\/\/localhost:8000\/friendbot/,
      );
    });

    it('handles already funded account gracefully via initial loadAccount check', async () => {
      const serverMock = (service as any).getServer('testnet');
      jest.spyOn(serverMock, 'loadAccount').mockResolvedValueOnce({
        balances: [{ asset_type: 'native', balance: '10000.0000000' }],
      });
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy;

      const result = await service.fundFromFriendbot('GTEST', 'testnet');

      expect(result.funded).toBe(true);
      expect(result.startingBalance).toBe('10000.0000000 XLM');
      expect(result.network).toBe('testnet');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('resetAccount', () => {
    it('resets a sandbox account to its known starting state', async () => {
      const serverMock = (service as any).getServer('quickstart');
      jest.spyOn(serverMock, 'loadAccount').mockResolvedValueOnce({
        balances: [{ asset_type: 'native', balance: '10000.0000000' }],
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'tx-reset-hash' }),
      });

      const result = await service.resetAccount('GTEST', 'quickstart');

      expect(result.reset).toBe(true);
      expect(result.publicKey).toBe('GTEST');
      expect(result.network).toBe('quickstart');
      expect(result.startingBalance).toBe('10000.0000000 XLM');
      expect(result.message).toContain('Account GTEST on quickstart has been reset');
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
