const express = require('express');
const request = require('supertest');
const createFootballDataRouter = require('../routes/footballData');
const { createApiResponder } = require('../utils/apiResponses');
const { TTL } = require('../utils/cache');

function createApp(overrides = {}) {
  const cache = new Map();
  const responder = createApiResponder({
    getStaleCache: async key => cache.get(key) || null,
    diagnosticsSecret: 'secret',
  });
  const calls = {
    match: [],
    matches: [],
    h2h: [],
    teamMatches: [],
    standings: [],
  };
  const upstream = {
    fetchJson: jest.fn(async () => ({ scorers: [] })),
  };
  const app = express();
  app.use(createFootballDataRouter({
    ...responder,
    config: {
      FOOTBALL_DATA_BASE: 'https://football-data.example',
      FOOTBALL_DATA_KEY: overrides.FOOTBALL_DATA_KEY ?? 'fd-key',
    },
    fetchFootballDataH2H: async (matchId, isFinished) => {
      calls.h2h.push({ matchId, isFinished });
      return overrides.h2h ?? [{ id: 9001 }];
    },
    fetchFootballDataMatch: async matchId => {
      calls.match.push(matchId);
      return overrides.match ?? {
        id: Number(matchId),
        status: 'TIMED',
        utcDate: '2026-05-01T18:00:00Z',
        homeTeam: { id: 10, name: 'Home FC' },
        awayTeam: { id: 20, name: 'Away FC' },
      };
    },
    fetchFootballDataMatchesForDate: async date => {
      calls.matches.push(date);
      return overrides.matches ?? [{ id: 1 }];
    },
    fetchFootballDataTeamMatches: async teamId => {
      calls.teamMatches.push(teamId);
      return overrides.teamMatchesById?.[teamId] ?? [{ id: teamId * 100 }];
    },
    fetchStandingsForLeague: async leagueId => {
      calls.standings.push(leagueId);
      return [{ team: 'Team', pts: 10 }];
    },
    footballDataMatchCacheTtl: () => 60000,
    getCache: async key => cache.get(key) || null,
    setCache: async (key, value) => cache.set(key, value),
    TTL,
    upstream,
  }));
  return { app, cache, calls, upstream };
}

describe('footballData router', () => {
  test('GET /matches uses date query and returns matches', async () => {
    const { app, calls } = createApp();

    const res = await request(app).get('/matches?date=2026-05-01');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1 }]);
    expect(calls.matches).toEqual(['2026-05-01']);
  });

  test('GET /match/:matchId/context returns context envelope before /match/:matchId route', async () => {
    const { app, calls } = createApp();

    const res = await request(app).get('/match/123/context');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        match: { id: 123 },
        homeForm: [{ id: 1000 }],
        awayForm: [{ id: 2000 }],
        h2h: [{ id: 9001 }],
        issues: [],
        generatedAt: expect.any(String),
      },
    });
    expect(calls.match).toEqual(['123']);
    expect(calls.teamMatches).toEqual([10, 20]);
    expect(calls.h2h).toEqual([{ matchId: '123', isFinished: false }]);
  });

  test('GET /match/:matchId/context marks h2h issue when h2h fetch fails', async () => {
    const { app } = createApp({
      h2h: Promise.reject(new Error('h2h failed')),
    });

    const res = await request(app).get('/match/123/context');

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toEqual(['h2h']);
    expect(res.body.data.h2h).toEqual([]);
  });

  test('GET /match/:matchId/context derives H2H from team forms when direct H2H is empty', async () => {
    const firstLeg = {
      id: 456,
      utcDate: '2026-04-29T19:00:00Z',
      status: 'FINISHED',
      homeTeam: { id: 20, name: 'Away FC' },
      awayTeam: { id: 10, name: 'Home FC' },
      score: { fullTime: { home: 1, away: 1 } },
    };
    const { app } = createApp({
      h2h: [],
      teamMatchesById: {
        10: [{ id: 1000 }, firstLeg],
        20: [firstLeg, { id: 2000 }],
      },
    });

    const res = await request(app).get('/match/123/context');

    expect(res.status).toBe(200);
    expect(res.body.data.h2h).toEqual([firstLeg]);
    expect(res.body.data.issues).toEqual([]);
  });

  test('GET /match/:matchId/context revalidates cached partial form payloads', async () => {
    const { app, cache, calls } = createApp();
    cache.set('match_context_v2_123_active', {
      match: { id: 123 },
      homeForm: [],
      awayForm: [{ id: 2000 }],
      h2h: [],
      issues: ['form'],
      generatedAt: '2026-05-01T00:00:00.000Z',
    });

    const res = await request(app).get('/match/123/context');

    expect(res.status).toBe(200);
    expect(res.body.data.homeForm).toEqual([{ id: 1000 }]);
    expect(res.body.data.awayForm).toEqual([{ id: 2000 }]);
    expect(res.body.data.issues).toEqual([]);
    expect(calls.match).toEqual(['123']);
    expect(calls.teamMatches).toEqual([10, 20]);
  });

  test('GET /h2h/:matchId falls back to team-form intersections when direct H2H is empty', async () => {
    const firstLeg = {
      id: 456,
      utcDate: '2026-04-29T19:00:00Z',
      status: 'FINISHED',
      homeTeam: { id: 20, name: 'Away FC' },
      awayTeam: { id: 10, name: 'Home FC' },
      score: { fullTime: { home: 1, away: 1 } },
    };
    const { app } = createApp({
      h2h: [],
      teamMatchesById: {
        10: [firstLeg],
        20: [firstLeg],
      },
    });

    const res = await request(app).get('/h2h/123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([firstLeg]);
  });

  test('GET /standings/:leagueId validates missing football-data config', async () => {
    const { app } = createApp({ FOOTBALL_DATA_KEY: '' });

    const res = await request(app).get('/standings/2021');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'missing_config' },
      data: [],
    });
  });
});
