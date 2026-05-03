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

import { getHomeData, getStandings, getUclKnockouts } from '../services/api';
import { clearLastApiError, getLastApiError } from '../services/apiResponse';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(payload: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(payload),
  } as Response);
}

describe('getHomeData', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset();
    clearLastApiError();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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

  it('preserves envelope stale metadata and source warning severity', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      ok: true,
      stale: true,
      warning: { code: 'partial' },
      data: {
        date: '2026-05-02',
        matches: [{ id: 1 }],
        superLigMatches: [],
        standings: {},
        sourceWarnings: ['football-data unavailable'],
        sourceSeverity: 'warning',
        generatedAt: '2026-05-02T10:00:00Z',
      },
    }));

    const data = await getHomeData('2026-05-02');

    expect(data).toMatchObject({
      stale: true,
      sourceWarnings: ['football-data unavailable'],
      sourceSeverity: 'warning',
      nextPreview: null,
    });
  });

  it('returns null and records structured error info for envelope and JSON failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ok: false,
      error: { code: 'home_source_down', message: 'source failed' },
    }));

    await expect(getHomeData('2026-05-02')).resolves.toBeNull();
    expect(getLastApiError()).toMatchObject({
      scope: 'getHomeData',
      code: 'home_source_down',
      message: 'source failed',
    });

    clearLastApiError();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    } as unknown as Response);

    await expect(getHomeData('2026-05-02')).resolves.toBeNull();
    expect(getLastApiError()).toMatchObject({
      scope: 'getHomeData',
      code: 'client_error',
      message: 'invalid json',
    });
  });
});

describe('standings and knockouts API helpers', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('normalizes standings rows and treats malformed rows as empty data', async () => {
    fetchMock.mockResolvedValue(jsonResponse([
      { team: 'Liverpool', pos: 1, played: 35, pts: 82 },
      { team: 'Broken', pos: '2', played: 35, pts: 80 },
      null,
    ]));

    const data = await getStandings(39);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/standings/2021',
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(data).toEqual([{ team: 'Liverpool', pos: 1, played: 35, pts: 82 }]);
  });

  it('returns safe fallbacks when standings or knockouts requests fail', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(getStandings(2021)).resolves.toEqual([]);

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(getUclKnockouts(2025)).resolves.toBeNull();
  });

  it('keeps empty knockout payloads distinct from load failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      roundOf16: [],
      quarterFinals: [{ id: 7, homeTeam: 'A', awayTeam: 'B' }],
    }));

    const data = await getUclKnockouts(2025);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/ucl/knockouts?season=2025',
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(data).toEqual({
      roundOf16: [],
      quarterFinals: [{ id: 7, homeTeam: 'A', awayTeam: 'B' }],
    });
  });
});
