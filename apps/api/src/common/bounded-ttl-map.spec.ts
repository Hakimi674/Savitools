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
