const request = require('supertest');

process.env.FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY || 'test-football-data-key';
process.env.WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'test-weather-key';
process.env.ODDS_API_KEY = process.env.ODDS_API_KEY || 'test-odds-key';

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

  test('GET /push/status is protected when diagnostics are disabled', async () => {
    const res = await request(app).get('/push/status');

    expect([403, 404]).toContain(res.status);
    expect(res.body.ok).toBe(false);
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
