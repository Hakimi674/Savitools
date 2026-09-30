import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { SequencePlannerService } from './sequence-planner.service';
import { TransactionPlanDto } from './dto/sequence-plan.dto';

// Mock Stellar SDK
jest.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      loadAccount: jest.fn()
    }))
  }
}));

describe('SequencePlannerService', () => {
  let service: SequencePlannerService;
  let mockHorizonServer: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SequencePlannerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<SequencePlannerService>(SequencePlannerService);
    
    // Setup mock horizon server
    mockHorizonServer = {
      loadAccount: jest.fn()
    };
    
    (service as any).horizonTestnet = mockHorizonServer;
    (service as any).horizonMainnet = mockHorizonServer;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAccountSequence', () => {
    it('should fetch account sequence from Horizon', async () => {
      const mockAccount = {
        sequence: '12345'
      };
      
      mockHorizonServer.loadAccount.mockResolvedValue(mockAccount);

      const result = await service.getAccountSequence(
        'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
        'testnet'
      );

      expect(result).toEqual({
        account: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
        currentSequence: '12345',
        nextSequence: '12346'
      });
      expect(mockHorizonServer.loadAccount).toHaveBeenCalledWith(
        'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU'
      );
    });

    it('should handle large sequence numbers', async () => {
      const mockAccount = {
        sequence: '99999999999999999'
      };
      
      mockHorizonServer.loadAccount.mockResolvedValue(mockAccount);

      const result = await service.getAccountSequence(
        'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
        'testnet'
      );

      expect(result.currentSequence).toBe('99999999999999999');
      expect(result.nextSequence).toBe('100000000000000000');
    });

    it('should throw BadRequestException when account not found', async () => {
      mockHorizonServer.loadAccount.mockRejectedValue(
        new Error('Account not found')
      );

      await expect(
        service.getAccountSequence(
          'GINVALIDACCOUNT',
          'testnet'
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateSequence', () => {
    beforeEach(() => {
      mockHorizonServer.loadAccount.mockResolvedValue({
        sequence: '12345'
      });
    });

    it('should validate correct next sequence', async () => {
      const result = await service.validateSequence(
        'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
        12346,
        'testnet'
      );

      expect(result.isValid).toBe(true);
      expect(result.currentSequence).toBe('12345');
      expect(result.nextValidSequence).toBe('12346');
      expect(result.gap).toBe(0);
      expect(result.issues).toContain('Sequence number is valid and ready to use');
    });

    it('should detect already used sequence', async () => {
      const result = await service.validateSequence(
        'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
        12345,
        'testnet'
      );

      expect(result.isValid).toBe(false);
      expect(result.issues[0]).toContain('already been used');
    });

    it('should detect sequence gap', async () => {
      const result = await service.validateSequence(
        'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
        12350,
        'testnet'
      );

      expect(result.isValid).toBe(false);
      expect(result.gap).toBe(4);
      expect(result.issues[0]).toContain('creates a gap of 4');
    });
  });

  describe('planSequences', () => {
    beforeEach(() => {
      mockHorizonServer.loadAccount.mockResolvedValue({
        sequence: '12345'
      });
    });

    it('should plan sequences for transactions without specified sequences', async () => {
      const transactions: TransactionPlanDto[] = [
        {
          id: 'tx1',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          description: 'First transaction'
        },
        {
          id: 'tx2',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          description: 'Second transaction'
        }
      ];

      const result = await service.planSequences(transactions, 'testnet');

      expect(result.plannedTransactions).toHaveLength(2);
      expect(result.plannedTransactions[0].assignedSequence).toBe(12346);
      expect(result.plannedTransactions[1].assignedSequence).toBe(12347);
      expect(result.summary.valid).toBe(2);
      expect(result.summary.conflicts).toBe(0);
    });

    it('should detect duplicate sequence numbers', async () => {
      const transactions: TransactionPlanDto[] = [
        {
          id: 'tx1',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          sequenceNumber: 12346,
          description: 'First transaction'
        },
        {
          id: 'tx2',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          sequenceNumber: 12346,
          description: 'Duplicate transaction'
        }
      ];

      const result = await service.planSequences(transactions, 'testnet');

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].type).toBe('duplicate');
      expect(result.summary.conflicts).toBeGreaterThan(0);
    });

    it('should detect already used sequences', async () => {
      const transactions: TransactionPlanDto[] = [
        {
          id: 'tx1',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          sequenceNumber: 12345, // Already used
          description: 'Invalid transaction'
        }
      ];

      const result = await service.planSequences(transactions, 'testnet');

      expect(result.plannedTransactions[0].status).toBe('conflict');
      expect(result.plannedTransactions[0].issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('already been used')
        ])
      );
    });

    it('should detect sequence gaps', async () => {
      const transactions: TransactionPlanDto[] = [
        {
          id: 'tx1',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          sequenceNumber: 12346,
          description: 'First transaction'
        },
        {
          id: 'tx2',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          sequenceNumber: 12350, // Gap of 3
          description: 'Transaction with gap'
        }
      ];

      const result = await service.planSequences(transactions, 'testnet');

      expect(result.conflicts.some(c => c.type === 'gap')).toBe(true);
    });

    it('should handle multiple accounts', async () => {
      mockHorizonServer.loadAccount.mockImplementation((account) => {
        return Promise.resolve({ sequence: '100' });
      });

      const transactions: TransactionPlanDto[] = [
        {
          id: 'tx1',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          description: 'Account 1 tx'
        },
        {
          id: 'tx2',
          sourceAccount: 'GDJV7GQIAQOYH3VPZXBMVUAUEQJVWKQ2K7KVQVZXCNXUYX3LPVZWSDFX',
          description: 'Account 2 tx'
        }
      ];

      const result = await service.planSequences(transactions, 'testnet');

      expect(result.accountSequences).toHaveLength(2);
      expect(result.plannedTransactions[0].assignedSequence).toBe(101);
      expect(result.plannedTransactions[1].assignedSequence).toBe(101);
    });

    it('should validate transaction dependencies', async () => {
      const transactions: TransactionPlanDto[] = [
        {
          id: 'setup',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          sequenceNumber: 12346,
          description: 'Setup transaction'
        },
        {
          id: 'payment',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          sequenceNumber: 12345, // Before dependency
          description: 'Payment depending on setup',
          dependencies: ['setup']
        }
      ];

      const result = await service.planSequences(transactions, 'testnet');

      expect(result.plannedTransactions[1].issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Dependency')
        ])
      );
    });

    it('should detect missing dependencies', async () => {
      const transactions: TransactionPlanDto[] = [
        {
          id: 'payment',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          description: 'Payment with missing dependency',
          dependencies: ['missing-tx']
        }
      ];

      const result = await service.planSequences(transactions, 'testnet');

      expect(result.plannedTransactions[0].issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('not found')
        ])
      );
    });

    it('should handle account fetch failures gracefully', async () => {
      mockHorizonServer.loadAccount.mockRejectedValue(
        new Error('Network error')
      );

      const transactions: TransactionPlanDto[] = [
        {
          id: 'tx1',
          sourceAccount: 'GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU',
          description: 'Transaction'
        }
      ];

      const result = await service.planSequences(transactions, 'testnet');

      expect(result.plannedTransactions[0].status).toBe('warning');
      expect(result.plannedTransactions[0].issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Cannot fetch')
        ])
      );
    });
  });
});
