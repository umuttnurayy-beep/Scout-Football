jest.mock('../services/config', () => ({
  API_BASE_URL: 'https://example.test',
}));

jest.mock('../constants/seasons', () => ({
  CURRENT_FOOTBALL_SEASON: 2025,
  DISPLAY_FOOTBALL_SEASON: '2025/26',
  CURRENT_SPORTSDB_SEASON: '2025-2026',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import { getHomeData } from '../services/api';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(payload: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(payload),
  } as Response);
}

describe('getHomeData', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('normalizes nested standings and next preview payloads', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      date: '2026-05-02',
      matches: [{ id: 1 }],
      superLigMatches: [],
      standings: {
        2021: [
          { team: 'Arsenal', pos: 1, played: 35, pts: 82 },
          { team: 'Broken', pos: '2', played: 35, pts: 80 },
        ],
        nope: [{ team: 'Ignored', pos: 1, played: 1, pts: 3 }],
      },
      nextPreview: {
        date: '2026-05-03',
        matches: [],
        superLigMatches: [{ id: 2 }],
        featuredMatchId: 12,
        source: 'cache',
      },
      generatedAt: '2026-05-02T10:00:00Z',
    }));

    const data = await getHomeData('2026-05-02');

    expect(data?.standings[2021]).toHaveLength(1);
    expect(data?.standings[2021][0].team).toBe('Arsenal');
    expect(data?.standings[Number('nope')]).toBeUndefined();
    expect(data?.nextPreview?.source).toBe('cache');
    expect(data?.nextPreview?.featuredMatchId).toBe(12);
  });

  it('rejects malformed home payloads and drops malformed next preview', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      date: '2026-05-02',
      matches: [],
      superLigMatches: [],
      standings: [],
      nextPreview: {
        date: '2026-05-03',
        matches: null,
        superLigMatches: [],
      },
    }));

    const data = await getHomeData('2026-05-02');

    expect(data?.standings).toEqual({});
    expect(data?.nextPreview).toBeNull();

    fetchMock.mockResolvedValue(jsonResponse({ matches: null, superLigMatches: [] }));
    await expect(getHomeData('2026-05-02')).resolves.toBeNull();
  });
});
