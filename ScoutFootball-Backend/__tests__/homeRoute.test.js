const express = require('express');
const request = require('supertest');
const createHomeRouter = require('../routes/home');
const { createApiResponder } = require('../utils/apiResponses');

function createApp(homeService) {
  const responder = createApiResponder({
    getStaleCache: async () => null,
    diagnosticsSecret: 'secret',
  });
  const app = express();
  app.use(createHomeRouter({ apiError: responder.apiError, homeService }));
  return app;
}

describe('home router', () => {
  test('GET /home passes date query to homeService', async () => {
    const homeService = {
      buildHome: jest.fn(async date => ({ ok: true, data: { date } })),
    };
    const app = createApp(homeService);

    const res = await request(app).get('/home?date=2026-05-01');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { date: '2026-05-01' } });
    expect(homeService.buildHome).toHaveBeenCalledWith('2026-05-01');
  });

  test('GET /home returns standard upstream error when service fails', async () => {
    const homeService = {
      buildHome: jest.fn(async () => {
        throw new Error('home failed');
      }),
    };
    const app = createApp(homeService);

    const res = await request(app).get('/home');

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'upstream_error', message: 'home failed' },
      data: null,
    });
  });
});
