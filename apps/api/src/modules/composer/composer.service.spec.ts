import { Test, TestingModule } from '@nestjs/testing';
import { ComposerService } from './composer.service';
import { StellarSdk } from '../stellar/stellar-sdk';
import { Asset } from '../stellar/stellar.types';

describe('ComposerService', () => {
  let service: ComposerService;
  let mockStellar: jest.Mocked<StellarSdk>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComposerService,
        {
          provide: StellarSdk,
          useValue: {
            transactionBuilder: jest.fn(),
            simulateTransaction: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<ComposerService>(ComposerService);
    mockStellar = module.get(StellarSdk);
  });

  describe('createClaimableBalance', () => {
    it('should build create_claimable_balance operation', async () => {
      const source = 'source-account';
      const asset = new Asset('native');
      const amount = '10.5';
      const destination = 'destination-account';

      const builder = await service.buildCreateClaimableBalance(
        source, asset, amount, destination
      );

      expect(mockStellar.transactionBuilder).toHaveBeenCalledWith(source);
      expect(builder.addOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create_claimable_balance',
          asset: asset.toObject(),
          amount: '10500000'
        })
      );
    });

    it('should throw for invalid amount', async () => {
      const source = 'source-account';
      const asset = new Asset('native');
      const amount = 'abc';
      const destination = 'destination-account';

      await expect(
        service.buildCreateClaimableBalance(source, asset, amount, destination)
      ).rejects.toThrow();
    });
  });

  describe('claimClaimableBalance', () => {
    it('should build claim_claimable_balance operation', async () => {
      const source = 'source-account';
      const balanceId = 'a'.repeat(64);
      const destination = 'destination-account';

      const builder = await service.buildClaimClaimableBalance(
        source, balanceId, destination
      );

      expect(mockStellar.transactionBuilder).toHaveBeenCalledWith(source);
      expect(builder.addOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'claim_claimable_balance',
          balanceId: expect.any(Buffer)
        })
      );
    });

    it('should throw for invalid balance ID', async () => {
      const source = 'source-account';
      const balanceId = 'invalid';
      const destination = 'destination-account';

      await expect(
        service.buildClaimClaimableBalance(source, balanceId, destination)
      ).rejects.toThrow('Invalid claimable balance ID');
    });
  });

  describe('simulation', () => {
    it('should simulate create_claimable_balance', async () => {
      const source = 'source-account';
      const asset = new Asset('native');
      const amount = '10.5';
      const destination = 'destination-account';

      const mockTransaction = { result: 'success' };
      mockStellar.simulateTransaction.mockResolvedValue(mockTransaction);

      const result = await service.simulateCreateClaimableBalance(
        source, asset, amount, destination
      );

      expect(result).toEqual(mockTransaction);
    });

    it('should simulate claim_claimable_balance', async () => {
      const source = 'source-account';
      const balanceId = 'a'.repeat(64);
      const destination = 'destination-account';

      const mockTransaction = { result: 'success' };
      mockStellar.simulateTransaction.mockResolvedValue(mockTransaction);

      const result = await service.simulateClaimClaimableBalance(
        source, balanceId, destination
      );

      expect(result).toEqual(mockTransaction);
    });
  });
});