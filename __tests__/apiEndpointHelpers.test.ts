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

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMatchContext,
  getOdds,
  getSuperLigMatchContext,
  getSuperLigMatches,
  getSuperLigPlayers,
  getSuperLigTeamContext,
  getWeather,
} from '../services/api';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(payload: unknown, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  } as Response);
}

describe('API endpoint helper fallbacks and normalization', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset();
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('normalizes match context arrays and appends finished query when requested', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      match: { id: 44 },
      homeForm: [{ id: 1 }],
      awayForm: null,
      h2h: [{ id: 2 }],
      issues: 'not-an-array',
      generatedAt: '2026-05-03T10:00:00Z',
    }));

    const data = await getMatchContext('44', true);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/match/44/context?finished=1',
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(data).toMatchObject({
      match: { id: 44 },
      homeForm: [{ id: 1 }],
      awayForm: [],
      h2h: [{ id: 2 }],
      issues: [],
    });
  });

  it('returns null for malformed match context and request failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ match: null, homeForm: [], awayForm: [], h2h: [] }));
    await expect(getMatchContext('44')).resolves.toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(getMatchContext('44')).resolves.toBeNull();
  });

  it('encodes weather city names and falls back to null on failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ city: 'İstanbul', temp: 18 }));
    await expect(getWeather('İstanbul City')).resolves.toEqual({ city: 'İstanbul', temp: 18 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/weather?city=%C4%B0stanbul%20City',
      expect.objectContaining({ signal: expect.any(Object) })
    );

    fetchMock.mockRejectedValueOnce(new Error('weather down'));
    await expect(getWeather('İstanbul')).resolves.toBeNull();
  });

  it('uses cached odds when fresh and avoids network requests', async () => {
    const odds = { home: '1.90', draw: '3.20', away: '4.10' };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ odds, ts: Date.now() }));

    await expect(getOdds('Arsenal', 'Chelsea', 2021)).resolves.toEqual(odds);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores malformed and expired odds cache entries before fetching fresh odds', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify({
      odds: { home: 1.9, away: '4.10' },
      ts: Date.now(),
    }));
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await expect(getOdds('Arsenal', 'Chelsea', 2021)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/odds?sport=soccer_epl',
      expect.objectContaining({ signal: expect.any(Object) })
    );

    fetchMock.mockReset();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify({
      odds: { home: '1.90', draw: '3.20', away: '4.10' },
      ts: Date.now() - (31 * 60 * 1000),
    }));
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await expect(getOdds('Arsenal', 'Chelsea', 2021)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('selects best h2h odds, caches them, and returns null when sport is unsupported', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    fetchMock.mockResolvedValue(jsonResponse([
      {
        home_team: 'Arsenal',
        away_team: 'Chelsea',
        bookmakers: [
          { markets: [{ key: 'h2h', outcomes: [
            { name: 'Arsenal', price: 1.8 },
            { name: 'Draw', price: 3.1 },
            { name: 'Chelsea', price: 4.0 },
          ] }] },
          { markets: [{ key: 'h2h', outcomes: [
            { name: 'Arsenal', price: 1.95 },
            { name: 'Draw', price: 3.4 },
            { name: 'Chelsea', price: 3.8 },
          ] }] },
        ],
      },
    ]));

    await expect(getOdds('Arsenal', 'Chelsea', 2021)).resolves.toEqual({
      home: '1.95',
      draw: '3.40',
      away: '4.00',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/odds?sport=soccer_epl',
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      expect.stringContaining('odds_match_2021_Arsenal_Chelsea'),
      expect.stringContaining('"home":"1.95"')
    );

    await expect(getOdds('Arsenal', 'Chelsea', 9999)).resolves.toBeNull();
  });

  it('normalizes Super Lig list helpers and returns safe fallbacks', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 1 }, null]));
    await expect(getSuperLigMatches('2026-05-03')).resolves.toEqual([{ id: 1 }, null]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/superlig/matches?date=2026-05-03',
      expect.objectContaining({ signal: expect.any(Object) })
    );

    fetchMock.mockRejectedValueOnce(new Error('players down'));
    await expect(getSuperLigPlayers(133804)).resolves.toEqual([]);
  });

  it('returns Super Lig team context payloads or null on failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      teamId: 133804,
      source: 'mixed',
      isLimited: true,
      fallbackReason: 'standings',
      formMatchesCount: 0,
      recentMatches: [],
      standingsStats: null,
    }));
    await expect(getSuperLigTeamContext(133804)).resolves.toMatchObject({
      teamId: 133804,
      isLimited: true,
    });

    fetchMock.mockRejectedValueOnce(new Error('context down'));
    await expect(getSuperLigTeamContext(133804)).resolves.toBeNull();
  });

  it('builds Super Lig match context query params and normalizes optional arrays', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      event: { idEvent: 'abc' },
      homeContext: null,
      awayContext: null,
      h2h: null,
      issues: 'bad',
    }));

    const data = await getSuperLigMatchContext({
      eventId: 'abc',
      homeTeamId: 1,
      awayTeamId: 2,
      home: 'Galatasaray',
      away: 'Fenerbahçe',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/superlig/match/abc/context?homeTeamId=1&awayTeamId=2&home=Galatasaray&away=Fenerbah%C3%A7e',
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(data).toMatchObject({ event: { idEvent: 'abc' }, h2h: [], issues: [] });
  });
});
