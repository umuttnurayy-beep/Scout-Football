const express = require('express');
const request = require('supertest');
const createDiagnosticsRouter = require('../routes/diagnostics');
const { createApiResponder } = require('../utils/apiResponses');

function createApp(overrides = {}) {
  const responder = createApiResponder({
    getStaleCache: async () => null,
    diagnosticsSecret: 'secret',
  });
  const PushToken = overrides.PushToken || {
    countDocuments: jest.fn(async () => 0),
  };
  const app = express();
  app.use(createDiagnosticsRouter({
    getCachePolicy: () => ({ live: { ttlMs: 30000 } }),
    getCacheStats: () => ({ hitCount: 1, missCount: 2 }),
    getFallbackMetrics: () => ({ staleServedCount: 0, errorWithoutStaleCount: 0 }),
    getMongoConnected: () => Boolean(overrides.mongoConnected),
    PushToken,
    requireDiagnosticsSecret: responder.requireDiagnosticsSecret,
    upstream: {
      getStats: () => ({ startedCount: 3, dedupedCount: 1, inFlightCount: 0 }),
    },
  }));
  return { app, PushToken };
}

describe('diagnostics router', () => {
  test('GET /diagnostics/upstream is protected', async () => {
    const { app } = createApp();

    const res = await request(app).get('/diagnostics/upstream');

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  test('GET /diagnostics/upstream returns metrics with valid secret', async () => {
    const { app } = createApp();

    const res = await request(app)
      .get('/diagnostics/upstream')
      .set('x-diagnostics-secret', 'secret');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      upstream: { startedCount: 3, dedupedCount: 1, inFlightCount: 0 },
      cache: { hitCount: 1, missCount: 2 },
      cachePolicy: { live: { ttlMs: 30000 } },
      fallbacks: { staleServedCount: 0, errorWithoutStaleCount: 0 },
    });
  });

  test('GET /push/status returns token counts when mongo is connected', async () => {
    const PushToken = {
      countDocuments: jest.fn()
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2),
    };
    const { app } = createApp({ mongoConnected: true, PushToken });

    const res = await request(app)
      .get('/push/status')
      .set('x-diagnostics-secret', 'secret');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      mongo: true,
      tokenCount: 10,
      dailyCount: 7,
      favTeamCount: 4,
      featuredCount: 2,
    });
  });
});
