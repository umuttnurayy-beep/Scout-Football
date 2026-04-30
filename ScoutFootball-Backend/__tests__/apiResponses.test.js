const { createApiResponder } = require('../utils/apiResponses');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('apiResponses', () => {
  test('apiStaleOrError serves stale cache and records fallback metrics', async () => {
    const responder = createApiResponder({
      getStaleCache: async () => ({ cached: true }),
      diagnosticsSecret: 'secret',
    });
    const res = createRes();

    await responder.apiStaleOrError(res, 'weather_London', 502, 'upstream_error', 'provider failed', null);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      stale: true,
      data: { cached: true },
      warning: { code: 'upstream_error' },
    });
    expect(responder.getFallbackMetrics()).toMatchObject({
      staleServedCount: 1,
      errorWithoutStaleCount: 0,
      byCode: {
        upstream_error: { staleServed: 1, errorWithoutStale: 0 },
      },
      byCachePrefix: {
        weather_London: { staleServed: 1, errorWithoutStale: 0 },
      },
    });
  });

  test('apiStaleOrError returns error when stale cache is missing', async () => {
    const responder = createApiResponder({
      getStaleCache: async () => null,
      diagnosticsSecret: 'secret',
    });
    const res = createRes();

    await responder.apiStaleOrError(res, 'odds_match_1', 502, 'upstream_error', 'provider failed', []);

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'upstream_error' },
      data: [],
    });
    expect(responder.getFallbackMetrics()).toMatchObject({
      staleServedCount: 0,
      errorWithoutStaleCount: 1,
    });
  });

  test('requireDiagnosticsSecret blocks missing or invalid secrets', () => {
    const responder = createApiResponder({
      getStaleCache: async () => null,
      diagnosticsSecret: 'secret',
    });

    const missingSecretRes = createRes();
    expect(responder.requireDiagnosticsSecret({ headers: {} }, missingSecretRes)).toBe(false);
    expect(missingSecretRes.statusCode).toBe(403);

    const validSecretRes = createRes();
    expect(responder.requireDiagnosticsSecret({
      headers: { 'x-diagnostics-secret': 'secret' },
    }, validSecretRes)).toBe(true);
    expect(validSecretRes.body).toBeNull();
  });
});
