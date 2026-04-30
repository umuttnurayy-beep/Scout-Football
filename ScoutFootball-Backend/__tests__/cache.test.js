const { TTL, createCache, getCachePolicy } = require('../utils/cache');

describe('cache helpers', () => {
  test('expired memory cache remains available as stale last-good data', async () => {
    const cache = createCache({
      CacheModel: null,
      isMongoConnected: () => false,
    });

    await cache.setCache('sample', { ok: true }, -1);

    await expect(cache.getCache('sample')).resolves.toBeNull();
    await expect(cache.getStaleCache('sample')).resolves.toEqual({ ok: true });
    expect(cache.getStats()).toMatchObject({
      setCount: 1,
      missCount: 1,
      staleHitCount: 1,
      byPrefix: {
        sample: {
          sets: 1,
          misses: 1,
          staleHits: 1,
        },
      },
    });
  });

  test('tracks cache hits, misses, sets and dedupe sharing by prefix', async () => {
    const cache = createCache({
      CacheModel: null,
      isMongoConnected: () => false,
    });

    await expect(cache.getCache('matches_v2_2026-04-30')).resolves.toBeNull();
    await cache.setCache('matches_v2_2026-04-30', ['match'], 1000);
    await expect(cache.getCache('matches_v2_2026-04-30')).resolves.toEqual(['match']);

    let resolveWork;
    const work = new Promise(resolve => { resolveWork = resolve; });
    const first = cache.dedupe('matches_v2_2026-04-30', () => work);
    const second = cache.dedupe('matches_v2_2026-04-30', () => Promise.resolve('unused'));
    resolveWork('done');

    await expect(first).resolves.toBe('done');
    await expect(second).resolves.toBe('done');
    expect(cache.getStats()).toMatchObject({
      hitCount: 1,
      missCount: 1,
      setCount: 1,
      dedupeStartedCount: 1,
      dedupeSharedCount: 1,
      inFlightCount: 0,
      byPrefix: {
        matches_v2: {
          hits: 1,
          misses: 1,
          sets: 1,
          dedupeStarted: 1,
          dedupeShared: 1,
        },
      },
    });
  });

  test('exposes cache policy metadata for diagnostics', () => {
    const policy = getCachePolicy();
    expect(policy.live).toMatchObject({
      ttlMs: TTL.live,
      realtime: true,
      refresh: expect.any(String),
    });
    expect(policy.odds.ttlMs).toBe(TTL.odds);
    expect(policy.seasonFixtures.ttlMs).toBe(TTL.seasonFixtures);
  });
});
