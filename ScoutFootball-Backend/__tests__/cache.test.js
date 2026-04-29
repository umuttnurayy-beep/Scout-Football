const { createCache } = require('../utils/cache');

describe('cache helpers', () => {
  test('expired memory cache remains available as stale last-good data', async () => {
    const cache = createCache({
      CacheModel: null,
      isMongoConnected: () => false,
    });

    await cache.setCache('sample', { ok: true }, -1);

    await expect(cache.getCache('sample')).resolves.toBeNull();
    await expect(cache.getStaleCache('sample')).resolves.toEqual({ ok: true });
  });
});
