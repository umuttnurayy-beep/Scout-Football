const { createUpstreamJsonClient } = require('../utils/upstream');

describe('upstream request client', () => {
  test('dedupes concurrent requests with the same method, URL and body', async () => {
    let callCount = 0;
    let resolveFetch;
    const pendingFetch = new Promise(resolve => { resolveFetch = resolve; });
    const fetchImpl = jest.fn(() => {
      callCount += 1;
      return pendingFetch;
    });

    const client = createUpstreamJsonClient({ fetchImpl });
    const first = client.fetchJson('https://example.com/data', {}, 'example');
    const second = client.fetchJson('https://example.com/data', {}, 'example');
    await Promise.resolve();

    expect(client.getInFlightCount()).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.getStats()).toMatchObject({
      startedCount: 1,
      dedupedCount: 1,
      inFlightCount: 1,
      byLabel: {
        example: { started: 1, deduped: 1 },
      },
    });

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });
    expect(callCount).toBe(1);
    expect(client.getInFlightCount()).toBe(0);
    expect(client.getStats().inFlightCount).toBe(0);
  });

  test('does not dedupe different URLs', async () => {
    const fetchImpl = jest.fn(async url => ({
      ok: true,
      status: 200,
      json: async () => ({ url }),
    }));
    const client = createUpstreamJsonClient({ fetchImpl });

    await Promise.all([
      client.fetchJson('https://example.com/a', {}, 'a'),
      client.fetchJson('https://example.com/b', {}, 'b'),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(client.getStats()).toMatchObject({
      startedCount: 2,
      dedupedCount: 0,
      byLabel: {
        a: { started: 1, deduped: 0 },
        b: { started: 1, deduped: 0 },
      },
    });
  });

  test('retries transient upstream failures once by default', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ message: 'temporary' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
    const client = createUpstreamJsonClient({ fetchImpl });

    await expect(client.fetchJson('https://example.com/flaky', { retryDelayMs: 0 }, 'flaky'))
      .resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('does not retry non-transient upstream errors', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: 'not found' }),
    }));
    const client = createUpstreamJsonClient({ fetchImpl });

    await expect(client.fetchJson('https://example.com/missing', { retryDelayMs: 0 }, 'missing'))
      .rejects.toThrow('missing returned HTTP 404');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
