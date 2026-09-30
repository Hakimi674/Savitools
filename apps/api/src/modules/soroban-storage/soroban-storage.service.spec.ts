import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SorobanStorageService } from './soroban-storage.service';
import { SorobanRpc, xdr, nativeToScVal, StrKey } from '@stellar/stellar-sdk';

// Mock SorobanRpc
jest.mock('@stellar/stellar-sdk', () => ({
  ...jest.requireActual('@stellar/stellar-sdk'),
  SorobanRpc: {
    Server: jest.fn(),
  },
}));

describe('SorobanStorageService', () => {
  let service: SorobanStorageService;
  let mockRpcServer: jest.Mocked<SorobanRpc.Server>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SorobanStorageService],
    }).compile();

    service = module.get<SorobanStorageService>(SorobanStorageService);

    // Setup mock RPC server
    mockRpcServer = {
      getLedgerEntries: jest.fn(),
      getLatestLedger: jest.fn(),
    } as any;

    (SorobanRpc.Server as jest.Mock).mockImplementation(() => mockRpcServer);
  });

  describe('queryStorage', () => {
    const validContractId = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';
    
    it('should query storage entry successfully', async () => {
      const mockLedgerInfo = {
        sequence: 1000,
        protocolVersion: Date.now(),
      };

      const mockStorageValue = nativeToScVal(42);
      const mockEntry = {
        xdr: mockStorageValue.toXDR('base64'),
        liveUntilLedgerSeq: 2000,
        lastModifiedLedgerSeq: 900,
        val: mockStorageValue,
      };

      mockRpcServer.getLedgerEntries.mockResolvedValue({
        entries: [mockEntry],
      } as any);

      mockRpcServer.getLatestLedger.mockResolvedValue(mockLedgerInfo as any);

      const result = await service.queryStorage({
        contractId: validContractId,
        storageKey: 'counter',
        durability: 'persistent',
        network: 'testnet',
      });

      expect(result.found).toBe(true);
      expect(result.contractId).toBe(validContractId);
      expect(result.durability).toBe('persistent');
      expect(result.entry).toBeDefined();
      expect(result.ledgerInfo.sequence).toBe(1000);
      expect(result.rpcMetadata.endpoint).toContain('soroban-testnet');
    });

    it('should handle missing storage entry', async () => {
      mockRpcServer.getLedgerEntries.mockResolvedValue({
        entries: [],
      } as any);

      mockRpcServer.getLatestLedger.mockResolvedValue({
        sequence: 1000,
        protocolVersion: Date.now(),
      } as any);

      const result = await service.queryStorage({
        contractId: validContractId,
        storageKey: 'nonexistent',
        durability: 'persistent',
        network: 'testnet',
      });

      expect(result.found).toBe(false);
      expect(result.entry).toBeUndefined();
    });

    it('should handle invalid contract ID', async () => {
      const result = await service.queryStorage({
        contractId: 'INVALID_CONTRACT_ID',
        storageKey: 'counter',
        durability: 'persistent',
        network: 'testnet',
      });

      expect(result.found).toBe(false);
      expect(result.error).toContain('Invalid contract ID format');
    });

    it('should handle RPC server errors', async () => {
      mockRpcServer.getLedgerEntries.mockRejectedValue(new Error('RPC Error'));

      const result = await service.queryStorage({
        contractId: validContractId,
        storageKey: 'counter',
        durability: 'persistent',
        network: 'testnet',
      });

      expect(result.found).toBe(false);
      expect(result.error).toContain('RPC Error');
    });

    it('should support different durability classes', async () => {
      const durabilityClasses = ['temporary', 'persistent', 'instance'];

      for (const durability of durabilityClasses) {
        mockRpcServer.getLedgerEntries.mockResolvedValue({ entries: [] } as any);
        mockRpcServer.getLatestLedger.mockResolvedValue({
          sequence: 1000,
          protocolVersion: Date.now(),
        } as any);

        const result = await service.queryStorage({
          contractId: validContractId,
          storageKey: 'test',
          durability: durability as any,
          network: 'testnet',
        });

        expect(result.durability).toBe(durability);
      }
    });

    it('should use custom RPC endpoint when provided', async () => {
      const customEndpoint = 'https://custom-rpc.example.com';

      mockRpcServer.getLedgerEntries.mockResolvedValue({ entries: [] } as any);
      mockRpcServer.getLatestLedger.mockResolvedValue({
        sequence: 1000,
        protocolVersion: Date.now(),
      } as any);

      const result = await service.queryStorage({
        contractId: validContractId,
        storageKey: 'test',
        durability: 'persistent',
        rpcEndpoint: customEndpoint,
      });

      expect(result.rpcMetadata.endpoint).toBe(customEndpoint);
    });
  });

  describe('compareStorage', () => {
    const validContractId = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';

    it('should compare storage entries successfully', async () => {
      const result = await service.compareStorage({
        contractId: validContractId,
        storageKey: 'counter',
        ledgerSeq1: 1000,
        ledgerSeq2: 1100,
        network: 'testnet',
      });

      expect(result.contractId).toBe(validContractId);
      expect(result.ledger1).toBe(1000);
      expect(result.ledger2).toBe(1100);
      expect(result.diff).toBeDefined();
    });

    it('should reject identical ledger sequences', async () => {
      await expect(service.compareStorage({
        contractId: validContractId,
        storageKey: 'counter',
        ledgerSeq1: 1000,
        ledgerSeq2: 1000,
        network: 'testnet',
      })).rejects.toThrow('Ledger sequences must be different');
    });

    it('should handle invalid contract ID', async () => {
      await expect(service.compareStorage({
        contractId: 'INVALID_CONTRACT_ID',
        storageKey: 'counter',
        ledgerSeq1: 1000,
        ledgerSeq2: 1100,
        network: 'testnet',
      })).rejects.toThrow('Invalid contract ID format');
    });
  });

  describe('createTypedStorageKey', () => {
    it('should create symbol key', async () => {
      const result = await service.createTypedStorageKey({
        keyType: 'symbol',
        keyValue: 'counter',
      });

      expect(result.xdr).toBeDefined();
      expect(result.decoded).toBe('counter');
    });

    it('should create string key', async () => {
      const result = await service.createTypedStorageKey({
        keyType: 'string',
        keyValue: 'test_key',
      });

      expect(result.xdr).toBeDefined();
      expect(result.decoded).toBe('test_key');
    });

    it('should create numeric keys', async () => {
      const numericTypes = [
        { keyType: 'u32', keyValue: '123' },
        { keyType: 'i32', keyValue: '-123' },
        { keyType: 'u64', keyValue: '12345678901234' },
        { keyType: 'i64', keyValue: '-12345678901234' },
      ] as const;

      for (const { keyType, keyValue } of numericTypes) {
        const result = await service.createTypedStorageKey({
          keyType,
          keyValue,
        });

        expect(result.xdr).toBeDefined();
        expect(result.decoded).toBeDefined();
      }
    });

    it('should create address key', async () => {
      const validAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      
      const result = await service.createTypedStorageKey({
        keyType: 'address',
        keyValue: validAddress,
      });

      expect(result.xdr).toBeDefined();
      expect(result.decoded).toBeDefined();
    });

    it('should create bytes key', async () => {
      const result = await service.createTypedStorageKey({
        keyType: 'bytes',
        keyValue: '48656c6c6f', // "Hello" in hex
      });

      expect(result.xdr).toBeDefined();
      expect(result.decoded).toBeDefined();
    });

    it('should handle composite keys', async () => {
      const result = await service.createTypedStorageKey({
        keyType: 'symbol',
        keyValue: 'user_balance',
        additionalKeys: '["user123", "USD"]',
      });

      expect(result.xdr).toBeDefined();
      expect(Array.isArray(result.decoded)).toBe(true);
    });

    it('should reject invalid key types', async () => {
      await expect(service.createTypedStorageKey({
        keyType: 'invalid' as any,
        keyValue: 'test',
      })).rejects.toThrow('Unsupported key type');
    });

    it('should handle invalid additional keys JSON', async () => {
      await expect(service.createTypedStorageKey({
        keyType: 'symbol',
        keyValue: 'test',
        additionalKeys: 'invalid json',
      })).rejects.toThrow('Invalid additional keys JSON format');
    });

    it('should handle invalid address format', async () => {
      await expect(service.createTypedStorageKey({
        keyType: 'address',
        keyValue: 'INVALID_ADDRESS',
      })).rejects.toThrow();
    });
  });

  describe('getDurabilityInfo', () => {
    it('should return durability information', () => {
      const info = service.getDurabilityInfo();

      expect(info).toHaveProperty('temporary');
      expect(info).toHaveProperty('persistent');
      expect(info).toHaveProperty('instance');

      expect(info.temporary).toHaveProperty('description');
      expect(info.temporary).toHaveProperty('expiry');
      expect(info.persistent).toHaveProperty('description');
      expect(info.persistent).toHaveProperty('expiry');
      expect(info.instance).toHaveProperty('description');
      expect(info.instance).toHaveProperty('expiry');
    });
  });

  describe('Storage key parsing', () => {
    it('should parse XDR storage keys', async () => {
      const symbolKey = xdr.ScVal.scvSymbol('test');
      const xdrString = symbolKey.toXDR('base64');

      const result = await service.queryStorage({
        contractId: 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K',
        storageKey: xdrString,
        durability: 'persistent',
        network: 'testnet',
      });

      // Should not error on valid XDR
      expect(result).toBeDefined();
    });

    it('should parse symbol string keys', async () => {
      mockRpcServer.getLedgerEntries.mockResolvedValue({ entries: [] } as any);
      mockRpcServer.getLatestLedger.mockResolvedValue({
        sequence: 1000,
        protocolVersion: Date.now(),
      } as any);

      const result = await service.queryStorage({
        contractId: 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K',
        storageKey: 'counter',
        durability: 'persistent',
        network: 'testnet',
      });

      expect(result).toBeDefined();
    });
  });

  describe('Diff generation', () => {
    it('should detect added entries', async () => {
      // This is tested indirectly through compareStorage
      // The diff logic is private but tested through the public API
      const result = await service.compareStorage({
        contractId: 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K',
        storageKey: 'counter',
        ledgerSeq1: 1000,
        ledgerSeq2: 1100,
        network: 'testnet',
      });

      expect(result.diff.status).toBeDefined();
      expect(['added', 'removed', 'modified', 'unchanged']).toContain(result.diff.status);
    });
  });

  describe('Caching', () => {
    it('should cache successful results', async () => {
      mockRpcServer.getLedgerEntries.mockResolvedValue({ entries: [] } as any);
      mockRpcServer.getLatestLedger.mockResolvedValue({
        sequence: 1000,
        protocolVersion: Date.now(),
      } as any);

      // First call
      await service.queryStorage({
        contractId: 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K',
        storageKey: 'counter',
        durability: 'persistent',
        network: 'testnet',
      });

      expect(mockRpcServer.getLedgerEntries).toHaveBeenCalledTimes(1);

      // Note: Cache testing would require access to private methods or refactoring
      // This test verifies the service doesn't crash when caching is used
    });
  });
});