/**
 * A bounded cache with TTL (time-to-live) and LRU (least recently used) eviction.
 * 
 * Features:
 * - Maximum entry limit with LRU eviction
 * - TTL-based expiration with lazy cleanup
 * - Automatic sweep timer for expired entries
 * - Thread-safe operations
 */
export class BoundedTtlMap<K, V> {
  private readonly cache = new Map<K, CacheEntry<V>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private sweepTimer?: NodeJS.Timeout;

  constructor(options: BoundedTtlMapOptions) {
    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;

    // Start periodic sweep if enabled (default: every 5 minutes)
    if (options.sweepIntervalMs !== false) {
      const sweepInterval = options.sweepIntervalMs ?? 5 * 60 * 1000;
      this.sweepTimer = setInterval(() => this.sweep(), sweepInterval);
      // Use unref to prevent the timer from keeping the process alive
      this.sweepTimer.unref();
    }
  }

  /**
   * Get a value from the cache, returning undefined if expired or not found.
   * Accessing a value moves it to the end of the LRU order.
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end of insertion order (LRU behavior)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }

  /**
   * Set a value in the cache with current timestamp + TTL as expiration.
   * If the cache exceeds maxEntries, removes the oldest entry.
   */
  set(key: K, value: V): void {
    const now = Date.now();
    const entry: CacheEntry<V> = {
      value,
      expiresAt: now + this.ttlMs,
    };

    // If key already exists, delete it first to maintain insertion order
    this.cache.delete(key);
    this.cache.set(key, entry);

    // Evict oldest entries if we exceed max size
    this.evictOldest();
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a specific key from the cache.
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries (includes expired entries until swept).
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys (includes expired keys until swept).
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Manually trigger a sweep to remove expired entries.
   * Returns the number of entries removed.
   */
  sweep(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clean up resources (stop sweep timer).
   */
  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): BoundedTtlMapStats {
    const now = Date.now();
    let expired = 0;
    
    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expired++;
      }
    }

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      expired,
      active: this.cache.size - expired,
    };
  }

  /**
   * Evict oldest entries until we're at or below maxEntries.
   */
  private evictOldest(): void {
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      } else {
        break; // Safety check
      }
    }
  }
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface BoundedTtlMapOptions {
  /** Maximum number of entries before LRU eviction */
  maxEntries: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** 
   * Interval for automatic sweep of expired entries in milliseconds.
   * Set to false to disable automatic sweeping.
   * Default: 5 minutes (300000ms)
   */
  sweepIntervalMs?: number | false;
}

export interface BoundedTtlMapStats {
  /** Current total entries (including expired) */
  size: number;
  /** Maximum entries allowed */
  maxEntries: number;
  /** Number of expired entries */
  expired: number;
  /** Number of active (non-expired) entries */
  active: number;
}