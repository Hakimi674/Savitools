import { BoundedTtlMap } from './bounded-ttl-map';

describe('BoundedTtlMap', () => {
  let cache: BoundedTtlMap<string, string>;

  afterEach(() => {
    if (cache) {
      cache.destroy();
    }
  });

  describe('basic operations', () => {
    beforeEach(() => {
      cache = new BoundedTtlMap({
        maxEntries: 3,
        ttlMs: 1000,
        sweepIntervalMs: false, // Disable for tests
      });
    });

    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should update existing keys', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size).toBe(1);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('key1')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      cache = new BoundedTtlMap({
        maxEntries: 10,
        ttlMs: 100, // 100ms TTL
        sweepIntervalMs: false,
      });
    });

    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.has('key1')).toBe(false);
    });

    it('should remove expired entries on access', async () => {
      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Access should remove expired entry
      cache.get('key1');
      expect(cache.size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    beforeEach(() => {
      cache = new BoundedTtlMap({
        maxEntries: 2,
        ttlMs: 60000, // Long TTL
        sweepIntervalMs: false,
      });
    });

    it('should evict oldest entry when max size exceeded', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
      
      // Adding third entry should evict first
      cache.set('key3', 'value3');
      expect(cache.size).toBe(2);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should move accessed entries to end of LRU order', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // Access key1 to make it recently used
      cache.get('key1');
      
      // Add third entry, should evict key2 (oldest)
      cache.set('key3', 'value3');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
    });

    it('should handle updating existing keys without affecting size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // Update existing key
      cache.set('key1', 'updated');
      expect(cache.size).toBe(2);
      expect(cache.get('key1')).toBe('updated');
      
      // Should still be able to add one more
      cache.set('key3', 'value3');
      expect(cache.size).toBe(2);
      expect(cache.get('key2')).toBeUndefined(); // key2 was oldest
    });
  });

  describe('sweep functionality', () => {
    beforeEach(() => {
      cache = new BoundedTtlMap({
        maxEntries: 10,
        ttlMs: 100,
        sweepIntervalMs: false,
      });
    });

    it('should manually sweep expired entries', async () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Size should still be 2 before sweep
      expect(cache.size).toBe(2);
      
      // Sweep should remove expired entries
      const removed = cache.sweep();
      expect(removed).toBe(2);
      expect(cache.size).toBe(0);
    });

    it('should not remove non-expired entries during sweep', async () => {
      cache.set('key1', 'value1');
      
      // Wait less than TTL
      await new Promise(resolve => setTimeout(resolve, 50));
      
      cache.set('key2', 'value2'); // Fresh entry
      
      // Wait for first entry to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const removed = cache.sweep();
      expect(removed).toBe(1);
      expect(cache.size).toBe(1);
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('automatic sweep', () => {
    it('should automatically sweep with timer', async () => {
      cache = new BoundedTtlMap({
        maxEntries: 10,
        ttlMs: 50,
        sweepIntervalMs: 100, // Fast sweep for test
      });

      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      
      // Wait for expiration + sweep interval
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should be swept automatically
      expect(cache.size).toBe(0);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      cache = new BoundedTtlMap({
        maxEntries: 5,
        ttlMs: 100,
        sweepIntervalMs: false,
      });
    });

    it('should provide accurate stats', async () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      let stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxEntries).toBe(5);
      expect(stats.expired).toBe(0);
      expect(stats.active).toBe(2);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.expired).toBe(2);
      expect(stats.active).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero max entries', () => {
      cache = new BoundedTtlMap({
        maxEntries: 0,
        ttlMs: 1000,
        sweepIntervalMs: false,
      });

      cache.set('key1', 'value1');
      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should handle immediate expiration', () => {
      cache = new BoundedTtlMap({
        maxEntries: 10,
        ttlMs: 0, // Immediate expiration
        sweepIntervalMs: false,
      });

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should properly clean up timer on destroy', () => {
      cache = new BoundedTtlMap({
        maxEntries: 10,
        ttlMs: 1000,
        sweepIntervalMs: 1000,
      });

      // Should not throw
      cache.destroy();
      cache.destroy(); // Should handle multiple calls
    });
  });
});
import { BoundedTtlMap } from "./bounded-ttl-map";

/**
 * The contract the six migrated caches rely on (Savitura/Savitools#291): a hard
 * entry bound, lazy TTL expiry that never serves a stale value, and LRU eviction
 * so a hot working set survives a cold one.
 */
