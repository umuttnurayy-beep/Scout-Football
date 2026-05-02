jest.mock('../services/api', () => ({
  getCityForTeam: jest.fn(() => null),
}));

jest.mock('../utils/matchAnalysis', () => ({
  strHash: jest.fn(() => 42),
}));

import {
  normalizeTeam,
  findStanding,
  computeMetrics,
  buildMatchSummary,
  buildDaySummary,
  scoutScore,
  marqueeBonus,
  favoriteText,
  hasUsableStandingsMap,
  timeToMins,
  NO_DATA,
  type Match,
  type Metrics,
} from '../utils/matchMetrics';

// ─── test helpers ─────────────────────────────────────────────────────────────

type StandingShape = {
  pos: number; teamId: number; team: string;
  played: number; win: number; draw: number; loss: number;
  gf: number; ga: number; pts: number;
};

function makeStanding(overrides: Partial<StandingShape> = {}): StandingShape {
  return {
    pos: 1, teamId: 100, team: 'Test FC',
    played: 20, win: 12, draw: 3, loss: 5,
    gf: 35, ga: 18, pts: 39,
    ...overrides,
  };
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 1, leagueApiId: 2021, league: 'Premier Lig',
    home: 'Arsenal', away: 'Liverpool',
    time: '15:00', score: null, finished: true,
    city: null, utcDate: '2026-05-01T14:00:00Z',
    homeTeamId: 57, awayTeamId: 64,
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    ...NO_DATA,
    hasData: true,
    expectedGoals: 2.5,
    leagueAvg: 2.5,
    homePpg: 1.8,
    awayPpg: 1.5,
    diff: 0.3,
    favorite: 'home',
    confidence: 'medium',
    tempo: 2.5,
    summary: '',
    ...overrides,
  };
}

// ─── timeToMins ───────────────────────────────────────────────────────────────

describe('timeToMins', () => {
  test('converts HH:MM to total minutes', () => {
    expect(timeToMins('20:00')).toBe(1200);
    expect(timeToMins('09:30')).toBe(570);
    expect(timeToMins('00:00')).toBe(0);
    expect(timeToMins('21:45')).toBe(1305);
  });

  test('returns 0 for invalid input', () => {
    expect(timeToMins('20')).toBe(0);
    expect(timeToMins('')).toBe(0);
  });
});

// ─── normalizeTeam ────────────────────────────────────────────────────────────

describe('normalizeTeam', () => {
  test('lowercases and trims', () => {
    expect(normalizeTeam('Arsenal')).toBe('arsenal');
    expect(normalizeTeam('  Liverpool  ')).toBe('liverpool');
  });

  test('converts Turkish characters', () => {
    expect(normalizeTeam('Çaykur Rizespor')).toBe('caykur rizespor');
    expect(normalizeTeam('Beşiktaş')).toBe('besiktas');
    expect(normalizeTeam('Eyüpspor')).toBe('eyupspor');
    expect(normalizeTeam('Galatasaray')).toBe('galatasaray');
    // Note: capital 'İ' (U+0130) after toLowerCase() becomes 'i̇' (two chars),
    // so the regex does not collapse it — only lowercase 'ı' is reliably mapped.
    expect(normalizeTeam('ıstanbul')).toBe('istanbul');
    expect(normalizeTeam('ğşçüö')).toBe('gscuo');
  });

  test('converts European accented characters', () => {
    expect(normalizeTeam('Bayern München')).toBe('bayern munchen');
    expect(normalizeTeam('Borussia Dortmund')).toBe('borussia dortmund');
    expect(normalizeTeam('Atlético Madrid')).toBe('atletico madrid');
    expect(normalizeTeam('Paris Saint-Germain')).toBe('paris saint-germain');
  });

  test('collapses multiple spaces', () => {
    expect(normalizeTeam('Manchester  City')).toBe('manchester city');
  });

  test('returns empty string for empty input', () => {
    expect(normalizeTeam('')).toBe('');
  });
});

// ─── findStanding ─────────────────────────────────────────────────────────────

