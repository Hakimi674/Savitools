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
 * A process-local cache with a hard entry bound and lazy TTL expiry
 * (Savitura/Savitools#291).
 *
 * Six modules used to keep process-local state with hand-rolled, mutually
 * inconsistent eviction: one map with no bound at all, others with a sweep that
 * only ran past 10,000 entries, a TTL checked on read but never evicted, and a
 * plain "drop the oldest insert" cap. This is the single implementation they
 * share, so the memory ceiling of a replica is a property of one class instead
 * of six ad-hoc ones.
 *
 * Two guarantees:
 *
 * - **Bounded memory.** At most `maxEntries` values are held; on overflow the
 *   least recently used key is dropped. The bound applies to *stored* entries,
 *   including ones whose TTL has already passed, so a hot path that only writes
 *   cannot grow the map without limit.
 * - **Lazy TTL.** `get()` treats an expired entry as absent and removes it —
 *   expired values are never served, and reading is what evicts them. Callers
 *   that want expired entries physically gone (memory reported to operators, for
 *   example) can call `sweep()`, or pass `sweepIntervalMs` and `dispose()`.
 *
 * Reads count as use: `get()` moves the key to the most-recently-used position,
 * so the bound evicts the coldest key rather than the oldest insert (the
 * behaviour the composer and playground caches already hand-rolled).
 */
export interface BoundedTtlMapOptions {
  /** Hard cap on stored entries; the least recently used key is dropped past it. */
  maxEntries: number;
  /** How long a value stays readable after it was stored. */
  ttlMs: number;
  /**
   * Optional periodic `sweep()` interval. The timer is `unref()`ed so it can
   * never hold the process open; `dispose()` clears it. Omit it when the entry
   * bound alone is enough and expiry can stay lazy.
   */
  sweepIntervalMs?: number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class BoundedTtlMap<K, V> {
  private readonly entries = new Map<K, Entry<V>>();
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
    if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) {
      throw new RangeError(
        "BoundedTtlMap: maxEntries must be a positive integer",
      );
    }
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new RangeError("BoundedTtlMap: ttlMs must be a positive number");
    }

    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;

    const interval = options.sweepIntervalMs;
    if (interval !== undefined) {
      if (!Number.isFinite(interval) || interval <= 0) {
        throw new RangeError(
          "BoundedTtlMap: sweepIntervalMs must be a positive number",
        );
      }
      this.sweepTimer = setInterval(() => this.sweep(), interval);
      // Served connections keep the process up; a cache timer must not.
      this.sweepTimer.unref?.();
    }
  }

  /** Stored entries, including ones whose TTL has passed but which no read has evicted. */
  get size(): number {
    return this.entries.size;
  }

  /** The configured ceiling, so a caller can log or assert against it. */
  get capacity(): number {
    return this.maxEntries;
  }

  /** The configured TTL in milliseconds. */
  get ttl(): number {
    return this.ttlMs;
  }

  get(key: K, now: number = Date.now()): V | undefined {
    const entry = this.entries.get(key);
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
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }

    // Reading is use: move the key to the most-recently-used position.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  has(key: K, now: number = Date.now()): boolean {
    return this.get(key, now) !== undefined;
  }

  set(key: K, value: V, now: number = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    this.trim();
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Live keys, oldest first — expired entries are skipped, not removed. */
  keys(now: number = Date.now()): K[] {
    const keys: K[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > now) {
        keys.push(key);
      }
    }
    return keys;
  }

  /** Drop every expired entry; returns how many were removed. */
  sweep(now: number = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Stop the optional sweep timer. Safe to call more than once. */
  dispose(): void {
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
  private trim(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as K | undefined;
      if (oldest === undefined) {
        return;
      }
      this.entries.delete(oldest);
    }
  }
}
