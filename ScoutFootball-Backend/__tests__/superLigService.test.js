const { createSuperLigService } = require('../services/superLigService');

function createMemoryCache() {
  const store = new Map();
  return {
    async getCache(key) {
      return store.get(key) || null;
    },
    async setCache(key, value) {
      store.set(key, value);
    },
    store,
  };
}

function createService(fetchJsonImpl) {
  const cache = createMemoryCache();
  return createSuperLigService({
    upstream: { fetchJson: jest.fn(fetchJsonImpl) },
    getCache: cache.getCache,
    setCache: cache.setCache,
    dedupe: async (_key, fn) => fn(),
    TTL: {
      teamStats: 60_000,
      standings: 60_000,
      seasonFixtures: 60_000,
      historical: 60_000,
    },
    ttlForMatchDate: () => 60_000,
    isLiveStatus: () => false,
    sportsDbBase: 'https://sportsdb.example',
    slLeagueId: '4339',
    currentSportsDbSeason: '2025-2026',
    allSportsBase: '',
    allSportsKey: '',
  });
}

function buildEspnFinishedEvent({
  id,
  date,
  homeId,
  awayId,
  homeName,
  awayName,
  homeScore,
  awayScore,
}) {
  return {
    id: String(id),
    date: `${date}T17:00:00Z`,
    competitions: [{
      status: { type: { completed: true } },
      competitors: [
        {
          homeAway: 'home',
          score: String(homeScore),
          team: { id: String(homeId), displayName: homeName },
        },
        {
          homeAway: 'away',
          score: String(awayScore),
          team: { id: String(awayId), displayName: awayName },
        },
      ],
    }],
  };
}

describe('superLigService', () => {
  test('fetchTeamContext keeps espn source when full schedule data exists', async () => {
    const service = createService(async url => {
      if (url.includes('/teams/432/schedule')) {
        return {
          events: [
            buildEspnFinishedEvent({
              id: 1,
              date: '2026-04-01',
              homeId: 432,
              awayId: 436,
              homeName: 'Galatasaray',
              awayName: 'Fenerbahce',
              homeScore: 2,
              awayScore: 1,
            }),
            buildEspnFinishedEvent({
              id: 2,
              date: '2026-04-08',
              homeId: 997,
              awayId: 432,
              homeName: 'Trabzonspor',
              awayName: 'Galatasaray',
              homeScore: 0,
              awayScore: 3,
            }),
            buildEspnFinishedEvent({
              id: 3,
              date: '2026-04-15',
              homeId: 432,
              awayId: 1895,
              homeName: 'Galatasaray',
              awayName: 'Besiktas',
              homeScore: 1,
              awayScore: 1,
            }),
            buildEspnFinishedEvent({
              id: 4,
              date: '2026-04-22',
              homeId: 7914,
              awayId: 432,
              homeName: 'Istanbul Basaksehir',
              awayName: 'Galatasaray',
              homeScore: 1,
              awayScore: 2,
            }),
            buildEspnFinishedEvent({
              id: 5,
              date: '2026-04-29',
              homeId: 432,
              awayId: 789,
              homeName: 'Galatasaray',
              awayName: 'Goztepe',
              homeScore: 4,
              awayScore: 0,
            }),
          ],
        };
      }

      if (url.includes('/standings')) {
        return {
          children: [{
            standings: {
              entries: [{
                team: { displayName: 'Galatasaray' },
                stats: [
                  { name: 'rank', value: 1 },
                  { name: 'gamesPlayed', value: 31 },
                  { name: 'wins', value: 25 },
                  { name: 'ties', value: 4 },
                  { name: 'losses', value: 2 },
                  { name: 'pointsFor', value: 78 },
                  { name: 'pointsAgainst', value: 25 },
                  { name: 'points', value: 79 },
                ],
              }],
            },
          }],
        };
      }

      throw new Error(`unexpected url: ${url}`);
    });

    const context = await service.fetchTeamContext(133804);

    expect(context).toMatchObject({
      teamId: 133804,
      source: 'espn',
      isLimited: false,
      formMatchesCount: 5,
      standingsStats: expect.objectContaining({ teamId: 133804, team: 'Galatasaray' }),
    });
    expect(context.recentMatches).toHaveLength(5);
    expect(context.recentMatches.every(match => match.source === 'espn')).toBe(true);
  });

  test('fetchTeamContext falls back to mixed when match list stays below threshold', async () => {
    const service = createService(async url => {
      if (url.includes('/teams/432/schedule')) {
        return { events: [] };
      }

      if (url.includes('/standings')) {
        return {
          children: [{
            standings: {
              entries: [{
                team: { displayName: 'Galatasaray' },
                stats: [
                  { name: 'rank', value: 1 },
                  { name: 'gamesPlayed', value: 31 },
                  { name: 'wins', value: 25 },
                  { name: 'ties', value: 4 },
                  { name: 'losses', value: 2 },
                  { name: 'pointsFor', value: 78 },
                  { name: 'pointsAgainst', value: 25 },
                  { name: 'points', value: 79 },
                ],
              }],
            },
          }],
        };
      }

      if (url.includes('eventsseason.php')) {
        return {
          events: [
            {
              idHomeTeam: '133804',
              idAwayTeam: '133807',
              intHomeScore: '2',
              intAwayScore: '1',
              dateEvent: '2026-04-01',
              strHomeTeam: 'Galatasaray',
              strAwayTeam: 'Fenerbahce',
            },
            {
              idHomeTeam: '133796',
              idAwayTeam: '133804',
              intHomeScore: '0',
              intAwayScore: '1',
              dateEvent: '2026-04-08',
              strHomeTeam: 'Trabzonspor',
              strAwayTeam: 'Galatasaray',
            },
          ],
        };
      }

      throw new Error(`unexpected url: ${url}`);
    });

    const context = await service.fetchTeamContext(133804);

    expect(context).toMatchObject({
      teamId: 133804,
      source: 'mixed',
      isLimited: true,
      formMatchesCount: 2,
      fallbackReason: expect.any(String),
      standingsStats: expect.objectContaining({ teamId: 133804, team: 'Galatasaray' }),
    });
    expect(context.recentMatches).toHaveLength(2);
  });
});
