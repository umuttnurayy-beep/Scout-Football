const express = require('express');
const request = require('supertest');
const { buildKnockoutStageGroups, createUclRouter, normalizeStage } = require('../routes/ucl');
const { createApiResponder } = require('../utils/apiResponses');
const { TTL } = require('../utils/cache');

function createApp(overrides = {}) {
  const cache = new Map();
  const responder = createApiResponder({
    getStaleCache: async key => cache.get(key) || null,
    diagnosticsSecret: 'secret',
  });
  const upstream = {
    fetchJson: jest.fn(async () => ({
      matches: [
        { id: 1, stage: 'LEAGUE_PHASE' },
        { id: 2, stage: 'LAST_16' },
        { id: 3, stage: 'KNOCKOUT_ROUND_PLAY_OFFS' },
        { id: 4, stage: 'FINAL' },
      ],
    })),
  };
  const app = express();
  app.use(createUclRouter({
    ...responder,
    config: {
      CURRENT_FOOTBALL_DATA_SEASON: '2025',
      FOOTBALL_DATA_BASE: 'https://football-data.example',
      FOOTBALL_DATA_KEY: overrides.FOOTBALL_DATA_KEY ?? 'fd-key',
    },
    getCache: async key => cache.get(key) || null,
    setCache: async (key, value) => cache.set(key, value),
    TTL,
    upstream,
  }));
  return { app, cache, upstream };
}

describe('ucl router', () => {
  test('normalizeStage maps known knockout variants', () => {
    expect(normalizeStage('LAST_16')).toBe('ROUND_OF_16');
    expect(normalizeStage('KNOCKOUT_ROUND_PLAY_OFFS')).toBe('KNOCKOUT_ROUND_PLAY_OFF');
    expect(normalizeStage('FINAL')).toBe('FINAL');
  });

  test('buildKnockoutStageGroups filters non-knockout stages', () => {
    const grouped = buildKnockoutStageGroups([
      { id: 1, stage: 'LEAGUE_PHASE' },
      { id: 2, stage: 'LAST_16' },
      { id: 3, stage: 'FINAL' },
    ]);

    expect(Object.keys(grouped).sort()).toEqual(['FINAL', 'ROUND_OF_16']);
    expect(grouped.ROUND_OF_16).toEqual([{ id: 2, stage: 'LAST_16' }]);
  });

  test('GET /ucl/knockouts returns grouped knockout matches', async () => {
    const { app, upstream } = createApp();

    const res = await request(app).get('/ucl/knockouts?season=2025');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ROUND_OF_16: [{ id: 2 }],
      KNOCKOUT_ROUND_PLAY_OFF: [{ id: 3 }],
      FINAL: [{ id: 4 }],
    });
    expect(res.body.LEAGUE_PHASE).toBeUndefined();
    expect(upstream.fetchJson).toHaveBeenCalledTimes(1);
  });

  test('GET /ucl/knockouts reports missing football-data config', async () => {
    const { app } = createApp({ FOOTBALL_DATA_KEY: '' });

    const res = await request(app).get('/ucl/knockouts');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'missing_config' },
      data: {},
    });
  });
});