describe('findStanding', () => {
  const standings = [
    makeStanding({ pos: 1, teamId: 57,  team: 'Arsenal',             played: 30, gf: 70, ga: 25, pts: 70 }),
    makeStanding({ pos: 2, teamId: 64,  team: 'Liverpool',           played: 30, gf: 60, ga: 30, pts: 60 }),
    makeStanding({ pos: 3, teamId: 65,  team: 'Internazionale',      played: 30, gf: 50, ga: 22, pts: 58 }),
    makeStanding({ pos: 4, teamId: 0,   team: 'Paris Saint-Germain', played: 30, gf: 45, ga: 28, pts: 55 }),
    makeStanding({ pos: 5, teamId: 0,   team: 'Newcastle United',    played: 30, gf: 40, ga: 30, pts: 50 }),
    makeStanding({ pos: 6, teamId: 81,  team: 'Barcelona',           played: 30, gf: 65, ga: 28, pts: 62 }),
  ];

  test('returns null for empty standings', () => {
    expect(findStanding([], 'Arsenal', 57)).toBeNull();
  });

  test('returns null for undefined standings', () => {
    expect(findStanding(undefined, 'Arsenal', 57)).toBeNull();
  });

  test('finds by teamId (takes priority)', () => {
    const r = findStanding(standings, 'Arsenal', 57);
    expect(r?.team).toBe('Arsenal');
  });

  test('skips teamId lookup when teamId = 0, falls back to name', () => {
    const r = findStanding(standings, 'Paris Saint-Germain', 0);
    expect(r?.team).toBe('Paris Saint-Germain');
  });

  test('finds by alias: "Paris SG" → "Paris Saint-Germain"', () => {
    expect(findStanding(standings, 'Paris SG', 0)?.team).toBe('Paris Saint-Germain');
  });

  test('finds by alias: "Inter" → "Internazionale"', () => {
    expect(findStanding(standings, 'Inter', 0)?.team).toBe('Internazionale');
  });

  test('finds by partial match: "Newcastle" → "Newcastle United"', () => {
    expect(findStanding(standings, 'Newcastle', 0)?.team).toBe('Newcastle United');
  });

  test('returns null when team not found', () => {
    expect(findStanding(standings, 'Tottenham', 999)).toBeNull();
  });

  test('returns correct row when teamId matches (even if name differs)', () => {
    const r = findStanding(standings, 'Barca', 81);
    expect(r?.team).toBe('Barcelona');
  });
});

// ─── computeMetrics ───────────────────────────────────────────────────────────

