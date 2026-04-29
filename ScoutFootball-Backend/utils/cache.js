const TTL = {
  live: 30 * 1000,
  matches: 60 * 1000,
  matchday: 10 * 60 * 1000,
  futureMatches: 12 * 60 * 60 * 1000,
  pastMatches: 24 * 60 * 60 * 1000,
  standings: 60 * 60 * 1000,
  h2h: 60 * 60 * 1000,
  historical: 30 * 24 * 60 * 60 * 1000,
  weather: 10 * 60 * 1000,
  odds: 5 * 60 * 1000,
  team: 24 * 60 * 60 * 1000,
  teamStats: 24 * 60 * 60 * 1000,
  seasonFixtures: 24 * 60 * 60 * 1000,
  topscorers: 60 * 60 * 1000,
};

function startOfUtcDay(date) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function todayUtcString() {
  return new Date().toISOString().split('T')[0];
}

function isLiveStatus(status) {
  return ['IN_PLAY', 'PAUSED'].includes(String(status || '').toUpperCase()) ||
    /live|progress|half/i.test(String(status || ''));
}

function ttlForMatchDate(date, hasLive) {
  if (hasLive) return TTL.live;
  const target = startOfUtcDay(date);
  const today = startOfUtcDay(todayUtcString());
  if (Number.isNaN(target)) return TTL.matches;
  if (target < today) return TTL.pastMatches;
  if (target > today) return TTL.futureMatches;
  return TTL.matchday;
}

function createCache({ CacheModel, isMongoConnected }) {
  const memCache = {};
  const inFlightRequests = new Map();

  async function dedupe(key, fn) {
    if (inFlightRequests.has(key)) return inFlightRequests.get(key);
    const promise = Promise.resolve()
      .then(fn)
      .finally(() => inFlightRequests.delete(key));
    inFlightRequests.set(key, promise);
    return promise;
  }

  async function getCache(key) {
    if (isMongoConnected()) {
      try {
        const doc = await CacheModel.findOne({ key, expiresAt: { $gt: new Date() } });
        if (doc) return doc.data;
      } catch {}
    }
    const item = memCache[key];
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      return null;
    }
    return item.data;
  }

  async function getStaleCache(key) {
    if (isMongoConnected()) {
      try {
        const doc = await CacheModel.findOne({ key }).sort({ expiresAt: -1 });
        if (doc) return doc.data;
      } catch {}
    }
    return memCache[key]?.data || null;
  }

  async function setCache(key, data, ttlMs) {
    const expiresAt = new Date(Date.now() + ttlMs);
    if (isMongoConnected()) {
      try {
        await CacheModel.findOneAndUpdate({ key }, { data, expiresAt }, { upsert: true, new: true });
        return;
      } catch {}
    }
    memCache[key] = { data, expiresAt: Date.now() + ttlMs };
  }

  return { dedupe, getCache, getStaleCache, setCache };
}

module.exports = {
  TTL,
  createCache,
  isLiveStatus,
  ttlForMatchDate,
};
