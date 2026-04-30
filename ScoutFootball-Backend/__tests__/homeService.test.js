const { createHomeService } = require('../services/homeService');

function fdMatch(id, leagueId = 2021, home = `Home ${id}`, away = `Away ${id}`, status = 'TIMED') {
  return {
    id,
    competition: { id: leagueId },
    utcDate: '2026-05-01T20:00:00Z',
    status,
    homeTeam: { name: home, shortName: home },
    awayTeam: { name: away, shortName: away },
  };
}

function slMatch(id, home = `SL Home ${id}`, away = `SL Away ${id}`) {
  return {
    id,
    home,
    away,
    time: '20:00:00',
    status: 'Scheduled',
    homeScore: null,
  };
}

function createMemoryCache(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    async getCache(key) {
      return store.get(key) || null;
    },
    async getStaleCache(key) {
      return store.get(key) || null;
    },
    async setCache(key, value) {
      store.set(key, value);
    },
    store,
  };
}

function createService(overrides = {}) {
  const cache = overrides.cache || createMemoryCache();
  const calls = {
    fd: [],
    sl: [],
    standings: [],
    slStandings: 0,
  };
  const service = createHomeService({
    dedupe: async (_key, fn) => fn(),
    getCache: cache.getCache,
    getStaleCache: cache.getStaleCache,
    setCache: cache.setCache,
    fetchFootballDataMatchesForDate: overrides.fetchFootballDataMatchesForDate || (async date => {
      calls.fd.push(date);
      if (overrides.fdError) throw new Error('fd failed');
      return overrides.fdByDate?.[date] || [];
    }),
    fetchSuperLigMatchesForDate: overrides.fetchSuperLigMatchesForDate || (async date => {
      calls.sl.push(date);
      if (overrides.slError) throw new Error('sl failed');
      return overrides.slByDate?.[date] || [];
    }),
    fetchSuperLigStandingsCached: overrides.fetchSuperLigStandingsCached || (async () => {
      calls.slStandings += 1;
      return [{ team: 'SL Home 3', pos: 1, played: 10, pts: 22 }];
    }),
    fetchStandingsForLeague: overrides.fetchStandingsForLeague || (async leagueId => {
      calls.standings.push(leagueId);
      return [{ team: `Team ${leagueId}`, pos: 1, played: 10, pts: 22 }];
    }),
    hasMatchTeamNames: match => Boolean(match.homeTeam?.name && match.awayTeam?.name),
    isLiveStatus: status => ['IN_PLAY', 'PAUSED'].includes(String(status || '').toUpperCase()),
    ttlForMatchDate: () => 60000,
    logger: { error: jest.fn() },
  });
  return { service, calls, cache };
}

describe('homeService', () => {
  test('does not look ahead on multi-match days and sets a stable featured match', async () => {
    const { service, calls } = createService({
      fdByDate: {
        '2026-05-01': [
          fdMatch(1, 2021, 'Leeds', 'Burnley'),
          fdMatch(2, 2014, 'Girona', 'Mallorca'),
        ],
      },
    });

    const res = await service.buildHome('2026-05-01');

    expect(res.ok).toBe(true);
    expect(res.data.nextPreview).toBeNull();
    expect(res.data.featuredMatchId).toBe(1);
    expect(calls.fd).toEqual(['2026-05-01']);
    expect(calls.sl).toEqual(['2026-05-01']);
    expect(calls.standings.sort()).toEqual([2014, 2021]);
  });

  test('filters unsupported football-data leagues out of the home payload', async () => {
    const { service } = createService({
      fdByDate: {
        '2026-05-01': [
          fdMatch(1, 2021, 'Leeds', 'Burnley'),
          fdMatch(99, 2152, 'Corinthians', 'Penarol'),
        ],
      },
    });

    const res = await service.buildHome('2026-05-01');

    expect(res.ok).toBe(true);
    expect(res.data.matches).toHaveLength(1);
    expect(res.data.matches[0].id).toBe(1);
    expect(res.data.featuredMatchId).toBe(1);
  });

  test('looks ahead on single-match days and returns nextPreview', async () => {
    const { service, calls } = createService({
      fdByDate: {
        '2026-05-01': [fdMatch(1, 2021, 'Leeds', 'Burnley')],
        '2026-05-02': [],
        '2026-05-03': [fdMatch(3, 2001, 'PSG', 'Bayern')],
      },
    });

    const res = await service.buildHome('2026-05-01');

    expect(res.ok).toBe(true);
    expect(res.data.nextPreview).toMatchObject({ date: '2026-05-03' });
    expect(res.data.nextPreview.matches).toHaveLength(1);
    expect(calls.fd).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
  });

  test('returns stale last-good payload when upstreams fail', async () => {
    const stalePayload = {
      date: '2026-05-01',
      matches: [fdMatch(9)],
      superLigMatches: [],
      standings: {},
      featuredMatchId: 9,
      nextPreview: null,
      generatedAt: '2026-05-01T00:00:00.000Z',
    };
    const cache = createMemoryCache({
      'home_last_good_v2_2026-05-01': stalePayload,
    });
    const { service } = createService({
      cache,
      fdError: true,
      slError: true,
    });

    const res = await service.buildHome('2026-05-01');

    expect(res).toMatchObject({
      ok: true,
      stale: true,
      data: stalePayload,
    });
  });

  test('returns issues and sourceWarnings when partial upstream data fails', async () => {
    const { service } = createService({
      fdError: true,
      slByDate: {
        '2026-05-01': [slMatch(20301, 'Galatasaray', 'Besiktas')],
      },
    });

    const res = await service.buildHome('2026-05-01');

    expect(res.ok).toBe(true);
    expect(res.stale).toBeUndefined();
    expect(res.data.matches).toEqual([]);
    expect(res.data.superLigMatches).toHaveLength(1);
    expect(res.data.issues).toContain('matches');
    expect(res.data.sourceWarnings).toContain('Main match feed failed for the selected day.');
  });

  test('returns standings issue when standings fetch fails but payload still exists', async () => {
    const { service } = createService({
      fdByDate: {
        '2026-05-01': [fdMatch(1, 2021, 'Leeds', 'Burnley')],
      },
      fetchStandingsForLeague: async () => {
        throw new Error('standings down');
      },
    });

    const res = await service.buildHome('2026-05-01');

    expect(res.ok).toBe(true);
    expect(res.data.matches).toHaveLength(1);
    expect(res.data.issues).toContain('standings:2021');
    expect(res.data.sourceWarnings).toContain('Standings fetch failed for league 2021.');
  });
});