describe('computeMetrics', () => {
  const home = makeStanding({ pos: 1, teamId: 57, team: 'Arsenal',   played: 30, win: 22, draw: 4, loss: 4, gf: 70, ga: 25, pts: 70 });
  const away = makeStanding({ pos: 5, teamId: 64, team: 'Liverpool', played: 30, win: 15, draw: 6, loss: 9, gf: 55, ga: 35, pts: 51 });
  const standings = [home, away];

  test('returns no-data when home is null', () => {
    const r = computeMetrics(null, away as any);
    expect(r.hasData).toBe(false);
    expect(r.reason).toBe('Takım tablo satırı eşleşmedi');
  });

  test('returns no-data when away is null', () => {
    const r = computeMetrics(home as any, null);
    expect(r.hasData).toBe(false);
    expect(r.reason).toBe('Takım tablo satırı eşleşmedi');
  });

  test('returns early-season reason when home played < MIN_PLAYED (3)', () => {
    const early = makeStanding({ ...home, played: 2 });
    const r = computeMetrics(early as any, away as any);
    expect(r.hasData).toBe(false);
    expect(r.reason).toBe('Erken sezon — yeterli veri yok');
  });

  test('returns early-season reason when away played < MIN_PLAYED', () => {
    const early = makeStanding({ ...away, played: 1 });
    const r = computeMetrics(home as any, early as any);
    expect(r.hasData).toBe(false);
    expect(r.reason).toContain('Erken sezon');
  });

  test('returns full metrics with hasData=true for adequate data', () => {
    const r = computeMetrics(home as any, away as any, standings as any);
    expect(r.hasData).toBe(true);
    expect(r.expectedGoals).toBeGreaterThan(0);
    expect(r.homePpg).toBeCloseTo(70 / 30, 1);
    expect(r.awayPpg).toBeCloseTo(51 / 30, 1);
    expect(r.homePos).toBe(1);
    expect(r.awayPos).toBe(5);
  });

  test('expectedGoals = (homeAtk*awayDef + awayAtk*homeDef) / leagueAvg', () => {
    const homeAtk = home.gf / home.played;   // 70/30
    const homeDef = home.ga / home.played;   // 25/30
    const awayAtk = away.gf / away.played;   // 55/30
    const awayDef = away.ga / away.played;   // 35/30
    const totalGf = home.gf + away.gf;       // 125
    const totalPlayed = home.played + away.played; // 60
    const leagueAvg = totalGf / totalPlayed; // ~2.083
    const raw = (homeAtk * awayDef + awayAtk * homeDef) / leagueAvg;
    const expected = Math.round(raw * 10) / 10;
    const r = computeMetrics(home as any, away as any, standings as any);
    expect(r.expectedGoals).toBe(expected);
  });

  test('leagueAvg defaults to 1.5 when no standings provided', () => {
    const r = computeMetrics(home as any, away as any);
    expect(r.hasData).toBe(true);
    expect(r.leagueAvg).toBe(1.5);
  });

  test('favorite: home when homePpg − awayPpg > 0.3', () => {
    const strongHome = makeStanding({ ...home, pts: 75, played: 30 }); // ppg 2.5
    const weakAway   = makeStanding({ ...away, pts: 30, played: 30 }); // ppg 1.0
    const r = computeMetrics(strongHome as any, weakAway as any, [strongHome, weakAway] as any);
    expect(r.favorite).toBe('home');
  });

  test('favorite: away when awayPpg − homePpg > 0.3', () => {
    const weakHome   = makeStanding({ ...home, pts: 27, played: 30 }); // ppg 0.9
    const strongAway = makeStanding({ ...away, pts: 75, played: 30 }); // ppg 2.5
    const r = computeMetrics(weakHome as any, strongAway as any, [weakHome, strongAway] as any);
    expect(r.favorite).toBe('away');
  });

  test('favorite: balanced when |diff| <= 0.3', () => {
    const eq1 = makeStanding({ ...home, pts: 50, played: 30 }); // ppg 1.667
    const eq2 = makeStanding({ ...away, pts: 51, played: 30 }); // ppg 1.700
    const r = computeMetrics(eq1 as any, eq2 as any, [eq1, eq2] as any);
    expect(r.favorite).toBe('balanced');
  });

  test('confidence: high when |diff| > 1.0', () => {
    const h = makeStanding({ ...home, pts: 75, played: 30 }); // ppg 2.5
    const a = makeStanding({ ...away, pts: 18, played: 30 }); // ppg 0.6, diff 1.9
    const r = computeMetrics(h as any, a as any, [h, a] as any);
    expect(r.confidence).toBe('high');
  });

  test('confidence: medium when 0.5 < |diff| <= 1.0', () => {
    const h = makeStanding({ ...home, pts: 54, played: 30 }); // ppg 1.8
    const a = makeStanding({ ...away, pts: 33, played: 30 }); // ppg 1.1, diff 0.7
    const r = computeMetrics(h as any, a as any, [h, a] as any);
    expect(r.confidence).toBe('medium');
  });

  test('confidence: low when |diff| <= 0.5', () => {
    const h = makeStanding({ ...home, pts: 50, played: 30 }); // ppg 1.667
    const a = makeStanding({ ...away, pts: 46, played: 30 }); // ppg 1.533, diff 0.133
    const r = computeMetrics(h as any, a as any, [h, a] as any);
    expect(r.confidence).toBe('low');
  });

  test('diff is rounded to 1 decimal', () => {
    const r = computeMetrics(home as any, away as any, standings as any);
    expect(r.diff).toBe(Math.round(r.diff * 10) / 10);
  });

  test('summary is a non-empty string', () => {
    const r = computeMetrics(home as any, away as any, standings as any);
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });
});

// ─── buildMatchSummary ────────────────────────────────────────────────────────

