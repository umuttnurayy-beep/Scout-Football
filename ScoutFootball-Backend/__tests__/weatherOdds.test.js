const express = require('express');
const request = require('supertest');
const createWeatherOddsRouter = require('../routes/weatherOdds');
const { createApiResponder } = require('../utils/apiResponses');
const { TTL } = require('../utils/cache');

function createApp(overrides = {}) {
  const cache = new Map();
  const responder = createApiResponder({
    getStaleCache: async key => cache.get(key) || null,
    diagnosticsSecret: 'secret',
  });
  const upstream = {
    fetchJson: jest.fn(overrides.fetchJson || (async () => ({
      current: {
        temp_c: 18,
        condition: { text: 'Clear' },
        wind_kph: 9,
        humidity: 55,
      },
      location: { name: 'London' },
    }))),
  };
  const app = express();
  app.use(createWeatherOddsRouter({
    ...responder,
    config: {
      WEATHER_API_KEY: overrides.WEATHER_API_KEY ?? 'weather-key',
      WEATHER_BASE: 'https://weather.example',
      ODDS_API_KEY: overrides.ODDS_API_KEY ?? 'odds-key',
      ODDS_BASE: 'https://odds.example',
    },
    getCache: async key => cache.get(key) || null,
    setCache: async (key, value) => cache.set(key, value),
    TTL,
    upstream,
  }));
  return { app, cache, upstream };
}

describe('weatherOdds router', () => {
  test('GET /weather validates city query', async () => {
    const { app } = createApp();

    const res = await request(app).get('/weather');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
      data: null,
    });
  });

  test('GET /weather maps provider response and caches result', async () => {
    const { app, upstream } = createApp();

    const res = await request(app).get('/weather?city=London');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      temp: 18,
      condition: 'Clear',
      wind: 9,
      humidity: 55,
      city: 'London',
    });
    expect(upstream.fetchJson).toHaveBeenCalledTimes(1);
  });

  test('GET /odds validates sport query', async () => {
    const { app } = createApp();

    const res = await request(app).get('/odds');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
      data: [],
    });
  });

  test('GET /odds returns upstream odds array', async () => {
    const { app, upstream } = createApp({
      fetchJson: async () => [{ id: 'game-1' }],
    });

    const res = await request(app).get('/odds?sport=soccer_epl');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'game-1' }]);
    expect(upstream.fetchJson).toHaveBeenCalledTimes(1);
  });
});
