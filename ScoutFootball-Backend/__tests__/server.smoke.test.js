const request = require('supertest');

process.env.FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY || 'test-football-data-key';
process.env.WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'test-weather-key';
process.env.ODDS_API_KEY = process.env.ODDS_API_KEY || 'test-odds-key';
process.env.DIAGNOSTICS_SECRET = process.env.DIAGNOSTICS_SECRET || 'test-diagnostics-secret';

const app = require('../server');

describe('ScoutFootball backend smoke tests', () => {
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
      fallbacks: {
        staleServedCount: expect.any(Number),
        errorWithoutStaleCount: expect.any(Number),
        byCode: expect.any(Object),
        byCachePrefix: expect.any(Object),
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