describe('buildMatchSummary', () => {
  const base = {
    expectedGoals: 2.3, favorite: 'home' as const,
    confidence: 'low' as const, tempo: 2.0,
    homePpg: 1.4, awayPpg: 1.2,
  };

  test('returns default text when no strong signal', () => {
    expect(buildMatchSummary(base)).toBe('Takım verilerine göre standart bir maç profili.');
  });

  test('includes "gol çizgisi canlı" for xG >= 3.2', () => {
    expect(buildMatchSummary({ ...base, expectedGoals: 3.5 }).toLowerCase()).toContain('gol çizgisi canlı');
  });

  test('includes "gol beklentisi orta-üst" for 2.5 <= xG < 3.2', () => {
    expect(buildMatchSummary({ ...base, expectedGoals: 2.7 }).toLowerCase()).toContain('gol beklentisi orta-üst');
  });

  test('includes "kontrollü skor profili" for xG < 2.0', () => {
    expect(buildMatchSummary({ ...base, expectedGoals: 1.8 }).toLowerCase()).toContain('kontrollü skor profili');
  });

  test('includes "belirgin bir favori var" for high confidence', () => {
    expect(buildMatchSummary({ ...base, confidence: 'high', expectedGoals: 3.0 }).toLowerCase()).toContain('belirgin bir favori var');
  });

  test('includes "iki güçlü ekip" for balanced + high ppg teams', () => {
    const r = buildMatchSummary({ ...base, favorite: 'balanced', homePpg: 2.0, awayPpg: 1.9, expectedGoals: 3.5 });
    expect(r.toLowerCase()).toContain('iki güçlü ekip dengeli profilde');
  });

  test('includes "iki takım dengeli" for balanced + regular ppg teams', () => {
    const r = buildMatchSummary({ ...base, favorite: 'balanced', homePpg: 1.4, awayPpg: 1.2, expectedGoals: 3.5 });
    expect(r.toLowerCase()).toContain('iki takım dengeli profilde');
  });

  test('includes "tempo sinyali yüksek" for tempo >= 3.0', () => {
    const r = buildMatchSummary({ ...base, expectedGoals: 3.5, tempo: 3.2 });
    expect(r.toLowerCase()).toContain('tempo sinyali yüksek');
  });

  test('capitalizes first letter', () => {
    const r = buildMatchSummary({ ...base, expectedGoals: 3.5 });
    expect(r.charAt(0)).toBe(r.charAt(0).toUpperCase());
    expect(r.charAt(0)).not.toBe(r.charAt(0).toLowerCase());
  });

  test('result ends with a period', () => {
    const r = buildMatchSummary({ ...base, expectedGoals: 3.5 });
    expect(r.endsWith('.')).toBe(true);
  });
});

// ─── buildDaySummary ─────────────────────────────────────────────────────────

describe('buildDaySummary', () => {
  test('returns no-data message for empty list', () => {
    expect(buildDaySummary([])).toContain('yeterli sezon verisi yok');
  });

  test('returns no-data message when all have hasData=false', () => {
    expect(buildDaySummary([NO_DATA, NO_DATA])).toContain('yeterli sezon verisi yok');
  });

  test('includes average xG in output', () => {
    const m1 = makeMetrics({ expectedGoals: 2.0 });
    const m2 = makeMetrics({ expectedGoals: 4.0 });
    const r = buildDaySummary([m1, m2]);
    expect(r).toContain('3.0');
  });

  test('mentions high-score count when 3+ matches have xG > 3.0', () => {
    const high = makeMetrics({ expectedGoals: 3.5 });
    expect(buildDaySummary([high, high, high, NO_DATA])).toContain('gol profili var');
  });

  test('mentions "Çoğu maç dengeli" when majority are balanced', () => {
    const bal = makeMetrics({ favorite: 'balanced' });
    expect(buildDaySummary([bal, bal, bal])).toContain('Çoğu maç dengeli profilde');
  });

  test('mentions "belirgin bir favori" when majority have high confidence', () => {
    const fav = makeMetrics({ confidence: 'high', favorite: 'home' });
    expect(buildDaySummary([fav, fav, fav])).toContain('belirgin bir favori');
  });

  test('ignores NO_DATA entries in average calculation', () => {
    const m = makeMetrics({ expectedGoals: 3.0 });
    const r = buildDaySummary([m, NO_DATA]);
    expect(r).toContain('3.0');
  });
});

