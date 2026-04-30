const request = require('supertest');

process.env.FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY || 'test-football-data-key';
process.env.WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'test-weather-key';
process.env.ODDS_API_KEY = process.env.ODDS_API_KEY || 'test-odds-key';
process.env.DIAGNOSTICS_SECRET = process.env.DIAGNOSTICS_SECRET || 'test-diagnostics-secret';

jest.mock('node-fetch', () => jest.fn());

const fetch = require('node-fetch');
const app = require('../server');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

describe('ScoutFootball backend smoke tests', () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  test('GET /health returns service status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.mongo).toBe('boolean');
  });

  test('GET /allsports/h2h validates required query params', async () => {
    const res = await request(app).get('/allsports/h2h');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
      data: [],
    });
  });

  test('POST /register-token rejects invalid push token', async () => {
    const res = await request(app)
      .post('/register-token')
      .send({ token: 'not-a-real-token' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'geçerli token gerekli',
    });
  });

  test('GET /push/status is protected without diagnostics secret', async () => {
    const res = await request(app).get('/push/status');

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  test('GET /diagnostics/upstream returns protected upstream metrics', async () => {
    const forbidden = await request(app).get('/diagnostics/upstream');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.ok).toBe(false);

    const res = await request(app)
      .get('/diagnostics/upstream')
      .set('x-diagnostics-secret', 'test-diagnostics-secret');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      upstream: {
        startedCount: expect.any(Number),
        dedupedCount: expect.any(Number),
        inFlightCount: expect.any(Number),
      },
      cache: {
        hitCount: expect.any(Number),
        missCount: expect.any(Number),
        staleHitCount: expect.any(Number),
        staleMissCount: expect.any(Number),
        setCount: expect.any(Number),
        dedupeStartedCount: expect.any(Number),
        dedupeSharedCount: expect.any(Number),
        inFlightCount: expect.any(Number),
        byPrefix: expect.any(Object),
      },
      cachePolicy: {
        live: {
          ttlMs: expect.any(Number),
          realtime: expect.any(Boolean),
          refresh: expect.any(String),
        },
        odds: {
          ttlMs: expect.any(Number),
          realtime: expect.any(Boolean),
          refresh: expect.any(String),
        },
      },
      fallbacks: {
        staleServedCount: expect.any(Number),
        errorWithoutStaleCount: expect.any(Number),
        byCode: expect.any(Object),
        byCachePrefix: expect.any(Object),
      },
    });
  });

  test('GET /match/:matchId/context returns match context envelope', async () => {
    fetch.mockImplementation(async url => {
      const target = String(url);
      if (target.includes('/matches/98765/head2head')) {
        return jsonResponse({ matches: [{ id: 9001, status: 'FINISHED' }] });
      }
      if (target.includes('/teams/101/matches')) {
        return jsonResponse({ matches: [{ id: 7001, status: 'FINISHED' }] });
      }
      if (target.includes('/teams/202/matches')) {
        return jsonResponse({ matches: [{ id: 7002, status: 'FINISHED' }] });
      }
      if (target.includes('/matches/98765')) {
        return jsonResponse({
          id: 98765,
          status: 'TIMED',
          utcDate: '2026-05-01T18:00:00Z',
          homeTeam: { id: 101, name: 'Home FC' },
          awayTeam: { id: 202, name: 'Away FC' },
        });
      }
      throw new Error(`Unexpected fetch: ${target}`);
    });

    const res = await request(app).get('/match/98765/context');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        match: { id: 98765 },
        homeForm: [{ id: 7001 }],
        awayForm: [{ id: 7002 }],
        h2h: [{ id: 9001 }],
        issues: [],
        generatedAt: expect.any(String),
      },
    });
  });

  test('GET /superlig/match/:eventId/context returns Super Lig context envelope', async () => {
    fetch.mockImplementation(async url => {
      const target = String(url);
      if (target.includes('/lookupevent.php?id=sl-smoke-context')) {
        return jsonResponse({
          events: [{
            idEvent: 'sl-smoke-context',
            strStatus: 'Scheduled',
            dateEvent: '2026-05-01',
            strHomeTeam: 'Gaziantep FK',
            strAwayTeam: 'Besiktas',
          }],
        });
      }
      throw new Error(`Unexpected fetch: ${target}`);
    });

    const res = await request(app).get('/superlig/match/sl-smoke-context/context');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        event: { idEvent: 'sl-smoke-context' },
        homeContext: null,
        awayContext: null,
        h2h: [],
        issues: ['h2h'],
        generatedAt: expect.any(String),
      },
    });
  });

  test('GET /weather validates required city query param', async () => {
    const res = await request(app).get('/weather');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
      data: null,
    });
  });
});
