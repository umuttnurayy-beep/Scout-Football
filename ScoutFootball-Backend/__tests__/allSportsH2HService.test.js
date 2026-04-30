const {
  allSportsTeamQueries,
  createAllSportsH2HService,
  normalizeTeamLookupName,
} = require('../services/allSportsH2HService');
const { TTL } = require('../utils/cache');

function createService(overrides = {}) {
  const cache = new Map();
  const upstream = {
    fetchJson: jest.fn(async url => {
      const target = String(url);
      if (target.includes('met=Teams')) {
        if (target.includes('Unknown')) return { result: [] };
        return { result: [{ team_key: target.includes('Fenerbahce') ? '20' : '10', team_name: 'Team' }] };
      }
      if (target.includes('met=H2H')) {
        return {
          result: {
            H2H: [
              {
                event_status: 'Finished',
                event_final_result: '2 - 1',
                event_date: '2026-04-01',
                event_home_team: 'Galatasaray',
                event_away_team: 'Fenerbahce',
                league_name: 'Super Lig',
                home_team_key: '10',
              },
              {
                event_status: 'Scheduled',
                event_final_result: '',
              },
            ],
          },
        };
      }
      return {};
    }),
  };
  const service = createAllSportsH2HService({
    allSportsBase: 'https://allsports.example',
    allSportsKey: overrides.allSportsKey ?? 'key',
    dedupe: async (_key, fn) => fn(),
    getCache: async key => cache.get(key) || null,
    setCache: async (key, value) => cache.set(key, value),
    TTL,
    upstream,
  });
  return { cache, service, upstream };
}

describe('allSportsH2HService', () => {
  test('normalizes Turkish team names for lookup aliases', () => {
    expect(normalizeTeamLookupName('Çaykur Rizespor')).toBe('caykurrizespor');
    expect(allSportsTeamQueries('Besiktas')).toEqual(['Besiktas', 'Besiktas JK']);
    expect(allSportsTeamQueries('Fenerbahçe')).toEqual(['Fenerbahçe', 'Fenerbahce', 'Fenerbahce SK']);
  });

  test('fetchAllSportsH2HMatches maps finished H2H matches', async () => {
    const { service, upstream } = createService();

    const result = await service.fetchAllSportsH2HMatches('Galatasaray', 'Fenerbahce');

    expect(result).toEqual([{
      date: '2026-04-01',
      home: 'Galatasaray',
      away: 'Fenerbahce',
      homeScore: 2,
      awayScore: 1,
      league: 'Super Lig',
      team1Home: true,
    }]);
    expect(upstream.fetchJson).toHaveBeenCalledTimes(3);
  });

  test('fetchAllSportsH2HMatches returns empty when a team is not found', async () => {
    const { service } = createService();

    const result = await service.fetchAllSportsH2HMatches('Unknown', 'Fenerbahce');

    expect(result).toEqual([]);
  });

  test('fetchAllSportsH2HMatches rejects when API key is missing', async () => {
    const { service } = createService({ allSportsKey: '' });

    await expect(service.fetchAllSportsH2HMatches('Galatasaray', 'Fenerbahce'))
      .rejects
      .toThrow('ALLSPORTS_KEY missing');
  });
});