// ─── marqueeBonus ─────────────────────────────────────────────────────────────

describe('marqueeBonus', () => {
  test('returns 12 for El Clasico (Real Madrid vs Barcelona)', () => {
    expect(marqueeBonus(makeMatch({ leagueApiId: 2014, home: 'Real Madrid', away: 'Barcelona' }))).toBe(12);
  });

  test('returns 12 for reversed El Clasico (Barcelona vs Real Madrid)', () => {
    expect(marqueeBonus(makeMatch({ leagueApiId: 2014, home: 'Barcelona', away: 'Real Madrid' }))).toBe(12);
  });

  test('returns 12 for Galatasaray vs Fenerbahce', () => {
    expect(marqueeBonus(makeMatch({ leagueApiId: 203, home: 'Galatasaray', away: 'Fenerbahce' }))).toBe(12);
  });

  test('returns 10 for Manchester United vs Liverpool', () => {
    expect(marqueeBonus(makeMatch({ leagueApiId: 2021, home: 'Manchester United', away: 'Liverpool' }))).toBe(10);
  });

  test('returns 9 for Bayern vs Dortmund', () => {
    expect(marqueeBonus(makeMatch({ leagueApiId: 2002, home: 'Bayern', away: 'Dortmund' }))).toBe(9);
  });

  test('returns 0 for regular match', () => {
    expect(marqueeBonus(makeMatch({ leagueApiId: 2021, home: 'Arsenal', away: 'Liverpool' }))).toBe(0);
  });

  test('returns 0 when correct teams but wrong league', () => {
    expect(marqueeBonus(makeMatch({ leagueApiId: 2021, home: 'Real Madrid', away: 'Barcelona' }))).toBe(0);
  });
});

// ─── scoutScore ───────────────────────────────────────────────────────────────

describe('scoutScore', () => {
  const noData = NO_DATA;

  test('base score = LEAGUE_WEIGHT for the league', () => {
    // UCL base = 30 (no other bonuses: finished, early time, no position data, no marquee)
    const s = scoutScore(makeMatch({ leagueApiId: 2001, time: '15:00', finished: true }), noData);
    expect(s).toBe(30);
  });

  test('base score for Premier Lig is 26', () => {
    const s = scoutScore(makeMatch({ leagueApiId: 2021, time: '15:00', finished: true }), noData);
    expect(s).toBe(26);
  });

  test('defaults to 8 for unknown league', () => {
    const s = scoutScore(makeMatch({ leagueApiId: 9999, time: '15:00', finished: true }), noData);
    expect(s).toBe(8);
  });

  test('adds +2 for prime-time match (>= 20:00)', () => {
    const early = scoutScore(makeMatch({ leagueApiId: 9999, time: '15:00', finished: true }), noData);
    const prime = scoutScore(makeMatch({ leagueApiId: 9999, time: '20:00', finished: true }), noData);
    expect(prime - early).toBe(2);
  });

  test('adds +1 for evening match (18:00–19:59)', () => {
    const early   = scoutScore(makeMatch({ leagueApiId: 9999, time: '15:00', finished: true }), noData);
    const evening = scoutScore(makeMatch({ leagueApiId: 9999, time: '18:00', finished: true }), noData);
    expect(evening - early).toBe(1);
  });

  test('adds +1 for unfinished match', () => {
    const fin  = scoutScore(makeMatch({ leagueApiId: 9999, time: '15:00', finished: true }),  noData);
    const live = scoutScore(makeMatch({ leagueApiId: 9999, time: '15:00', finished: false }), noData);
    expect(live - fin).toBe(1);
  });

  test('adds position bonus for top-3 teams (+4 each)', () => {
    const base     = scoutScore(makeMatch({ leagueApiId: 9999, time: '15:00', finished: true }), noData);
    const withPos  = scoutScore(makeMatch({ leagueApiId: 9999, time: '15:00', finished: true }), makeMetrics({ homePos: 2, awayPos: 7 }));
    expect(withPos - base).toBeGreaterThan(0);
  });

  test('adds +4 for top-5 vs top-5 matchup', () => {
    const m = makeMatch({ leagueApiId: 9999, time: '15:00', finished: true });
    const topTop = scoutScore(m, makeMetrics({ homePos: 2, awayPos: 4 }));
    const topLow = scoutScore(m, makeMetrics({ homePos: 2, awayPos: 10 }));
    expect(topTop - topLow).toBeGreaterThan(0);
  });

  test('adds marquee bonus on top of base', () => {
    const regular  = scoutScore(makeMatch({ leagueApiId: 2014, home: 'Sevilla', away: 'Valencia', time: '15:00', finished: true }), noData);
    const clasico  = scoutScore(makeMatch({ leagueApiId: 2014, home: 'Real Madrid', away: 'Barcelona', time: '15:00', finished: true }), noData);
    expect(clasico - regular).toBe(12);
  });

  test('adds +2 for high xG (> 3.0) when hasData', () => {
    const m = makeMatch({ leagueApiId: 9999, time: '15:00', finished: true });
    const high = scoutScore(m, makeMetrics({ expectedGoals: 3.5 }));
    const low  = scoutScore(m, makeMetrics({ expectedGoals: 2.0 }));
    expect(high - low).toBe(2);
  });

  test('subtracts 1 for high-confidence + low-tempo defensive game', () => {
    const m = makeMatch({ leagueApiId: 9999, time: '15:00', finished: true });
    const medium = scoutScore(m, makeMetrics({ confidence: 'medium', tempo: 2.0 }));
    const tight  = scoutScore(m, makeMetrics({ confidence: 'high', tempo: 2.0 }));
    expect(tight - medium).toBe(-1);
  });
});

