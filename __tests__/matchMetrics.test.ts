jest.mock('../services/api', () => ({
  getCityForTeam: jest.fn(() => null),
}));

jest.mock('../utils/matchAnalysis', () => {
  const actual = jest.requireActual('../utils/matchAnalysis');
  return {
    ...actual,
    strHash: jest.fn(() => 42),
  };
});

import {
  normalizeTeam,
  findStanding,
  computeMetrics,
  buildMatchSummary,
  buildDaySummary,
  scoutScore,
  marqueeBonus,
  majorTeamBonus,
  favoriteText,
  levelFromExpectedGoals,
  riskFromMetrics,
  confidenceText,
  trendBarPercent,
  singleMatchScoutText,
  readH2HMatch,
  hasUsableStandingsMap,
  timeToMins,
  formatTime,
  formatSportsDbTime,
  sportsDbUtcDate,
  isRenderableMatch,
  mapMatch,
  mapSLMatch,
  buildVisibleMatches,
  rankMatchesWithMetrics,
  selectPreviewMatch,
  expectedLine,
  uniqueLeagueIds,
  buildNextPreviewFromHomeData,
  buildHomeCardAnalysis,
  NO_DATA,
  LEAGUE_WEIGHT,
  type Match,
  type Metrics,
} from '../utils/matchMetrics';
import type { FDMatch, SLMatch, HomeData } from '../services/api';

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
    home: 'Leeds', away: 'Burnley',
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

  test('home card headline uses the same scout pick wording', () => {
    const r = computeMetrics(home as any, away as any, standings as any);
    const card = buildHomeCardAnalysis(makeMatch({ home: 'Home', away: 'Away' }), r);
    expect(card.headline).toMatch(/2\.5|kaybetmez|galibiyete|Karşılıklı|Riskli|Taraf seçimi/);
    expect(card.summary.length).toBeGreaterThan(20);
  });

  test('includes leader, neighbor, and safety-line context from full standings', () => {
    const rows = Array.from({ length: 18 }, (_, index) => makeStanding({
      pos: index + 1,
      teamId: 100 + index,
      team: `Team ${index + 1}`,
      played: 30,
      pts: 80 - index * 3,
      gf: 50 - index,
      ga: 20 + index,
    }));
    const homeRow = rows[9];
    const awayRow = rows[11];

    const r = computeMetrics(homeRow as any, awayRow as any, rows as any);

    expect(r.leaderPts).toBe(80);
    expect(r.totalTeams).toBe(18);
    expect(r.homeAbovePts).toBe(rows[8].pts);
    expect(r.homeBelowPts).toBe(rows[10].pts);
    expect(r.awayAbovePts).toBe(rows[10].pts);
    expect(r.awayBelowPts).toBe(rows[12].pts);
    expect(r.safetyPts).toBe(rows[13].pts);
  });

  test('omits safety-line context for short tables', () => {
    const shortRows = [home, away];
    const r = computeMetrics(home as any, away as any, shortRows as any);

    expect(r.totalTeams).toBe(2);
    expect(r.safetyPts).toBeUndefined();
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

  test('includes "gollü maç ihtimali yüksek" for xG >= 3.2', () => {
    expect(buildMatchSummary({ ...base, expectedGoals: 3.5 }).toLowerCase()).toContain('gollü maç ihtimali yüksek');
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

describe('majorTeamBonus', () => {
  test('adds a strong bonus when one major team plays', () => {
    expect(majorTeamBonus(makeMatch({ home: 'Real Madrid', away: 'Espanyol' }))).toBe(7);
  });

  test('adds a very strong bonus when two major teams meet', () => {
    expect(majorTeamBonus(makeMatch({ home: 'Real Madrid', away: 'Barcelona' }))).toBe(18);
  });

  test('returns 0 for regular teams', () => {
    expect(majorTeamBonus(makeMatch({ home: 'Leeds', away: 'Burnley' }))).toBe(0);
  });
});

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
    expect(clasico - regular).toBe(30);
  });

  test('adds +2 for high xG (> 3.0) when hasData', () => {
    const m = makeMatch({ leagueApiId: 9999, time: '15:00', finished: true });
    const high = scoutScore(m, makeMetrics({ expectedGoals: 3.5 }));
    const low  = scoutScore(m, makeMetrics({ expectedGoals: 2.0 }));
    expect(high - low).toBe(2);
  });

  test('adds +1 for medium-high xG (> 2.5 and <= 3.0)', () => {
    const m = makeMatch({ leagueApiId: 9999, time: '15:00', finished: true });
    const mediumHigh = scoutScore(m, makeMetrics({ expectedGoals: 2.8 }));
    const low = scoutScore(m, makeMetrics({ expectedGoals: 2.0 }));
    expect(mediumHigh - low).toBe(1);
  });

  test('adds +2 for balanced high-PPG teams', () => {
    const m = makeMatch({ leagueApiId: 9999, time: '15:00', finished: true });
    const balancedStrong = scoutScore(m, makeMetrics({
      favorite: 'balanced',
      homePpg: 1.9,
      awayPpg: 1.8,
      expectedGoals: 2.0,
    }));
    const balancedRegular = scoutScore(m, makeMetrics({
      favorite: 'balanced',
      homePpg: 1.7,
      awayPpg: 1.8,
      expectedGoals: 2.0,
    }));
    expect(balancedStrong - balancedRegular).toBe(2);
  });

  test('adds +2 for top-8 vs top-8 matchup outside top five', () => {
    const m = makeMatch({ leagueApiId: 9999, time: '15:00', finished: true });
    const top8 = scoutScore(m, makeMetrics({ homePos: 7, awayPos: 8, expectedGoals: 2.0 }));
    const lower = scoutScore(m, makeMetrics({ homePos: 7, awayPos: 12, expectedGoals: 2.0 }));
    expect(top8 - lower).toBe(2);
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

  test('returns table-context label for home + high confidence', () => {
    expect(favoriteText(m, makeMetrics({ favorite: 'home', confidence: 'high' }))).toBe('Arsenal sezon tablosunda belirgin önde');
  });

  test('returns table-context label for away + medium confidence', () => {
    expect(favoriteText(m, makeMetrics({ favorite: 'away', confidence: 'medium' }))).toBe('Liverpool sezon tablosunda önde');
  });

  test('returns table-context label for home + low confidence', () => {
    expect(favoriteText(m, makeMetrics({ favorite: 'home', confidence: 'low' }))).toBe('Arsenal sezon tablosunda hafif önde');
  });
});

// ─── hasUsableStandingsMap ────────────────────────────────────────────────────

describe('display helper labels', () => {
  test('classifies expected-goals levels', () => {
    expect(levelFromExpectedGoals(2.8)).toBe('Yüksek');
    expect(levelFromExpectedGoals(2.0)).toBe('Düşük');
    expect(levelFromExpectedGoals(2.4)).toBe('Orta');
  });

  test('derives risk and confidence labels from data quality and confidence', () => {
    expect(riskFromMetrics(NO_DATA)).toBe('Orta');
    expect(riskFromMetrics(makeMetrics({ confidence: 'high' }))).toBe('Düşük');
    expect(riskFromMetrics(makeMetrics({ confidence: 'low' }))).toBe('Yüksek');
    expect(riskFromMetrics(makeMetrics({ confidence: 'medium' }))).toBe('Orta');

    expect(confidenceText(NO_DATA)).toBe('Sınırlı');
    expect(confidenceText(makeMetrics({ confidence: 'high' }))).toBe('Yüksek');
    expect(confidenceText(makeMetrics({ confidence: 'medium' }))).toBe('Orta');
    expect(confidenceText(makeMetrics({ confidence: 'low' }))).toBe('Düşük');
  });

  test('maps trend labels to stable progress widths', () => {
    expect(trendBarPercent('Yüksek')).toBe(82);
    expect(trendBarPercent('Düşük')).toBe(36);
    expect(trendBarPercent('Sınırlı')).toBe(34);
    expect(trendBarPercent('Orta')).toBe(58);
  });

  test('builds single-match scout copy for no-data and data-backed cases', () => {
    const m = makeMatch({ home: 'Arsenal', away: 'Liverpool' });

    expect(singleMatchScoutText(m, NO_DATA)).toContain('sezon verisi sınırlı');
    expect(singleMatchScoutText(m, makeMetrics({
      expectedGoals: 3.0,
      favorite: 'home',
      confidence: 'medium',
    }))).toContain('yüksek tempo');
    expect(singleMatchScoutText(m, makeMetrics({
      expectedGoals: 1.8,
      favorite: 'balanced',
      confidence: 'low',
    }))).toContain('kontrollü tempo');
  });

  test('normalizes H2H records from both flat and nested API shapes', () => {
    expect(readH2HMatch({
      home: 'Arsenal',
      away: 'Chelsea',
      homeScore: 2,
      awayScore: 1,
      date: '2026-05-03T12:00:00Z',
    })).toMatchObject({ home: 'Arsenal', away: 'Chelsea', homeScore: 2, awayScore: 1 });

    expect(readH2HMatch({
      homeTeam: { shortName: 'PSG' },
      awayTeam: { name: 'Bayern Munich' },
      score: { fullTime: { home: 0, away: 0 } },
      utcDate: '2026-05-03T12:00:00Z',
    })).toMatchObject({ home: 'PSG', away: 'Bayern Munich', homeScore: 0, awayScore: 0 });
  });
});

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

// ─── buildVisibleMatches helpers ─────────────────────────────────────────────

function makeFDMatch(overrides: Partial<FDMatch> = {}): FDMatch {
  return {
    id: 1,
    utcDate: '2026-05-10T14:00:00Z',
    status: 'SCHEDULED',
    homeTeam: { id: 57, name: 'Arsenal', shortName: 'Arsenal' },
    awayTeam: { id: 64, name: 'Liverpool', shortName: 'Liverpool' },
    score: { fullTime: { home: null, away: null } },
    competition: { id: 2021, name: 'Premier League' },
    ...overrides,
  };
}

function makeSLMatchData(overrides: Partial<SLMatch> = {}): SLMatch {
  return {
    id: '101',
    home: 'Galatasaray',
    away: 'Fenerbahçe',
    homeScore: null,
    awayScore: null,
    date: '2026-05-10',
    time: '18:00:00',
    status: 'Not Started',
    homeTeamId: 133804,
    awayTeamId: 133807,
    ...overrides,
  };
}

// ─── buildVisibleMatches ──────────────────────────────────────────────────────

describe('buildVisibleMatches', () => {
  test('returns empty array for empty inputs', () => {
    expect(buildVisibleMatches([], [])).toEqual([]);
  });

  test('includes FDMatch with supported league', () => {
    const result = buildVisibleMatches([makeFDMatch({ competition: { id: 2021 } })], []);
    expect(result).toHaveLength(1);
    expect(result[0].leagueApiId).toBe(2021);
    expect(result[0].league).toBe('Premier Lig');
  });

  test('excludes FDMatch with unsupported league id', () => {
    const result = buildVisibleMatches([makeFDMatch({ competition: { id: 9999, name: 'Unknown' } })], []);
    expect(result).toHaveLength(0);
  });

  test('excludes FDMatch with no competition', () => {
    const m = makeFDMatch();
    delete (m as any).competition;
    expect(buildVisibleMatches([m], [])).toHaveLength(0);
  });

  test('excludes FDMatch without home team name (isRenderableMatch filter)', () => {
    const m = makeFDMatch({ homeTeam: { id: 57 } });
    expect(buildVisibleMatches([m], [])).toHaveLength(0);
  });

  test('includes SLMatch and tags it as Süper Lig', () => {
    const result = buildVisibleMatches([], [makeSLMatchData()]);
    expect(result).toHaveLength(1);
    expect(result[0].leagueApiId).toBe(203);
    expect(result[0].league).toBe('Süper Lig');
  });

  test('excludes SLMatch with empty home name', () => {
    const result = buildVisibleMatches([], [makeSLMatchData({ home: '' })]);
    expect(result).toHaveLength(0);
  });

  test('merges FD and SL matches into single array', () => {
    const result = buildVisibleMatches(
      [makeFDMatch({ id: 1 }), makeFDMatch({ id: 2, competition: { id: 2014 } })],
      [makeSLMatchData({ id: '3' })],
    );
    expect(result).toHaveLength(3);
  });

  test('FD matches with multiple supported leagues are all included', () => {
    const ids = [2021, 2014, 2002, 2019, 2015, 2001] as const;
    const matches = ids.map((id, i) => makeFDMatch({ id: i + 1, competition: { id } }));
    expect(buildVisibleMatches(matches, [])).toHaveLength(6);
  });
});

// ─── rankMatchesWithMetrics ───────────────────────────────────────────────────

describe('rankMatchesWithMetrics', () => {
  test('returns empty array for empty input', () => {
    expect(rankMatchesWithMetrics([], {})).toEqual([]);
  });

  test('higher league weight sorts first (UCL before Süper Lig, no standings data)', () => {
    const ucl = makeMatch({ id: 1, leagueApiId: 2001, time: '15:00', finished: true });
    const sl  = makeMatch({ id: 2, leagueApiId: 203,  time: '15:00', finished: true });
    const result = rankMatchesWithMetrics([sl, ucl], {});
    expect(result[0].m.leagueApiId).toBe(2001);
    expect(result[1].m.leagueApiId).toBe(203);
    expect(LEAGUE_WEIGHT[2001]).toBeGreaterThan(LEAGUE_WEIGHT[203]);
  });

  test('equal score: earlier time (< 18:00) comes first over later time (< 18:00)', () => {
    const early = makeMatch({ id: 1, leagueApiId: 2021, time: '12:00', finished: true });
    const later = makeMatch({ id: 2, leagueApiId: 2021, time: '16:00', finished: true });
    const result = rankMatchesWithMetrics([later, early], {});
    expect(result[0].m.id).toBe(1);
    expect(result[1].m.id).toBe(2);
  });

  test('equal score + equal time: smaller id comes first', () => {
    const a = makeMatch({ id: 1, leagueApiId: 2021, time: '15:00', finished: true });
    const b = makeMatch({ id: 2, leagueApiId: 2021, time: '15:00', finished: true });
    const result = rankMatchesWithMetrics([b, a], {});
    expect(result[0].m.id).toBe(1);
    expect(result[1].m.id).toBe(2);
  });

  test('returns { m, metrics } pairs for each match', () => {
    const m = makeMatch({ id: 10, leagueApiId: 2021, time: '15:00', finished: true });
    const result = rankMatchesWithMetrics([m], {});
    expect(result[0].m).toBe(m);
    expect(result[0].metrics).toBeDefined();
    expect(typeof result[0].metrics.hasData).toBe('boolean');
  });

  test('does not mutate the input array', () => {
    const a = makeMatch({ id: 2, leagueApiId: 2001, time: '15:00', finished: true });
    const b = makeMatch({ id: 1, leagueApiId: 2021, time: '15:00', finished: true });
    const input = [b, a];
    rankMatchesWithMetrics(input, {});
    expect(input[0].id).toBe(b.id);
    expect(input[1].id).toBe(a.id);
  });
});

// ─── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime', () => {
  test('returns a string in HH:MM format', () => {
    expect(formatTime('2026-05-01T14:00:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  test('pads single-digit minutes with leading zero', () => {
    // 14:05 UTC — regardless of local timezone, minutes are always 05
    const result = formatTime('2026-05-01T14:05:00Z');
    expect(result).toMatch(/:\d{2}$/);
    expect(result.split(':')[1]).toBe('05');
  });

  test('consecutive calls with same input return same output', () => {
    const r1 = formatTime('2026-05-10T20:30:00Z');
    const r2 = formatTime('2026-05-10T20:30:00Z');
    expect(r1).toBe(r2);
  });
});

// ─── formatSportsDbTime ───────────────────────────────────────────────────────

describe('formatSportsDbTime', () => {
  test('returns "?" when time is null', () => {
    expect(formatSportsDbTime('2026-05-01', null)).toBe('?');
  });

  test('returns "?" when time is undefined', () => {
    expect(formatSportsDbTime('2026-05-01', undefined)).toBe('?');
  });

  test('returns first 5 chars of time when date is invalid', () => {
    expect(formatSportsDbTime('not-a-date', '20:30:00')).toBe('20:30');
  });

  test('returns HH:MM format for a valid date + time', () => {
    expect(formatSportsDbTime('2026-05-01', '14:00:00')).toMatch(/^\d{2}:\d{2}$/);
  });
});

// ─── sportsDbUtcDate ──────────────────────────────────────────────────────────

describe('sportsDbUtcDate', () => {
  test('combines date and time into ISO string', () => {
    expect(sportsDbUtcDate('2026-05-01', '14:00:00')).toBe('2026-05-01T14:00:00Z');
  });

  test('uses 00:00:00 when time is null', () => {
    expect(sportsDbUtcDate('2026-05-01', null)).toBe('2026-05-01T00:00:00Z');
  });

  test('uses 00:00:00 when time is undefined', () => {
    expect(sportsDbUtcDate('2026-05-01')).toBe('2026-05-01T00:00:00Z');
  });
});

// ─── isRenderableMatch ────────────────────────────────────────────────────────

describe('isRenderableMatch', () => {
  test('returns true when all required fields are present', () => {
    expect(isRenderableMatch(makeMatch())).toBe(true);
  });

  test('returns false when home is empty', () => {
    expect(isRenderableMatch(makeMatch({ home: '' }))).toBe(false);
  });

  test('returns false when away is empty', () => {
    expect(isRenderableMatch(makeMatch({ away: '' }))).toBe(false);
  });

  test('returns false when time is empty', () => {
    expect(isRenderableMatch(makeMatch({ time: '' }))).toBe(false);
  });

  test('returns false when league is empty', () => {
    expect(isRenderableMatch(makeMatch({ league: '' }))).toBe(false);
  });

  test('returns false when home is whitespace-only', () => {
    expect(isRenderableMatch(makeMatch({ home: '   ' }))).toBe(false);
  });
});

// ─── mapMatch ─────────────────────────────────────────────────────────────────

describe('mapMatch', () => {
  const base = makeFDMatch();

  test('maps leagueApiId from competition.id', () => {
    expect(mapMatch(base).leagueApiId).toBe(2021);
  });

  test('maps league name from LEAGUE_NAMES', () => {
    expect(mapMatch(base).league).toBe('Premier Lig');
  });

  test('falls back to competition.name for unknown league id', () => {
    const m = makeFDMatch({ competition: { id: 9999, name: 'Conference League' } });
    expect(mapMatch(m).league).toBe('Conference League');
  });

  test('prefers shortName over name for teams', () => {
    const m = makeFDMatch({
      homeTeam: { id: 57, name: 'Arsenal Football Club', shortName: 'Arsenal' },
    });
    expect(mapMatch(m).home).toBe('Arsenal');
  });

  test('falls back to name when shortName is absent', () => {
    const m = makeFDMatch({ homeTeam: { id: 57, name: 'Arsenal' } });
    expect(mapMatch(m).home).toBe('Arsenal');
  });

  test('score is null when match is not finished', () => {
    const m = makeFDMatch({ status: 'SCHEDULED', score: { fullTime: { home: null, away: null } } });
    expect(mapMatch(m).score).toBeNull();
  });

  test('score is formatted string when match is finished', () => {
    const m = makeFDMatch({ status: 'FINISHED', score: { fullTime: { home: 2, away: 1 } } });
    expect(mapMatch(m).score).toBe('2 - 1');
  });

  test('finished flag matches status', () => {
    expect(mapMatch(makeFDMatch({ status: 'FINISHED' })).finished).toBe(true);
    expect(mapMatch(makeFDMatch({ status: 'SCHEDULED' })).finished).toBe(false);
  });

  test('homeTeamId and awayTeamId are copied', () => {
    const result = mapMatch(base);
    expect(result.homeTeamId).toBe(57);
    expect(result.awayTeamId).toBe(64);
  });

  test('time is in HH:MM format', () => {
    expect(mapMatch(base).time).toMatch(/^\d{2}:\d{2}$/);
  });
});

// ─── mapSLMatch ───────────────────────────────────────────────────────────────

describe('mapSLMatch', () => {
  const base = makeSLMatchData();

  test('leagueApiId is always 203', () => {
    expect(mapSLMatch(base).leagueApiId).toBe(203);
  });

  test('league is always "Süper Lig"', () => {
    expect(mapSLMatch(base).league).toBe('Süper Lig');
  });

  test('score is null when scores are null', () => {
    expect(mapSLMatch(base).score).toBeNull();
  });

  test('score is formatted string when scores are present', () => {
    const m = makeSLMatchData({ homeScore: 2, awayScore: 1 });
    expect(mapSLMatch(m).score).toBe('2 - 1');
  });

  test('finished when status is "Match Finished"', () => {
    const m = makeSLMatchData({ status: 'Match Finished', homeScore: 1, awayScore: 0 });
    expect(mapSLMatch(m).finished).toBe(true);
  });

  test('finished when homeScore is set even without status', () => {
    const m = makeSLMatchData({ homeScore: 1, awayScore: 0, status: 'Not Started' });
    expect(mapSLMatch(m).finished).toBe(true);
  });

  test('not finished when no score and status is "Not Started"', () => {
    expect(mapSLMatch(base).finished).toBe(false);
  });

  test('homeTeamId and awayTeamId are copied', () => {
    const result = mapSLMatch(base);
    expect(result.homeTeamId).toBe(133804);
    expect(result.awayTeamId).toBe(133807);
  });

  test('uses strHash as id when id is non-numeric', () => {
    const m = makeSLMatchData({ id: 'abc-xyz' });
    expect(mapSLMatch(m).id).toBe(42); // strHash mock returns 42
  });

  test('parses numeric string id correctly', () => {
    const m = makeSLMatchData({ id: '999' });
    expect(mapSLMatch(m).id).toBe(999);
  });
});

// ─── selectPreviewMatch ───────────────────────────────────────────────────────

describe('selectPreviewMatch', () => {
  const ucl = makeMatch({ id: 10, leagueApiId: 2001, time: '20:00', finished: false });
  const pl  = makeMatch({ id: 20, leagueApiId: 2021, time: '15:00', finished: false });
  const sl  = makeMatch({ id: 30, leagueApiId: 203,  time: '18:00', finished: false });

  test('returns null for empty visible list', () => {
    expect(selectPreviewMatch([], {})).toBeNull();
  });

  test('returns top-ranked match when no featuredMatchId', () => {
    const result = selectPreviewMatch([pl, sl, ucl], {});
    // UCL has highest weight (30 > 26 > 14)
    expect(result?.m.leagueApiId).toBe(2001);
  });

  test('returns backend featured match when featuredMatchId exists and matches', () => {
    const result = selectPreviewMatch([pl, sl, ucl], {}, 30);
    expect(result?.m.id).toBe(30);
  });

  test('falls back to top-ranked when featuredMatchId does not match any visible match', () => {
    const result = selectPreviewMatch([pl, sl, ucl], {}, 9999);
    expect(result?.m.leagueApiId).toBe(2001);
  });

  test('returns metrics alongside the match', () => {
    const result = selectPreviewMatch([pl], {});
    expect(result?.metrics).toBeDefined();
    expect(typeof result?.metrics.hasData).toBe('boolean');
  });
});

// ─── expectedLine ─────────────────────────────────────────────────────────────

describe('expectedLine', () => {
  test('formats expected goals as "Beklenen ~X.Y gol"', () => {
    const m = makeMetrics({ expectedGoals: 2.5 });
    expect(expectedLine(m)).toBe('Beklenen ~2.5 gol');
  });

  test('always shows one decimal place', () => {
    expect(expectedLine(makeMetrics({ expectedGoals: 3.0 }))).toBe('Beklenen ~3.0 gol');
    expect(expectedLine(makeMetrics({ expectedGoals: 1.8 }))).toBe('Beklenen ~1.8 gol');
  });
});

// ─── uniqueLeagueIds ──────────────────────────────────────────────────────────

describe('uniqueLeagueIds', () => {
  test('returns empty array for empty input', () => {
    expect(uniqueLeagueIds([])).toEqual([]);
  });

  test('deduplicates league ids', () => {
    const matches = [
      makeMatch({ leagueApiId: 2021 }),
      makeMatch({ leagueApiId: 2021 }),
      makeMatch({ leagueApiId: 2014 }),
    ];
    const result = uniqueLeagueIds(matches);
    expect(result).toHaveLength(2);
    expect(result).toContain(2021);
    expect(result).toContain(2014);
  });

  test('filters out falsy leagueApiId values', () => {
    const matches = [
      makeMatch({ leagueApiId: 2021 }),
      makeMatch({ leagueApiId: 0 }),
    ];
    expect(uniqueLeagueIds(matches)).toEqual([2021]);
  });
});

// ─── buildNextPreviewFromHomeData ─────────────────────────────────────────────

describe('buildNextPreviewFromHomeData', () => {
  const emptyRowsMap: Record<number, ReturnType<typeof makeStanding>[]> = {};

  test('returns null when nextPreview is null', () => {
    const homeData: Pick<HomeData, 'nextPreview'> = { nextPreview: null };
    expect(buildNextPreviewFromHomeData(homeData, emptyRowsMap)).toBeNull();
  });

  test('returns null when nextPreview has no matches', () => {
    const homeData: Pick<HomeData, 'nextPreview'> = {
      nextPreview: { date: '2026-05-04', matches: [], superLigMatches: [], featuredMatchId: null },
    };
    expect(buildNextPreviewFromHomeData(homeData, emptyRowsMap)).toBeNull();
  });
});
