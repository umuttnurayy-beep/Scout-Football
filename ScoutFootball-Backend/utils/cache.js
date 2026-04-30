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

const CACHE_POLICY = {
  live: {
    ttlMs: TTL.live,
    realtime: true,
    refresh: 'Canlı maç skorları ve canlı durumlar için kısa TTL.',
  },
  matches: {
    ttlMs: TTL.matches,
    realtime: false,
    refresh: 'Tarihi belirsiz fixture istekleri için güvenli kısa varsayılan.',
  },
  matchday: {
    ttlMs: TTL.matchday,
    realtime: false,
    refresh: 'Bugünün maç listesi; sık değişebilir ama her istekte upstream çağrısı gerektirmez.',
  },
  futureMatches: {
    ttlMs: TTL.futureMatches,
    realtime: false,
    refresh: 'Gelecek fikstürler düşük değişim hızına sahiptir.',
  },
  pastMatches: {
    ttlMs: TTL.pastMatches,
    realtime: false,
    refresh: 'Geçmiş maçlar genellikle statiktir; geç düzeltmelere alan bırakılır.',
  },
  standings: {
    ttlMs: TTL.standings,
    realtime: false,
    refresh: 'Puan tablosu maç günlerinde değişebilir, saatlik yenileme yeterli.',
  },
  h2h: {
    ttlMs: TTL.h2h,
    realtime: false,
    refresh: 'Yakın geçmiş karşılaşmalar sık değişmez; finished maçlarda historical kullanılır.',
  },
  historical: {
    ttlMs: TTL.historical,
    realtime: false,
    refresh: 'Tarihsel veri uzun süre sabit kabul edilir.',
  },
  weather: {
    ttlMs: TTL.weather,
    realtime: false,
    refresh: 'Hava durumu maç saatine yaklaştıkça değişebilir; kısa-orta TTL.',
  },
  odds: {
    ttlMs: TTL.odds,
    realtime: false,
    refresh: 'Oranlar maç öncesi oynak olabilir; kısa TTL ve frontend son-görülen oran cache’i birlikte kullanılır.',
  },
  team: {
    ttlMs: TTL.team,
    realtime: false,
    refresh: 'Takım profili, kadro ve statik metadata günlük tutulabilir.',
  },
  teamStats: {
    ttlMs: TTL.teamStats,
    realtime: false,
    refresh: 'Takım form/istatistik verisi günlük yenileme için uygundur.',
  },
  seasonFixtures: {
    ttlMs: TTL.seasonFixtures,
    realtime: false,
    refresh: 'Sezon fikstürü düşük değişim hızına sahiptir.',
  },
  topscorers: {
    ttlMs: TTL.topscorers,
    realtime: false,
    refresh: 'Gol krallığı maçlardan sonra değişebilir; saatlik yenileme yeterli.',
  },
};

function getCachePolicy() {
  return JSON.parse(JSON.stringify(CACHE_POLICY));
}

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
  const stats = {
    hitCount: 0,
    missCount: 0,
    staleHitCount: 0,
    staleMissCount: 0,
    setCount: 0,
    dedupeStartedCount: 0,
    dedupeSharedCount: 0,
    byPrefix: {},
  };

  function cachePrefix(key) {
    return String(key || 'unknown').split('_').slice(0, 2).join('_') || 'unknown';
  }

  function ensurePrefixStats(key) {
    const prefix = cachePrefix(key);
    if (!stats.byPrefix[prefix]) {
      stats.byPrefix[prefix] = {
        hits: 0,
        misses: 0,
        staleHits: 0,
        staleMisses: 0,
        sets: 0,
        dedupeStarted: 0,
        dedupeShared: 0,
      };
    }
    return stats.byPrefix[prefix];
  }

  function record(key, field) {
    const row = ensurePrefixStats(key);
    row[field] += 1;
  }

  async function dedupe(key, fn) {
    if (inFlightRequests.has(key)) {
      stats.dedupeSharedCount += 1;
      record(key, 'dedupeShared');
      return inFlightRequests.get(key);
    }
    stats.dedupeStartedCount += 1;
    record(key, 'dedupeStarted');
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
        if (doc) {
          stats.hitCount += 1;
          record(key, 'hits');
          return doc.data;
        }
      } catch {}
    }
    const item = memCache[key];
    if (!item) {
      stats.missCount += 1;
      record(key, 'misses');
      return null;
    }
    if (Date.now() > item.expiresAt) {
      stats.missCount += 1;
      record(key, 'misses');
      return null;
    }
    stats.hitCount += 1;
    record(key, 'hits');
    return item.data;
  }

  async function getStaleCache(key) {
    if (isMongoConnected()) {
      try {
        const doc = await CacheModel.findOne({ key }).sort({ expiresAt: -1 });
        if (doc) {
          stats.staleHitCount += 1;
          record(key, 'staleHits');
          return doc.data;
        }
      } catch {}
    }
    if (memCache[key]?.data) {
      stats.staleHitCount += 1;
      record(key, 'staleHits');
      return memCache[key].data;
    }
    stats.staleMissCount += 1;
    record(key, 'staleMisses');
    return null;
  }

  async function setCache(key, data, ttlMs) {
    const expiresAt = new Date(Date.now() + ttlMs);
    if (isMongoConnected()) {
      try {
        await CacheModel.findOneAndUpdate({ key }, { data, expiresAt }, { upsert: true, new: true });
        stats.setCount += 1;
        record(key, 'sets');
        return;
      } catch {}
    }
    memCache[key] = { data, expiresAt: Date.now() + ttlMs };
    stats.setCount += 1;
    record(key, 'sets');
  }

  function getStats() {
    return {
      hitCount: stats.hitCount,
      missCount: stats.missCount,
      staleHitCount: stats.staleHitCount,
      staleMissCount: stats.staleMissCount,
      setCount: stats.setCount,
      dedupeStartedCount: stats.dedupeStartedCount,
      dedupeSharedCount: stats.dedupeSharedCount,
      inFlightCount: inFlightRequests.size,
      byPrefix: Object.fromEntries(
        Object.entries(stats.byPrefix).map(([prefix, value]) => [prefix, { ...value }])
      ),
    };
  }

  return { dedupe, getCache, getStaleCache, setCache, getStats };
}

module.exports = {
  CACHE_POLICY,
  TTL,
  createCache,
  getCachePolicy,
  isLiveStatus,
  ttlForMatchDate,
};