describe("BoundedTtlMap", () => {
  it("rejects a configuration that cannot bound anything", () => {
    expect(() => new BoundedTtlMap({ maxEntries: 0, ttlMs: 1000 })).toThrow(
      RangeError,
    );
    expect(() => new BoundedTtlMap({ maxEntries: 1.5, ttlMs: 1000 })).toThrow(
      RangeError,
    );
    expect(() => new BoundedTtlMap({ maxEntries: 10, ttlMs: 0 })).toThrow(
      RangeError,
    );
    expect(
      () =>
        new BoundedTtlMap({ maxEntries: 10, ttlMs: 1000, sweepIntervalMs: -1 }),
    ).toThrow(RangeError);
  });

  it("stores and reads values", () => {
    const cache = new BoundedTtlMap<string, string>({
      maxEntries: 4,
      ttlMs: 1000,
    });

    cache.set("a", "1", 0);

    expect(cache.get("a", 0)).toBe("1");
    expect(cache.has("a", 0)).toBe(true);
    expect(cache.has("missing", 0)).toBe(false);
    expect(cache.get("missing", 0)).toBeUndefined();
  });

  it("treats an expired entry as absent and removes it on read", () => {
    const cache = new BoundedTtlMap<string, string>({
      maxEntries: 4,
      ttlMs: 1000,
    });
    cache.set("a", "1", 0);

    expect(cache.get("a", 999)).toBe("1");
    expect(cache.get("a", 1000)).toBeUndefined();
    // The read evicted it, so it cannot be served again.
    expect(cache.size).toBe(0);
  });

  it("never grows past maxEntries and drops the least recently used key", () => {
    const cache = new BoundedTtlMap<string, number>({
      maxEntries: 3,
      ttlMs: 10_000,
    });

    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("c", 3, 0);
    // Touch `a` so `b` becomes the coldest key.
    expect(cache.get("a", 0)).toBe(1);
    cache.set("d", 4, 0);

    expect(cache.size).toBe(3);
    expect(cache.get("b", 0)).toBeUndefined();
    expect(cache.get("a", 0)).toBe(1);
    // The assertions above touched `a`, so it is the most recent key again.
    expect(cache.keys(0)).toEqual(["c", "d", "a"]);
  });

  it("bounds memory even when every write is a fresh key (the OOM case)", () => {
    const cache = new BoundedTtlMap<number, string>({
      maxEntries: 50,
      ttlMs: 60_000,
    });

    for (let i = 0; i < 10_000; i += 1) {
      cache.set(i, `value-${i}`, 0);
    }

    expect(cache.size).toBe(50);
    // The most recent writes are the ones that survived.
    expect(cache.get(9_999, 0)).toBe("value-9999");
    expect(cache.get(0, 0)).toBeUndefined();
  });

  it("counts expired-but-unswept entries in size until they are swept", () => {
    const cache = new BoundedTtlMap<string, string>({
      maxEntries: 10,
      ttlMs: 100,
    });

    cache.set("a", "1", 0);
    cache.set("b", "2", 50);

    expect(cache.size).toBe(2);
    expect(cache.sweep(200)).toBe(2);
    expect(cache.size).toBe(0);
    expect(cache.get("b", 200)).toBeUndefined();
  });

  it("re-sweeps are a no-op and delete/clear behave like a Map", () => {
    const cache = new BoundedTtlMap<string, string>({
      maxEntries: 10,
      ttlMs: 100,
    });
    cache.set("a", "1", 0);
    cache.set("b", "2", 0);

    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    expect(cache.sweep(0)).toBe(0);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("overwrites an existing key in place and restarts its TTL", () => {
    const cache = new BoundedTtlMap<string, string>({
      maxEntries: 2,
      ttlMs: 100,
    });

    cache.set("a", "first", 0);
    cache.set("a", "second", 90);

    expect(cache.get("a", 150)).toBe("second");
    expect(cache.get("a", 191)).toBeUndefined();
  });

  it("runs an unref’d sweep timer when asked, and stops it on dispose", () => {
    jest.useFakeTimers();
    try {
      const cache = new BoundedTtlMap<string, string>({
        maxEntries: 10,
        ttlMs: 100,
        sweepIntervalMs: 500,
      });
      cache.set("a", "1");

      expect(cache.size).toBe(1);
      jest.advanceTimersByTime(600);
      expect(cache.size).toBe(0);

      cache.set("b", "2");
      cache.dispose();
      jest.advanceTimersByTime(600);
      expect(cache.size).toBe(1);
      expect(() => cache.dispose()).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });

  it("exposes its configured capacity and TTL", () => {
    const cache = new BoundedTtlMap<string, string>({
      maxEntries: 7,
      ttlMs: 1234,
    });

    expect(cache.capacity).toBe(7);
    expect(cache.ttl).toBe(1234);
  });
});
