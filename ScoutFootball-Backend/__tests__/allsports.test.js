const express = require('express');
const request = require('supertest');
const createAllSportsRouter = require('../routes/allsports');
const { createApiResponder } = require('../utils/apiResponses');
const { TTL } = require('../utils/cache');

function createApp(overrides = {}) {
  const cache = new Map();
  const responder = createApiResponder({
    getStaleCache: async key => cache.get(key) || null,
    diagnosticsSecret: 'secret',
  });
  const calls = { h2h: [] };
  const upstream = {
    fetchJson: jest.fn(async url => {
      const target = String(url);
      if (target.includes('met=Teams')) {
        return { result: [{ team_key: '10', team_name: 'Galatasaray' }] };
      }
      if (target.includes('met=Fixtures')) {
        return {
          result: [{
            home_team_key: '10',
            event_final_result: '2 - 1',
            statistics: [
              { type: 'Corners', home: '6', away: '3' },
              { type: 'Ball Possession', home: '58%', away: '42%' },
            ],
          }],
        };
      }
      return {};
    }),
  };
  const app = express();
  app.use(createAllSportsRouter({
    ...responder,
    config: {
      ALLSPORTS_BASE: 'https://allsports.example',
      ALLSPORTS_KEY: overrides.ALLSPORTS_KEY ?? 'allsports-key',
    },
    fetchAllSportsH2HMatches: async (home, away) => {
      calls.h2h.push({ home, away });
      return [{ id: 'h2h-1' }];
    },
    getCache: async key => cache.get(key) || null,
    missingConfig: responder.missingConfig,
    setCache: async (key, value) => cache.set(key, value),
    TTL,
    upstream,
  }));
  return { app, calls, upstream };
}

describe('allsports router', () => {
  test('GET /allsports/h2h validates query params', async () => {
    const { app } = createApp();

    const res = await request(app).get('/allsports/h2h');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
      data: [],
    });
  });

  test('GET /allsports/h2h delegates to h2h helper', async () => {
    const { app, calls } = createApp();

    const res = await request(app).get('/allsports/h2h?home=Galatasaray&away=Fenerbahce');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'h2h-1' }]);
    expect(calls.h2h).toEqual([{ home: 'Galatasaray', away: 'Fenerbahce' }]);
  });

  test('GET /allsports/team-stats maps fixture statistics', async () => {
    const { app, upstream } = createApp();

    const res = await request(app).get('/allsports/team-stats/Galatasaray');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      avgCorners: '6.0',
      avgOppCorners: '3.0',
      avgPossession: 58,
      matchesAnalyzed: 1,
    });
    expect(upstream.fetchJson).toHaveBeenCalledTimes(2);
  });

  test('GET /allsports/team-stats reports missing config', async () => {
    const { app } = createApp({ ALLSPORTS_KEY: '' });

    const res = await request(app).get('/allsports/team-stats/Galatasaray');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'missing_config' },
      data: null,
    });
  });
});
