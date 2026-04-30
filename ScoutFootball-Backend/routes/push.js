const express = require('express');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanPushPrefs(value) {
  const prefs = isPlainObject(value) ? value : {};
  return {
    daily: Boolean(prefs.daily),
    favTeam: Boolean(prefs.favTeam),
    featured: Boolean(prefs.featured),
  };
}

function cleanWatchedTeams(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

async function sendPushNotifications({ fetchImpl, PushToken, tokens, title, body }) {
  if (!tokens.length) return;
  const messages = tokens.map(t => ({ to: t, title, body, sound: 'default' }));
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk),
      });
      const data = await res.json();
      if (data.data) {
        for (let j = 0; j < data.data.length; j++) {
          if (data.data[j].status === 'error' &&
              data.data[j].details?.error === 'DeviceNotRegistered') {
            try { await PushToken.deleteOne({ token: chunk[j].to }); } catch {}
          }
        }
      }
    } catch (e) {
      console.error('Expo push hatası:', e.message);
    }
  }
}

function createPushRouter({
  fetchImpl,
  getMongoConnected,
  PushToken,
  pushTestSecret,
  writeLimiter,
}) {
  const router = express.Router();

  router.post('/register-token', writeLimiter, async (req, res) => {
    const { token, prefs, watchedTeams } = req.body;
    if (typeof token !== 'string' || !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token)) {
      return res.status(400).json({ ok: false, error: 'geçerli token gerekli' });
    }
    if (!getMongoConnected()) return res.json({ ok: false, error: 'db yok' });
    try {
      await PushToken.findOneAndUpdate(
        { token },
        { token, prefs: cleanPushPrefs(prefs), watchedTeams: cleanWatchedTeams(watchedTeams), updatedAt: new Date() },
        { upsert: true, new: true },
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('register-token hatası:', e.message);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.post('/push/test', writeLimiter, async (req, res) => {
    if (!pushTestSecret || req.headers['x-push-test-secret'] !== pushTestSecret) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    const { token, title = 'ScoutFootball test', body = 'Push bildirimi test mesajı' } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'token gerekli' });
    try {
      await sendPushNotifications({ fetchImpl, PushToken, tokens: [token], title, body });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
}

module.exports = {
  cleanPushPrefs,
  cleanWatchedTeams,
  createPushRouter,
  sendPushNotifications,
};
