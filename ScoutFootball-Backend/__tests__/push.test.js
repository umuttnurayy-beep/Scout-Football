const express = require('express');
const request = require('supertest');
const { cleanPushPrefs, cleanWatchedTeams, createPushRouter, sendPushNotifications } = require('../routes/push');

function createApp(overrides = {}) {
  const PushToken = overrides.PushToken || {
    findOneAndUpdate: jest.fn(async () => ({})),
    deleteOne: jest.fn(async () => ({})),
  };
  const app = express();
  app.use(express.json());
  app.use(createPushRouter({
    fetchImpl: overrides.fetchImpl || jest.fn(async () => ({ json: async () => ({ data: [] }) })),
    getMongoConnected: () => overrides.mongoConnected ?? true,
    PushToken,
    pushTestSecret: overrides.pushTestSecret ?? 'push-secret',
    writeLimiter: (_req, _res, next) => next(),
  }));
  return { app, PushToken };
}

describe('push router', () => {
  test('cleanPushPrefs and cleanWatchedTeams sanitize payloads', () => {
    expect(cleanPushPrefs({ daily: 1, favTeam: 0, featured: 'yes' })).toEqual({
      daily: true,
      favTeam: false,
      featured: true,
    });
    expect(cleanWatchedTeams([' Galatasaray ', '', 42, 'Besiktas'])).toEqual(['Galatasaray', 'Besiktas']);
  });

  test('POST /register-token rejects invalid push token', async () => {
    const { app } = createApp();

    const res = await request(app)
      .post('/register-token')
      .send({ token: 'not-a-real-token' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false });
  });

  test('POST /register-token stores sanitized preferences', async () => {
    const { app, PushToken } = createApp();

    const res = await request(app)
      .post('/register-token')
      .send({
        token: 'ExpoPushToken[test_token-123]',
        prefs: { daily: true, favTeam: 'yes', featured: 0 },
        watchedTeams: [' Fenerbahce ', '', 'Besiktas'],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(PushToken.findOneAndUpdate).toHaveBeenCalledWith(
      { token: 'ExpoPushToken[test_token-123]' },
      expect.objectContaining({
        token: 'ExpoPushToken[test_token-123]',
        prefs: { daily: true, favTeam: true, featured: false },
        watchedTeams: ['Fenerbahce', 'Besiktas'],
      }),
      { upsert: true, new: true },
    );
  });

  test('POST /push/test requires secret', async () => {
    const { app } = createApp();

    const res = await request(app)
      .post('/push/test')
      .send({ token: 'ExpoPushToken[test_token-123]' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ ok: false, error: 'forbidden' });
  });

  test('sendPushNotifications removes unregistered device tokens', async () => {
    const PushToken = { deleteOne: jest.fn(async () => ({})) };
    const fetchImpl = jest.fn(async () => ({
      json: async () => ({
        data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }],
      }),
    }));

    await sendPushNotifications({
      fetchImpl,
      PushToken,
      tokens: ['ExpoPushToken[dead_device]'],
      title: 'Title',
      body: 'Body',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(PushToken.deleteOne).toHaveBeenCalledWith({ token: 'ExpoPushToken[dead_device]' });
  });
});