// ─── favoriteText ─────────────────────────────────────────────────────────────

describe('favoriteText', () => {
  const m = makeMatch({ home: 'Arsenal', away: 'Liverpool' });

  test('returns empty string when hasData=false', () => {
    expect(favoriteText(m, NO_DATA)).toBe('');
  });

  test('returns "Dengeli eşleşme" for balanced', () => {
    expect(favoriteText(m, makeMetrics({ favorite: 'balanced', confidence: 'low' }))).toBe('Dengeli eşleşme');
  });

  test('returns "[Home] belirgin favori" for home + high confidence', () => {
    expect(favoriteText(m, makeMetrics({ favorite: 'home', confidence: 'high' }))).toBe('Arsenal belirgin favori');
  });

  test('returns "[Away] favori" for away + medium confidence', () => {
    expect(favoriteText(m, makeMetrics({ favorite: 'away', confidence: 'medium' }))).toBe('Liverpool favori');
  });

  test('returns "[Home] hafif önde" for home + low confidence', () => {
    expect(favoriteText(m, makeMetrics({ favorite: 'home', confidence: 'low' }))).toBe('Arsenal hafif önde');
  });
});

// ─── hasUsableStandingsMap ────────────────────────────────────────────────────

describe('hasUsableStandingsMap', () => {
  test('returns false for null', () => {
    expect(hasUsableStandingsMap(null)).toBe(false);
  });

  test('returns false for empty object', () => {
    expect(hasUsableStandingsMap({})).toBe(false);
  });

  test('returns false when all arrays are empty', () => {
    expect(hasUsableStandingsMap({ 2021: [] })).toBe(false);
  });

  test('returns true when Süper Lig (203) has entries', () => {
    expect(hasUsableStandingsMap({ 203: [makeStanding() as any] })).toBe(true);
  });

  test('returns true when a supported league has entries', () => {
    expect(hasUsableStandingsMap({ 2021: [makeStanding() as any] })).toBe(true);
    expect(hasUsableStandingsMap({ 2014: [makeStanding() as any] })).toBe(true);
    expect(hasUsableStandingsMap({ 2001: [makeStanding() as any] })).toBe(true);
  });

  test('returns false when only unknown league has entries', () => {
    expect(hasUsableStandingsMap({ 9999: [makeStanding() as any] })).toBe(false);
  });
});
