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