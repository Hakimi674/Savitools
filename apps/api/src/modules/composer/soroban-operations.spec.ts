import { Test, TestingModule } from '@nestjs/testing';
import { ComposerService } from './composer.service';
import { ContractsService } from '../contracts/contracts.service';
import { BadRequestException } from '@nestjs/common';

describe('ComposerService - Soroban Operations', () => {
  let service: ComposerService;
  let contractsService: Partial<ContractsService>;

  beforeEach(async () => {
    contractsService = {
      getAbi: jest.fn(),
      encodeAbiArguments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComposerService,
        {
          provide: ContractsService,
          useValue: contractsService,
        },
      ],
    }).compile();

    service = module.get<ComposerService>(ComposerService);
  });

  describe('buildInvokeHostFunctionOperation', () => {
    it('should create invoke_host_function operation with valid contract ID', () => {
      const dto = {
        type: 'invoke_host_function',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        functionName: 'transfer',
        arguments: [],
        useAbi: false,
      };

      const operation = (service as any).buildInvokeHostFunctionOperation(dto);

      expect(operation.type).toBe('invokeContractFunction');
      expect(operation.contract).toBe(dto.contractId);
      expect(operation.function).toBe(dto.functionName);
      expect(Array.isArray(operation.args)).toBe(true);
    });

    it('should throw error for invalid contract ID', () => {
      const dto = {
        type: 'invoke_host_function',
        contractId: 'invalid-contract-id',
        functionName: 'transfer',
        arguments: [],
      };

      expect(() => {
        (service as any).buildInvokeHostFunctionOperation(dto);
      }).toThrow(BadRequestException);
    });

    it('should throw error for missing function name', () => {
      const dto = {
        type: 'invoke_host_function',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        functionName: '',
        arguments: [],
      };

      expect(() => {
        (service as any).buildInvokeHostFunctionOperation(dto);
      }).toThrow(BadRequestException);
    });
  });

  describe('buildScValFromType', () => {
    it('should convert address type correctly', () => {
      const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const result = (service as any).buildScValFromType('Address', address);
      
      expect(result).toBeDefined();
      // The result should be an ScVal representing an address
    });

    it('should convert boolean type correctly', () => {
      const result = (service as any).buildScValFromType('Bool', true);
      
      expect(result).toBeDefined();
    });

    it('should convert string type correctly', () => {
      const result = (service as any).buildScValFromType('String', 'test');
      
      expect(result).toBeDefined();
    });

    it('should convert u64 type correctly', () => {
      const result = (service as any).buildScValFromType('U64', '12345');
      
      expect(result).toBeDefined();
    });

    it('should convert array type correctly', () => {
      const arrayValue = [
        { type: 'String', value: 'test1' },
        { type: 'String', value: 'test2' }
      ];
      const result = (service as any).buildScValFromType('Vec', arrayValue);
      
      expect(result).toBeDefined();
    });

    it('should throw error for invalid address', () => {
      expect(() => {
        (service as any).buildScValFromType('Address', 'invalid-address');
      }).toThrow(BadRequestException);
    });
  });

  describe('validateSorobanArguments', () => {
    it('should validate arguments with ABI when available', async () => {
      const mockEncodedArgs = [
        {
          name: 'from',
          type: 'Address',
          xdrBase64: 'base64-encoded-xdr',
          decoded: { type: 'Address', value: 'GAAA...' }
        }
      ];

      (contractsService.encodeAbiArguments as jest.Mock).mockResolvedValue(mockEncodedArgs);

      const result = await service.validateSorobanArguments(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        'transfer',
        ['GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'],
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.encodedArgs).toEqual(mockEncodedArgs);
    });

    it('should return valid result when ABI validation fails', async () => {
      (contractsService.encodeAbiArguments as jest.Mock).mockRejectedValue(new Error('ABI not found'));

      const result = await service.validateSorobanArguments(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        'transfer',
        ['test-arg'],
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ABI not found');
    });
  });

  describe('simulateSorobanTransaction', () => {
    it('should detect Soroban operations in transaction', async () => {
      const mockTransaction = {
        hash: () => ({ toString: () => 'test-hash' }),
        operations: [
          {
            type: 'invokeHostFunction',
            contract: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4'
          }
        ]
      };

      const result = await (service as any).simulateSorobanTransaction(mockTransaction, 'testnet');

      expect(result.success).toBe(true);
      expect(result.resourceFee).toBeDefined();
      expect(result.resourceFee?.cpuInstructions).toBeDefined();
    });

    it('should fail simulation for invalid contract ID', async () => {
      const mockTransaction = {
        hash: () => ({ toString: () => 'test-hash' }),
        operations: [
          {
            type: 'invokeHostFunction',
            contract: 'invalid-contract-id'
          }
        ]
      };

      const result = await (service as any).simulateSorobanTransaction(mockTransaction, 'testnet');

      expect(result.success).toBe(false);
      expect(result.operationResults).toContain('op[0] invoke_host_function: Invalid contract ID');
    });
  });

  describe('getContractAbi', () => {
    it('should return ABI when available', async () => {
      const mockAbi = {
        id: 'test-contract:default',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4',
        methods: [],
        events: []
      };

      (contractsService.getAbi as jest.Mock).mockReturnValue(mockAbi);

      const result = await service.getContractAbi('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4');

      expect(result).toEqual(mockAbi);
    });

    it('should return null when ABI not found', async () => {
      const error = new Error('Not found');
      (error as any).status = 404;
      (contractsService.getAbi as jest.Mock).mockImplementation(() => {
        throw error;
      });

      const result = await service.getContractAbi('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4');

      expect(result).toBeNull();
    });

    it('should throw error when contracts service unavailable', async () => {
      const serviceWithoutContracts = new ComposerService(undefined);

      await expect(
        serviceWithoutContracts.getContractAbi('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4')
      ).rejects.toThrow('Contract ABI functionality is not available');
    });
  });

  describe('OPERATION_MANIFEST', () => {
    it('should include invoke_host_function in operation manifest', () => {
      const operations = service.getOperations();
      const invokeOperation = operations.find(op => op.type === 'invoke_host_function');
      
      expect(invokeOperation).toBeDefined();
      expect(invokeOperation?.label).toBe('Invoke Host Function');
      expect(invokeOperation?.soroban?.requiresResourceFee).toBe(true);
      expect(invokeOperation?.soroban?.requiresSimulation).toBe(true);
    });

    it('should have correct fields for invoke_host_function', () => {
      const operations = service.getOperations();
      const invokeOperation = operations.find(op => op.type === 'invoke_host_function');
      
      expect(invokeOperation?.fields).toEqual([
        { name: 'contractId', label: 'Contract ID', type: 'text', required: true, placeholder: 'C...' },
        { name: 'functionName', label: 'Function Name', type: 'text', required: true, placeholder: 'transfer' },
        { name: 'arguments', label: 'Arguments', type: 'scval-array', required: false, placeholder: '[]' },
        { name: 'useAbi', label: 'Use ABI Validation', type: 'boolean', required: false, placeholder: 'true' },
        { name: 'rawMode', label: 'Raw Arguments Mode', type: 'boolean', required: false, placeholder: 'false' },
      ]);
    });
  });
});