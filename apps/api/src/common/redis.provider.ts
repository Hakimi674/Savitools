import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

/**
 * Shared Redis client provider with lifecycle management and error handling.
 * Replaces individual Redis clients in auth, monitor-leader, and orderbook services.
 */
@Injectable()
export class RedisProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisProvider.name);
  private client: RedisClientType | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelayMs = 1000;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Get the Redis client instance. Throws if not connected.
   */
  getClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client is not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Check if Redis is connected and ready.
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Connect to Redis with retry logic.
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not configured, Redis features will be disabled');
      return;
    }

    try {
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries >= this.maxReconnectAttempts) {
              this.logger.error(`Redis reconnection failed after ${retries} attempts`);
              return false;
            }
            const delay = Math.min(this.reconnectDelayMs * Math.pow(2, retries), 30000);
            this.logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries + 1})`);
            return delay;
          },
        },
      });

      // Set up event handlers
      this.client.on('connect', () => {
        this.logger.log('Redis connection established');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.client.on('error', (error) => {
        this.logger.error('Redis error:', error);
        this.isConnected = false;
      });

      this.client.on('disconnect', () => {
        this.logger.warn('Redis disconnected');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        this.reconnectAttempts++;
        this.logger.log(`Redis reconnecting (attempt ${this.reconnectAttempts})`);
      });

      await this.client.connect();
      this.isConnected = true;
      this.logger.log('Redis client connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      this.client = null;
      
      // Don't throw here - allow the app to start without Redis
      // Individual services can check isReady() and handle gracefully
    }
  }

  /**
   * Disconnect from Redis.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
        this.logger.log('Redis client disconnected');
      } catch (error) {
        this.logger.error('Error disconnecting Redis client:', error);
      } finally {
        this.client = null;
        this.isConnected = false;
      }
    }
  }

  /**
   * Execute a Redis operation with error handling.
   * Returns null if Redis is not available or operation fails.
   */
  async safeExecute<T>(
    operation: (client: RedisClientType) => Promise<T>,
    fallback?: T,
  ): Promise<T | null> {
    if (!this.isReady()) {
      this.logger.warn('Redis not available, skipping operation');
      return fallback ?? null;
    }

    try {
      return await operation(this.getClient());
    } catch (error) {
      this.logger.error('Redis operation failed:', error);
      return fallback ?? null;
    }
  }
}