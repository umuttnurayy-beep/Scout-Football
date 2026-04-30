const express = require('express');
const request = require('supertest');
const createSuperLigRouter = require('../routes/superlig');
const { createApiResponder } = require('../utils/apiResponses');
const { TTL, isLiveStatus, ttlForMatchDate } = require('../utils/cache');

function createApp(overrides = {}) {
  const cache = new Map();
  const responder = createApiResponder({
    getStaleCache: async key => cache.get(key) || null,
    diagnosticsSecret: 'secret',
  });
  const calls = {
    h2h: [],
    match: [],
    matches: [],
    standings: 0,
    teamContext: [],
    teamForm: [],
  };
  const upstream = {
    fetchJson: jest.fn(async () => ({ player: [], events: [] })),
  };
  const app = express();
  app.use(createSuperLigRouter({
    ...responder,
    config: {
      CURRENT_SPORTSDB_SEASON: '2025-2026',
      SL_LEAGUE_ID: '4339',
      SPORTSDB_BASE: 'https://sportsdb.example',
    },
    fetchAllSportsH2HMatches: async (home, away) => {
      calls.h2h.push({ home, away });
      if (overrides.h2hError) throw new Error('h2h failed');
      return overrides.h2h ?? [{ id: 'h2h-1' }];
    },
    fetchSuperLigMatch: async eventId => {
      calls.match.push(eventId);
      return overrides.event ?? {
        idEvent: eventId,
        idHomeTeam: '10',
        idAwayTeam: '20',
        strHomeTeam: 'Galatasaray',
        strAwayTeam: 'Fenerbahce',
        strStatus: 'Scheduled',
        dateEvent: '2026-05-01',
      };
    },
    fetchSuperLigMatchesForDate: async date => {
      calls.matches.push(date);
      return overrides.matches ?? [{ id: 'sl-1' }];
    },
    fetchSuperLigStandingsCached: async () => {
      calls.standings += 1;
      return [{ team: 'Galatasaray', pts: 80 }];
    },
    fetchSuperLigTeamContext: async teamId => {
      calls.teamContext.push(teamId);
      return { teamId, recentMatches: [{ id: teamId * 10 }] };
    },
    fetchSuperLigTeamFormMatches: async teamId => {
      calls.teamForm.push(teamId);
      return [{ id: teamId * 100 }];
    },
    getCache: async key => cache.get(key) || null,
    isLiveStatus,
    setCache: async (key, value) => cache.set(key, value),
    TTL,
    ttlForMatchDate,
    upstream,
  }));
  return { app, cache, calls, upstream };
}

describe('superlig router', () => {
  test('GET /superlig/matches uses date query and returns matches', async () => {
    const { app, calls } = createApp();

    const res = await request(app).get('/superlig/matches?date=2026-05-01');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'sl-1' }]);
    expect(calls.matches).toEqual(['2026-05-01']);
  });

  test('GET /superlig/match/:eventId/context returns context before match route', async () => {
    const { app, calls } = createApp();

    const res = await request(app).get('/superlig/match/sl-123/context');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        event: { idEvent: 'sl-123' },
        homeContext: { teamId: 10 },
        awayContext: { teamId: 20 },
        h2h: [{ id: 'h2h-1' }],
        issues: [],
        generatedAt: expect.any(String),
      },
    });
    expect(calls.match).toEqual(['sl-123']);
    expect(calls.teamContext).toEqual([10, 20]);
    expect(calls.h2h).toEqual([{ home: 'Galatasaray', away: 'Fenerbahce' }]);
  });

  test('GET /superlig/match/:eventId/context marks h2h issue when h2h fetch fails', async () => {
    const { app } = createApp({ h2hError: true });

    const res = await request(app).get('/superlig/match/sl-123/context');

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toEqual(['h2h']);
    expect(res.body.data.h2h).toEqual([]);
  });

  test('GET /superlig/team-form/:teamId validates team id', async () => {
    const { app } = createApp();

    const res = await request(app).get('/superlig/team-form/not-a-number');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
      data: [],
    });
  });
});
