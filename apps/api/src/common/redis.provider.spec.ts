import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisProvider } from './redis.provider';

// Mock the redis client
const mockRedisClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

describe('RedisProvider', () => {
  let provider: RedisProvider;
  let configService: ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<RedisProvider>(RedisProvider);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    if (provider) {
      await provider.onModuleDestroy();
    }
  });

  describe('initialization', () => {
    it('should not connect if REDIS_URL is not configured', async () => {
      (configService.get as jest.Mock).mockReturnValue(undefined);

      await provider.onModuleInit();

      expect(mockRedisClient.connect).not.toHaveBeenCalled();
      expect(provider.isReady()).toBe(false);
    });

    it('should connect successfully with valid REDIS_URL', async () => {
      (configService.get as jest.Mock).mockReturnValue('redis://localhost:6379');
      mockRedisClient.connect.mockResolvedValue(undefined);

      await provider.onModuleInit();

      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should handle connection errors gracefully', async () => {
      (configService.get as jest.Mock).mockReturnValue('redis://localhost:6379');
      mockRedisClient.connect.mockRejectedValue(new Error('Connection failed'));

      // Should not throw
      await provider.onModuleInit();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('client access', () => {
    beforeEach(async () => {
      (configService.get as jest.Mock).mockReturnValue('redis://localhost:6379');
      mockRedisClient.connect.mockResolvedValue(undefined);
    });

    it('should throw when getting client before connection', () => {
      expect(() => provider.getClient()).toThrow('Redis client is not connected');
    });

    it('should return client after successful connection', async () => {
      await provider.onModuleInit();
      
      // Simulate successful connection event
      const connectHandler = mockRedisClient.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }

      expect(provider.isReady()).toBe(true);
      expect(provider.getClient()).toBe(mockRedisClient);
    });
  });

  describe('safe execution', () => {
    beforeEach(async () => {
      (configService.get as jest.Mock).mockReturnValue('redis://localhost:6379');
      mockRedisClient.connect.mockResolvedValue(undefined);
      await provider.onModuleInit();
      
      // Simulate connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }
    });

    it('should execute operation successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue('test-result');
      
      const result = await provider.safeExecute(mockOperation);
      
      expect(mockOperation).toHaveBeenCalledWith(mockRedisClient);
      expect(result).toBe('test-result');
    });

    it('should return null for failed operations', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      const result = await provider.safeExecute(mockOperation);
      
      expect(result).toBeNull();
    });

    it('should return fallback value for failed operations', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const fallback = 'fallback-value';
      
      const result = await provider.safeExecute(mockOperation, fallback);
      
      expect(result).toBe(fallback);
    });

    it('should return null when Redis is not ready', async () => {
      // Simulate disconnect
      const disconnectHandler = mockRedisClient.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      if (disconnectHandler) {
        disconnectHandler();
      }

      const mockOperation = jest.fn();
      const result = await provider.safeExecute(mockOperation);
      
      expect(mockOperation).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should disconnect cleanly on module destroy', async () => {
      (configService.get as jest.Mock).mockReturnValue('redis://localhost:6379');
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.disconnect.mockResolvedValue(undefined);

      await provider.onModuleInit();
      await provider.onModuleDestroy();

      expect(mockRedisClient.disconnect).toHaveBeenCalled();
      expect(provider.isReady()).toBe(false);
    });

    it('should handle disconnect errors gracefully', async () => {
      (configService.get as jest.Mock).mockReturnValue('redis://localhost:6379');
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      await provider.onModuleInit();
      
      // Should not throw
      await provider.onModuleDestroy();
      
      expect(provider.isReady()).toBe(false);
    });
  });
});