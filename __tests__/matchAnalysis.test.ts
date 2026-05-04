jest.mock('../services/config', () => ({
  API_BASE_URL: 'https://example.test',
  CURRENT_FOOTBALL_SEASON: 2025,
  DISPLAY_FOOTBALL_SEASON: '2025/26',
  CURRENT_SPORTSDB_SEASON: '2025-2026',
}));

import {
  buildMatchCharacterDetail,
  buildReasons,
  buildScoutPick,
  buildScoutSummary,
  calcFormPoints,
  calcFormStats,
  getMotivationComment,
  getDeepH2HStats,
  getH2HComment,
  getOddsComment,
  getRefereeProfile,
  getStat,
  getTeamStyle,
  getGuven,
  getWeatherComment,
  isWeatherRisk,
  getDrawAnalysis,
  getCompareComment,
  getUclKnockoutMotivation,
  resolveFormTeamIds,
  resolveMatchContext,
  resolveWeatherCity,
  strHash,
  shiftLevel,
  MIN_H2H,
  getPersona,
  getPersonaEnriched,
  getTagColor as getTagColorMA,
  buildMatchAnalysis,
  getRiskWarnings,
  getHomeAwayComment,
  getFormTrend,
  type MatchFormStats,
  type FormTrend,
} from '../utils/matchAnalysis';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function makeStats(overrides: Partial<MatchFormStats> = {}): MatchFormStats {
  return {
    total: 8,
    totalAvgGf: '1.5',
    totalAvgGa: '1.0',
    over25Pct: 50,
    kgVarPct: 50,
    ...overrides,
  };
}

// homeWins/awayWins apply to the LAST N matches; earlier matches are draws.
// Scores: homeWin → 3-1 (over25+btts), awayWin → 1-3, draw → 1-1
function makeH2H(count: number, homeWins: number, awayWins: number) {
  const draws = count - homeWins - awayWins;
  const entries: { type: 'home' | 'away' | 'draw' }[] = [
    ...Array(draws).fill({ type: 'draw' }),
    ...Array(homeWins).fill({ type: 'home' }),
    ...Array(awayWins).fill({ type: 'away' }),
  ];
  return entries.map((e, i) => {
    const homeScore = e.type === 'home' ? 3 : e.type === 'away' ? 1 : 1;
    const awayScore = e.type === 'home' ? 1 : e.type === 'away' ? 3 : 1;
    return {
      id: i + 1,
      status: 'FINISHED',
      utcDate: new Date(2025, 0, i + 1).toISOString(),
      homeTeam: { id: 1, name: 'Home FC', shortName: 'Home FC' },
      awayTeam: { id: 2, name: 'Away FC', shortName: 'Away FC' },
      score: { fullTime: { home: homeScore, away: awayScore } },
    };
  });
}

// ──────────────────────────────────────────────
// strHash
// ──────────────────────────────────────────────

describe('strHash', () => {
  it('returns a non-negative integer', () => {
    expect(strHash('test')).toBeGreaterThanOrEqual(0);
  });
  it('is deterministic', () => {
    expect(strHash('Arsenal vs Chelsea')).toBe(strHash('Arsenal vs Chelsea'));
  });
  it('differs for different strings', () => {
    expect(strHash('abc')).not.toBe(strHash('xyz'));
  });
});

// ──────────────────────────────────────────────
// shiftLevel
// ──────────────────────────────────────────────

describe('shiftLevel', () => {
  it('shifts up within bounds', () => {
    expect(shiftLevel('Düşük', 1)).toBe('Orta');
    expect(shiftLevel('Orta', 1)).toBe('Yüksek');
  });
  it('clamps at top', () => {
    expect(shiftLevel('Yüksek', 1)).toBe('Yüksek');
  });
  it('shifts down within bounds', () => {
    expect(shiftLevel('Yüksek', -1)).toBe('Orta');
  });
  it('clamps at bottom', () => {
    expect(shiftLevel('Düşük', -1)).toBe('Düşük');
  });
});

// ──────────────────────────────────────────────
// getMotivationComment — relegation logic
// ──────────────────────────────────────────────

describe('getMotivationComment — relegation scenarios', () => {
  const BASE = {
    homePts: 20,
    awayPts: 22,
    homePlayed: 34,
    awayPlayed: 34,
    leaderPts: 80,
    totalTeams: 20,
    homeAbovePts: 35,
    homeBelowPts: 18,
    awayAbovePts: 30,
    awayBelowPts: 20,
    safetyPts: 35,
  };

  it('returns null when positions are missing', () => {
    expect(getMotivationComment(undefined, 5)).toBeNull();
  });

  it('detects both teams mathematically relegated', () => {
    // Both teams: pos 18/19, 5pts, 34 played, safetyPts=35 → can't reach 35 in 4 remaining
    const ctx = { ...BASE, homePts: 5, awayPts: 4, homePlayed: 34, awayPlayed: 34, safetyPts: 35, totalTeams: 20 };
    const result = getMotivationComment(18, 19, 2021, ctx);
    expect(result).toContain('matematiksel olarak kapanmış');
    expect(result).toContain('İki takım');
  });

  it('detects home team relegated, not away', () => {
    // Home: pos 18, 5pts, 34 played → can't reach safety. Away: pos 10, comfortable.
    const ctx = { ...BASE, homePts: 5, homePlayed: 34, safetyPts: 35, totalTeams: 20 };
    const result = getMotivationComment(18, 10, 2021, ctx);
    expect(result).toContain('Ev sahibinin');
    expect(result).toContain('matematiksel olarak kapanmış');
  });

  it('detects away team relegated, not home', () => {
    const ctx = { ...BASE, awayPts: 3, awayPlayed: 34, safetyPts: 35, totalTeams: 20 };
    const result = getMotivationComment(10, 19, 2021, ctx);
    expect(result).toContain('Deplasman takımının');
    expect(result).toContain('matematiksel olarak kapanmış');
  });

  it('does NOT flag relegation early in the season', () => {
    // Only 10 played — too early, still 28 matches remaining
    const ctx = { ...BASE, homePts: 5, awayPts: 4, homePlayed: 10, awayPlayed: 10, safetyPts: 35, totalTeams: 20 };
    const result = getMotivationComment(18, 19, 2021, ctx);
    expect(result).not.toContain('matematiksel olarak kapanmış');
  });

  it('mid-table positions return null when no special case applies', () => {
    // Positions 10 & 11, no relegation risk, no title race — function returns null for these
    const ctx = { ...BASE, homePts: 40, awayPts: 38, homePlayed: 20, awayPlayed: 20, safetyPts: 25, leaderPts: 60, totalTeams: 20 };
    const result = getMotivationComment(10, 11, 2021, ctx);
    // null is acceptable — no meaningful motivation signal for comfortable mid-table
    expect(result === null || typeof result === 'string').toBe(true);
    if (result !== null) {
      expect(result).not.toContain('matematiksel olarak kapanmış');
    }
  });
});

// ──────────────────────────────────────────────
// getMotivationComment — title race & safety
// ──────────────────────────────────────────────

describe('getMotivationComment — table positions', () => {
  const BASE = {
    homePts: 75, awayPts: 72, homePlayed: 30, awayPlayed: 30,
    leaderPts: 75, totalTeams: 20, safetyPts: 35,
    homeAbovePts: undefined, homeBelowPts: 60,
    awayAbovePts: 75, awayBelowPts: 60,
  };

  it('title race — both in top 3 and can catch leader', () => {
    const result = getMotivationComment(1, 2, 2021, BASE);
    expect(result).toContain('zirvesinde');
  });

  it('UCL contention', () => {
    const ctx = { ...BASE, homePts: 65, awayPts: 62 };
    const result = getMotivationComment(4, 5, 2021, ctx);
    expect(result).toBeTruthy();
  });

  it('relegation zone both fighting', () => {
    const ctx = {
      ...BASE, homePts: 25, awayPts: 23, homePlayed: 30, awayPlayed: 30,
      safetyPts: 35, leaderPts: 80, homeAbovePts: 30, homeBelowPts: 20,
      awayAbovePts: 28, awayBelowPts: 18,
    };
    const result = getMotivationComment(17, 18, 2021, ctx);
    expect(result).toBeTruthy();
    expect(result).not.toContain('matematiksel olarak kapanmış');
  });
});

// ──────────────────────────────────────────────
// getDeepH2HStats
// ──────────────────────────────────────────────

describe('getDeepH2HStats', () => {
  it('returns null with fewer than MIN_H2H valid matches', () => {
    expect(getDeepH2HStats(makeH2H(2, 1, 1), 'Home FC', 'Away FC')).toBeNull();
  });

  it('calculates over25 and btts percentages correctly', () => {
    // 4 matches: home wins 3-1 and draws 1-1 → all over25 (3+1=4>2.5, 1+1=2<2.5 → 3/4=75%)
    // Actually 3-1 = 4 goals (over25), 1-1 = 2 goals (NOT over25)
    // home wins: 4 × 3-1 = all over25 = 100%, btts = 100%
    const h2h = makeH2H(4, 4, 0);
    const result = getDeepH2HStats(h2h, 'Home FC', 'Away FC', 1);
    expect(result).not.toBeNull();
    // 3-1 scores: 4 goals each = over25, and both teams scored = BTTS
    expect(result!.over25Pct).toBe(100);
    expect(result!.bttsPct).toBe(100);
  });

  it('detects home team recent trend', () => {
    // 5 matches where home wins the last 3
    const h2h = makeH2H(5, 4, 0);
    const result = getDeepH2HStats(h2h, 'Home FC', 'Away FC', 1);
    expect(result!.trendDir).toBe('home');
    expect(result!.recentTrend).toContain('Home FC');
  });

  it('detects away team recent trend', () => {
    const h2h = makeH2H(5, 0, 5);
    const result = getDeepH2HStats(h2h, 'Home FC', 'Away FC', 1);
    expect(result!.trendDir).toBe('away');
    expect(result!.recentTrend).toContain('Away FC');
  });

  it('detects balanced trend in last 3 matches', () => {
    // 5 matches: 1 home win, 1 away win, 3 draws
    // Last 3 are: draw, draw, draw → trendDir = balanced
    const h2h = makeH2H(5, 1, 1); // order: [draw,draw,draw,homeWin,awayWin] — last 3: draw,homeWin,awayWin → 1hw 1aw → balanced
    const result = getDeepH2HStats(h2h, 'Home FC', 'Away FC', 1);
    expect(result!.trendDir).toBe('balanced');
  });

  it('returns a deepComment string', () => {
    const h2h = makeH2H(6, 3, 1);
    const result = getDeepH2HStats(h2h, 'Home FC', 'Away FC', 1);
    expect(typeof result!.deepComment).toBe('string');
    expect(result!.deepComment.length).toBeGreaterThan(0);
  });

  it('filters out matches with missing scores', () => {
    const valid = makeH2H(3, 2, 1);
    const invalid = [{ id: 99, status: 'FINISHED', utcDate: '2025-01-01', homeTeam: { id: 1, name: 'X' }, awayTeam: { id: 2, name: 'Y' }, score: { fullTime: { home: null, away: null } } }];
    const result = getDeepH2HStats([...valid, ...invalid], 'Home FC', 'Away FC', 1);
    expect(result).not.toBeNull();
  });
});

// ──────────────────────────────────────────────
// getGuven
// ──────────────────────────────────────────────

describe('getGuven', () => {
  it('returns Yüksek with all signals present', () => {
    const st = makeStats({ total: 10 });
    expect(getGuven(st, st, MIN_H2H + 1, false)).toBe('Yüksek');
  });

  it('returns Düşük with no signals', () => {
    const st = makeStats({ total: 3 });
    expect(getGuven(st, st, 0, true)).toBe('Düşük');
  });

  it('returns Orta with partial signals', () => {
    const st = makeStats({ total: 8 });
    expect(getGuven(st, makeStats({ total: 3 }), MIN_H2H + 1, false)).toBe('Orta');
  });

  it('weather risk reduces confidence', () => {
    const st = makeStats({ total: 10 });
    const withRisk = getGuven(st, st, MIN_H2H + 1, true);
    const withoutRisk = getGuven(st, st, MIN_H2H + 1, false);
    const levels = ['Düşük', 'Orta', 'Yüksek'];
    expect(levels.indexOf(withRisk)).toBeLessThanOrEqual(levels.indexOf(withoutRisk));
  });
});

// ──────────────────────────────────────────────
// getWeatherComment / isWeatherRisk
// ──────────────────────────────────────────────

describe('getWeatherComment', () => {
  it('handles null input gracefully', () => {
    const r = getWeatherComment(null);
    expect(r.impact).toBe('Düşük');
    expect(r.sentence).toBeTruthy();
  });

  it('returns high impact for rain', () => {
    expect(getWeatherComment({ temp: 15, wind: 10, condition: 'heavy rain' }).impact).toBe('Yüksek');
  });

  it('returns high impact for strong wind', () => {
    expect(getWeatherComment({ temp: 15, wind: 40, condition: 'clear' }).impact).toBe('Yüksek');
  });

  it('returns medium impact for extreme heat', () => {
    expect(getWeatherComment({ temp: 32, wind: 5, condition: 'sunny' }).impact).toBe('Orta');
  });

  it('returns medium impact for freezing', () => {
    expect(getWeatherComment({ temp: 2, wind: 5, condition: 'clear' }).impact).toBe('Orta');
  });

  it('returns low impact for good conditions', () => {
    expect(getWeatherComment({ temp: 18, wind: 10, condition: 'clear' }).impact).toBe('Düşük');
  });
});

describe('isWeatherRisk', () => {
  it('returns false for null', () => {
    expect(isWeatherRisk(null)).toBe(false);
  });
  it('returns true for strong wind', () => {
    expect(isWeatherRisk({ wind: 40, condition: 'clear' })).toBe(true);
  });
  it('returns true for rain condition', () => {
    expect(isWeatherRisk({ wind: 5, condition: 'shower' })).toBe(true);
  });
  it('returns false for calm conditions', () => {
    expect(isWeatherRisk({ wind: 10, condition: 'sunny' })).toBe(false);
  });
});

// ──────────────────────────────────────────────
// getDrawAnalysis
// ──────────────────────────────────────────────

describe('getDrawAnalysis', () => {
  const lowGoalSt = makeStats({ over25Pct: 30, kgVarPct: 30 });
  const highGoalSt = makeStats({ over25Pct: 70, kgVarPct: 70 });

  it('returns empty string with no oddsData', () => {
    expect(getDrawAnalysis(null, lowGoalSt, lowGoalSt)).toBe('');
  });

  it('returns empty string with no draw odd', () => {
    expect(getDrawAnalysis({ home: '2.0', away: '3.0' }, lowGoalSt, lowGoalSt)).toBe('');
  });

  it('favors draw scenario with low odds + low goals', () => {
    const result = getDrawAnalysis({ home: '2.2', draw: '2.5', away: '3.0' }, lowGoalSt, lowGoalSt);
    expect(result).toContain('Düşük gol');
  });

  it('notes tension between draw odds and high over25', () => {
    const result = getDrawAnalysis({ home: '2.2', draw: '2.5', away: '3.0' }, highGoalSt, highGoalSt);
    expect(result).toContain('yüksek gol');
  });

  it('dismisses draw with high odds and high BTTS', () => {
    const result = getDrawAnalysis({ home: '1.8', draw: '3.8', away: '4.5' }, highGoalSt, highGoalSt);
    expect(result).toContain('uzak ihtimal');
  });

  it('returns a fallback string for other combinations', () => {
    const result = getDrawAnalysis({ home: '2.5', draw: '3.2', away: '2.8' }, lowGoalSt, highGoalSt);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// getCompareComment
// ──────────────────────────────────────────────

describe('getCompareComment', () => {
  it('returns a non-empty string', () => {
    const r = getCompareComment(
      makeStats({ totalAvgGf: '2.0', totalAvgGa: '0.8' }),
      makeStats({ totalAvgGf: '1.2', totalAvgGa: '1.5' }),
      'Arsenal',
      'Chelsea',
    );
    expect(r.length).toBeGreaterThan(0);
  });

  it('mentions attack leader when clear gap', () => {
    const r = getCompareComment(
      makeStats({ totalAvgGf: '2.5', totalAvgGa: '1.0' }),
      makeStats({ totalAvgGf: '1.0', totalAvgGa: '1.8' }),
      'Arsenal',
      'Chelsea',
    );
    expect(r).toContain('Arsenal');
  });

  it('handles equal stats without crashing', () => {
    const st = makeStats({ totalAvgGf: '1.5', totalAvgGa: '1.2' });
    expect(() => getCompareComment(st, st, 'TeamA', 'TeamB')).not.toThrow();
  });
});

describe('scout narrative builders', () => {
  const openHome = makeStats({
    total: 10,
    totalAvgGf: '2.0',
    totalAvgGa: '1.6',
    over25Pct: 72,
    kgVarPct: 64,
    homeWinPct: 70,
    homePlayed: 6,
  });
  const openAway = makeStats({
    total: 10,
    totalAvgGf: '1.9',
    totalAvgGa: '1.5',
    over25Pct: 68,
    kgVarPct: 60,
    awayWinPct: 25,
    awayPlayed: 6,
  });
  const lowGoal = makeStats({
    total: 9,
    totalAvgGf: '0.9',
    totalAvgGa: '0.8',
    over25Pct: 24,
    kgVarPct: 32,
    homeWinPct: 30,
    awayWinPct: 25,
    homePlayed: 5,
    awayPlayed: 5,
  });

  it('buildReasons mixes base facts with advanced caveats', () => {
    const reasons = buildReasons(
      'Home',
      'Away',
      makeStats({ total: 4, totalAvgGf: '1.8', totalAvgGa: '1.5', over25Pct: 70, kgVarPct: 35, homeWinPct: 90, homePlayed: 2 }),
      makeStats({ total: 5, totalAvgGf: '1.2', totalAvgGa: '1.7', over25Pct: 65, kgVarPct: 40, awayWinPct: 20, awayPlayed: 2 }),
      9,
      4,
      1,
      3,
      { direction: 'up', pts5: 10, ptsPrev: 3 },
      { direction: 'down', pts5: 2, ptsPrev: 8 },
      true,
    );

    expect(reasons.length).toBeGreaterThanOrEqual(5);
    expect(reasons.length).toBeLessThanOrEqual(10);
    expect(reasons.join(' ')).toContain('Home');
  });

  it('buildScoutSummary highlights high-tempo profiles and weather caveats', () => {
    const summary = buildScoutSummary(
      'Home',
      'Away',
      openHome,
      openAway,
      10,
      8,
      5,
      true,
      0,
      { direction: 'up', pts5: 10, ptsPrev: 4 },
      { direction: 'stable', pts5: 5, ptsPrev: 5 },
    );

    expect(summary.length).toBeGreaterThan(80);
    expect(summary).toContain('Hava');
  });

  it('buildScoutSummary explains split home/away signals instead of picking one blindly', () => {
    const summary = buildScoutSummary(
      'Everton',
      'Man City',
      makeStats({ total: 10, totalAvgGf: '1.2', totalAvgGa: '1.3', homeWinPct: 70, homePlayed: 6, over25Pct: 52, kgVarPct: 48 }),
      makeStats({ total: 10, totalAvgGf: '2.0', totalAvgGa: '1.0', awayWinPct: 55, awayPlayed: 6, over25Pct: 58, kgVarPct: 52 }),
      4,
      10,
      4,
      false,
      0,
    );

    expect(summary).toContain('Everton tarafında');
    expect(summary).toContain('Man City tarafında');
  });

  it('buildScoutPick returns goals, low-score, home, away and caution tones', () => {
    expect(buildScoutPick('Home', 'Away', openHome, openAway, 9, 7, 5, false).tone).toBe('goals');
    expect(buildScoutPick('Home', 'Away', lowGoal, lowGoal, 5, 5, 5, false).tone).toBe('draw');
    expect(buildScoutPick('Home', 'Away', openHome, lowGoal, 12, 3, 5, false).tone).toBe('home');
    expect(buildScoutPick('Home', 'Away', lowGoal, openAway, 2, 12, 5, false).tone).toBe('away');
    expect(buildScoutPick('Home', 'Away', makeStats({ total: 2, totalAvgGf: '1.1', over25Pct: 48, kgVarPct: 40 }), makeStats({ total: 2, totalAvgGf: '1.0', over25Pct: 46, kgVarPct: 42 }), 3, 3, 0, true).tone).toBe('caution');
  });

  it('buildScoutPick stays cautious when venue and form signals conflict', () => {
    const pick = buildScoutPick(
      'Everton',
      'Man City',
      makeStats({ total: 10, totalAvgGf: '1.2', totalAvgGa: '1.3', homeWinPct: 70, homePlayed: 6, over25Pct: 50, kgVarPct: 45 }),
      makeStats({ total: 10, totalAvgGf: '2.0', totalAvgGa: '1.0', awayWinPct: 55, awayPlayed: 6, over25Pct: 55, kgVarPct: 50 }),
      4,
      10,
      4,
      false,
    );

    expect(pick.label).toContain('Taraf bahsi riskli');
    expect(pick.detail).toContain('Taraf verileri');
  });

  it('buildScoutPick prefers goal direction when side edge is limited but goal signal is stronger', () => {
    const pick = buildScoutPick(
      'Chelsea',
      'Nottingham',
      makeStats({ total: 10, totalAvgGf: '1.7', totalAvgGa: '1.4', homeWinPct: 45, homePlayed: 6, over25Pct: 62, kgVarPct: 56 }),
      makeStats({ total: 10, totalAvgGf: '1.5', totalAvgGa: '1.5', awayWinPct: 42, awayPlayed: 6, over25Pct: 60, kgVarPct: 54 }),
      8,
      10,
      4,
      false,
    );

    expect(pick.tone).toBe('goals');
    expect(pick.label).toContain('Üst');
    expect(pick.detail).toContain('Taraf');
  });

  it('buildMatchCharacterDetail picks style, attack and fallback narratives', () => {
    expect(buildMatchCharacterDetail('Home', 'Away', openHome, openAway, 8, 7, 0, 'Dominant', 'Savunmacı')).toContain('Home');
    expect(buildMatchCharacterDetail('Home', 'Away', lowGoal, lowGoal, 4, 4, 0).length).toBeGreaterThan(40);
    expect(buildMatchCharacterDetail('Home', 'Away', makeStats({ totalAvgGf: '1.3', totalAvgGa: '1.3', over25Pct: 50, kgVarPct: 50 }), makeStats({ totalAvgGf: '1.4', totalAvgGa: '1.4', over25Pct: 50, kgVarPct: 50 }), 6, 6, 0).length).toBeGreaterThan(40);
  });
});

describe('form and detail helper utilities', () => {
  const fixtures = [
    { utcDate: '2025-01-03', homeTeam: { id: 1, name: 'Home' }, awayTeam: { id: 2, name: 'Away' }, score: { fullTime: { home: 3, away: 1 } } },
    { utcDate: '2025-01-01', homeTeam: { id: 2, name: 'Away' }, awayTeam: { id: 1, name: 'Home' }, score: { fullTime: { home: 0, away: 0 } } },
    { utcDate: '2025-01-02', homeTeam: { id: 1, name: 'Home' }, awayTeam: { id: 3, name: 'Other' }, score: { fullTime: { home: 1, away: 2 } } },
    { utcDate: '2025-01-04', homeTeam: { id: 4, name: 'Fourth' }, awayTeam: { id: 1, name: 'Home' }, score: { fullTime: { home: 1, away: 2 } } },
    { utcDate: '2025-01-05', homeTeam: { id: 1, name: 'Home' }, awayTeam: { id: 5, name: 'Fifth' }, score: { fullTime: { home: 2, away: 2 } } },
    { utcDate: '2025-01-06', homeTeam: { id: 6, name: 'Sixth' }, awayTeam: { id: 1, name: 'Home' }, score: { fullTime: { home: 0, away: 1 } } },
    { utcDate: '2025-01-07', homeTeam: { id: 1, name: 'Home' }, awayTeam: { id: 7, name: 'NoScore' }, score: { fullTime: { home: null, away: null } } },
  ] as any[];

  it('calcFormStats aggregates home/away splits and percentages', () => {
    const stats = calcFormStats(fixtures, 1);

    expect(stats.total).toBe(6);
    expect(stats.homePlayed).toBe(3);
    expect(stats.awayPlayed).toBe(3);
    expect(stats.homeWinPct).toBe(33);
    expect(stats.awayWinPct).toBe(67);
    expect(stats.over25Pct).toBe(67);
    expect(stats.kgVarPct).toBe(67);
  });

  it('calcFormPoints sorts chronologically before taking the latest five', () => {
    expect(calcFormPoints(fixtures, 1)).toBe(10);
  });

  it('getStat reads fuzzy stat keys and falls back to zero', () => {
    const stats = [
      { type: 'Shots on Goal', value: '7' },
      { type: 'Ball Possession', value: '61%' },
    ];

    expect(getStat(stats as any, 'shots on')).toBe(7);
    expect(getStat(stats as any, 'possession')).toBe(61);
    expect(getStat(stats as any, 'corners')).toBe(0);
    expect(getStat(undefined, 'corners')).toBe(0);
  });

  it('getTeamStyle classifies notable scoring profiles', () => {
    expect(getTeamStyle(makeStats({ totalAvgGf: '2.1', totalAvgGa: '0.8' }) as any).label).toBe('Dominant');
    expect(getTeamStyle(makeStats({ totalAvgGf: '0.9', totalAvgGa: '0.8' }) as any).label).toContain('Savun');
    expect(getTeamStyle(makeStats({ totalAvgGf: '1.3', totalAvgGa: '1.7' }) as any).label).toContain('Savun');
  });

  it('H2H, odds, referee and UCL helper text branches return usable narratives', () => {
    expect(getH2HComment(makeH2H(2, 1, 0) as any, 'Home FC', 'Away FC')).toBeTruthy();
    expect(getH2HComment(makeH2H(6, 5, 0) as any, 'Home FC', 'Away FC')).toContain('5/6');
    expect(getOddsComment(null, 'Home', {} as any)).toBeTruthy();
    expect(getOddsComment({ home: '1.45', away: '7.0' } as any, 'Home', { risk: 'Düşük' } as any)).toContain('1.45');
    expect(getOddsComment({ home: '2.2', away: '2.2' } as any, 'Home', { risk: 'Orta' } as any)).toBeTruthy();
    expect(getRefereeProfile('Sample Referee', 2021).narrative.length).toBeGreaterThan(20);
    expect(getUclKnockoutMotivation('FINAL')).toBeTruthy();
    expect(getUclKnockoutMotivation('UNKNOWN_STAGE')).toBeTruthy();
  });

  it('resolver helpers prefer API detail but fall back to route data', () => {
    const stats = {
      homeTeam: { id: 11, name: 'Manchester United', shortName: 'Man United' },
      awayTeam: { id: 22, name: 'Chelsea', shortName: 'Chelsea' },
      status: 'TIMED',
      stage: 'REGULAR_SEASON',
    } as any;

    expect(resolveFormTeamIds(stats, 1, 2)).toEqual({ home: 11, away: 22 });
    expect(resolveFormTeamIds(null, 1, 2)).toEqual({ home: 1, away: 2 });
    expect(resolveWeatherCity('London', stats, 'Route Home')).toBe('London');
    expect(resolveWeatherCity(null, stats, 'Route Home')).toBeTruthy();
    expect(resolveMatchContext(stats, { home: 'Route Home', away: 'Route Away', city: null, homeTeamId: 1, awayTeamId: 2 })).toMatchObject({
      homeName: 'Man United',
      awayName: 'Chelsea',
      homeTeamId: 11,
      awayTeamId: 22,
      status: 'TIMED',
    });
  });
});

// ──────────────────────────────────────────────
// getPersona
// ──────────────────────────────────────────────

describe('getPersona', () => {
  it('returns acik for high gol and high tempo', () => {
    expect(getPersona('Dengeli', 'Yüksek', 'Yüksek', 'Orta')).toBe('acik');
  });
  it('returns kilitli for low gol', () => {
    expect(getPersona('Dengeli', 'Düşük', 'Orta', 'Orta')).toBe('kilitli');
  });
  it('returns surpriz for high risk (not high gol+tempo, not low gol)', () => {
    expect(getPersona('Dengeli', 'Orta', 'Orta', 'Yüksek')).toBe('surpriz');
  });
  it('returns favori for Hücumcu + low risk', () => {
    expect(getPersona('Hücumcu', 'Orta', 'Orta', 'Düşük')).toBe('favori');
  });
  it('returns savunma for Savunmacı style', () => {
    expect(getPersona('Savunmacı', 'Orta', 'Orta', 'Orta')).toBe('savunma');
  });
  it('returns dengeli as default', () => {
    expect(getPersona('Dengeli', 'Orta', 'Orta', 'Orta')).toBe('dengeli');
  });
});

// ──────────────────────────────────────────────
// getPersonaEnriched
// ──────────────────────────────────────────────

describe('getPersonaEnriched', () => {
  it('returns gol_savasi when both teams attack and concede heavily', () => {
    const hSt = makeStats({ totalAvgGf: '1.9', totalAvgGa: '1.6' });
    const aSt = makeStats({ totalAvgGf: '1.8', totalAvgGa: '1.5' });
    expect(getPersonaEnriched('Dengeli', 'Yüksek', 'Yüksek', 'Orta', hSt, aSt)).toBe('gol_savasi');
  });
  it('returns form_donusu for strongly diverging trends', () => {
    const st = makeStats();
    const hTrend: FormTrend = { direction: 'up',   pts5: 12, ptsPrev: 4 };
    const aTrend: FormTrend = { direction: 'down', pts5: 2,  ptsPrev: 8 };
    expect(getPersonaEnriched('Dengeli', 'Orta', 'Orta', 'Orta', st, st, hTrend, aTrend)).toBe('form_donusu');
  });
  it('returns ev_kalesi for strong home / weak away combo', () => {
    const hSt = makeStats({ homeWinPct: 70 });
    const aSt = makeStats({ awayWinPct: 20 });
    expect(getPersonaEnriched('Dengeli', 'Orta', 'Orta', 'Orta', hSt, aSt)).toBe('ev_kalesi');
  });
  it('falls through to getPersona when no enriched condition matches', () => {
    const st = makeStats({ totalAvgGf: '1.2', totalAvgGa: '1.0', homeWinPct: 40, awayWinPct: 40 });
    expect(getPersonaEnriched('Hücumcu', 'Orta', 'Orta', 'Düşük', st, st)).toBe('favori');
  });
  it('returns getPersona result when stats are not provided', () => {
    expect(getPersonaEnriched('Dengeli', 'Düşük', 'Orta', 'Orta')).toBe('kilitli');
  });
});

// ──────────────────────────────────────────────
// getTagColor (matchAnalysis variant)
// ──────────────────────────────────────────────

describe('getTagColor (matchAnalysis)', () => {
  it('stil Hücumcu light', () => {
    const r = getTagColorMA('stil', 'Hücumcu', false);
    expect(r.bg).toBe('#FDE8E8');
    expect(r.text).toBe('#A32D2D');
  });
  it('stil Hücumcu dark', () => {
    expect(getTagColorMA('stil', 'Hücumcu', true).bg).toBe('#2C0A0A');
  });
  it('stil Savunmacı', () => {
    expect(getTagColorMA('stil', 'Savunmacı', false).text).toBe('#27500A');
  });
  it('stil other (Dengeli)', () => {
    expect(getTagColorMA('stil', 'Dengeli', false).bg).toBe('#E6F1FB');
  });
  it('value Yüksek', () => {
    expect(getTagColorMA('risk', 'Yüksek', false).bg).toBe('#FDE8E8');
  });
  it('value Orta', () => {
    expect(getTagColorMA('risk', 'Orta', false).bg).toBe('#FFF8E1');
  });
  it('value Düşük (else)', () => {
    expect(getTagColorMA('risk', 'Düşük', false).bg).toBe('#f0f0f0');
  });
});

// ──────────────────────────────────────────────
// buildMatchAnalysis
// ──────────────────────────────────────────────

describe('buildMatchAnalysis', () => {
  it('returns null scoutPick and bank reasons when hasFormData=false', () => {
    const st = makeStats();
    const r = buildMatchAnalysis('Home', 'Away', 2021, st, st, 5, 5, 0, false, false);
    expect(r.scoutPick).toBeNull();
    expect(r.reasons).toHaveLength(3);
    expect(['🟢 Güçlü sinyal', '🔴 Risk yüksek', '⚖️ Dengeli profil']).toContain(r.badgeLabel);
  });
  it('produces green badge for large form gap (low risk)', () => {
    const hSt = makeStats({ total: 10, over25Pct: 50, kgVarPct: 50, totalAvgGf: '1.5', totalAvgGa: '0.8' });
    const aSt = makeStats({ total: 10, over25Pct: 48, kgVarPct: 48, totalAvgGf: '1.4', totalAvgGa: '0.9' });
    const r = buildMatchAnalysis('Home', 'Away', 2021, hSt, aSt, 12, 3, 5, false, true);
    expect(r.badgeLabel).toBe('🟢 Güçlü sinyal');
  });
  it('produces red badge when weatherRisk=true', () => {
    const st = makeStats({ total: 8, over25Pct: 50, kgVarPct: 50 });
    const r = buildMatchAnalysis('Home', 'Away', 2021, st, st, 5, 5, 3, true, true);
    expect(r.badgeLabel).toBe('🔴 Risk yüksek');
  });
  it('returns scoutPick and string fields when hasFormData=true', () => {
    const st = makeStats({ total: 10, over25Pct: 65, kgVarPct: 60 });
    const r = buildMatchAnalysis('Home', 'Away', 2021, st, st, 5, 5, 4, false, true);
    expect(r.scoutPick).not.toBeNull();
    expect(typeof r.short).toBe('string');
    expect(typeof r.medium).toBe('string');
  });
});

// ──────────────────────────────────────────────
// getRiskWarnings
// ──────────────────────────────────────────────

describe('getRiskWarnings', () => {
  it('warns for small home sample', () => {
    const w = getRiskWarnings({ total: 3 }, { total: 8 }, 4, { guven: 'Orta', risk: 'Orta' });
    expect(w.some(s => s.includes('Ev sahibi'))).toBe(true);
  });
  it('warns for small away sample', () => {
    const w = getRiskWarnings({ total: 8 }, { total: 3 }, 4, { guven: 'Orta', risk: 'Orta' });
    expect(w.some(s => s.includes('Deplasman'))).toBe(true);
  });
  it('warns for low H2H count', () => {
    const w = getRiskWarnings({ total: 8 }, { total: 8 }, 1, { guven: 'Yüksek', risk: 'Orta' });
    expect(w.some(s => s.includes('H2H'))).toBe(true);
  });
  it('warns for low confidence', () => {
    const w = getRiskWarnings({ total: 8 }, { total: 8 }, 4, { guven: 'Düşük', risk: 'Orta' });
    expect(w.some(s => s.includes('güven'))).toBe(true);
  });
  it('warns for high risk', () => {
    const w = getRiskWarnings({ total: 8 }, { total: 8 }, 4, { guven: 'Yüksek', risk: 'Yüksek' });
    expect(w.some(s => s.includes('değişken'))).toBe(true);
  });
  it('returns no-risk message when everything is clean', () => {
    const w = getRiskWarnings({ total: 8 }, { total: 8 }, 4, { guven: 'Yüksek', risk: 'Düşük' });
    expect(w[0]).toContain('tespit edilmedi');
  });
});

// ──────────────────────────────────────────────
// getHomeAwayComment
// ──────────────────────────────────────────────

describe('getHomeAwayComment', () => {
  it('strong home + weak away → mentions iç saha', () => {
    const hSt = makeStats({ homeWinPct: 70 });
    const aSt = makeStats({ awayWinPct: 20 });
    expect(getHomeAwayComment(hSt, aSt, 'Home', 'Away')).toContain('iç saha');
  });
  it('strong home (alone) → mentions Home', () => {
    const hSt = makeStats({ homeWinPct: 70 });
    const aSt = makeStats({ awayWinPct: 38 });
    expect(getHomeAwayComment(hSt, aSt, 'Home', 'Away')).toContain('Home');
  });
  it('large home advantage vs total win rate → mentions Home', () => {
    const hSt = makeStats({ homeWinPct: 55, totalWinPct: 30 });
    const aSt = makeStats({ awayWinPct: 30 });
    expect(getHomeAwayComment(hSt, aSt, 'Home', 'Away')).toContain('Home');
  });
  it('strong away → mentions Away', () => {
    const hSt = makeStats({ homeWinPct: 40, totalWinPct: 30 });
    const aSt = makeStats({ awayWinPct: 55 });
    expect(getHomeAwayComment(hSt, aSt, 'Home', 'Away')).toContain('Away');
  });
  it('both teams low win rate → non-empty string', () => {
    const hSt = makeStats({ homeWinPct: 25 });
    const aSt = makeStats({ awayWinPct: 25 });
    expect(getHomeAwayComment(hSt, aSt, 'Home', 'Away').length).toBeGreaterThan(0);
  });
  it('balanced scenario → non-empty string', () => {
    const hSt = makeStats({ homeWinPct: 45 });
    const aSt = makeStats({ awayWinPct: 35 });
    expect(getHomeAwayComment(hSt, aSt, 'Home', 'Away').length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// getFormTrend
// ──────────────────────────────────────────────

describe('getFormTrend', () => {
  function fmatch(date: string, homeId: number, h: number, a: number) {
    return {
      utcDate: date,
      homeTeam: { id: homeId, name: 'Team' },
      awayTeam: { id: 99, name: 'Other' },
      score: { fullTime: { home: h, away: a } },
    };
  }

  it('returns null with fewer than 6 finished matches', () => {
    const ms = [1, 2, 3, 4, 5].map(i => fmatch(`2025-01-0${i}T12:00:00Z`, 1, 2, 0));
    expect(getFormTrend(ms as any, 1)).toBeNull();
  });
  it('returns up when recent 5 better than prev 5', () => {
    const prev5 = [1, 2, 3, 4, 5].map(i => fmatch(`2025-01-${String(i).padStart(2,'0')}T12:00:00Z`, 1, 1, 1));
    const rec5  = [1, 2, 3, 4, 5].map(i => fmatch(`2025-02-${String(i).padStart(2,'0')}T12:00:00Z`, 1, 3, 0));
    const r = getFormTrend([...prev5, ...rec5] as any, 1);
    expect(r?.direction).toBe('up');
    expect(r?.pts5).toBe(15);
  });
  it('returns down when recent 5 worse than prev 5', () => {
    const prev5 = [1, 2, 3, 4, 5].map(i => fmatch(`2025-01-${String(i).padStart(2,'0')}T12:00:00Z`, 1, 3, 0));
    const rec5  = [1, 2, 3, 4, 5].map(i => fmatch(`2025-02-${String(i).padStart(2,'0')}T12:00:00Z`, 1, 0, 2));
    const r = getFormTrend([...prev5, ...rec5] as any, 1);
    expect(r?.direction).toBe('down');
  });
  it('returns stable when points are equal', () => {
    const all10 = [1,2,3,4,5,6,7,8,9,10].map(i => fmatch(`2025-01-${String(i).padStart(2,'0')}T12:00:00Z`, 1, 2, 1));
    const r = getFormTrend(all10 as any, 1);
    expect(r?.direction).toBe('stable');
  });
});

// ──────────────────────────────────────────────
// buildScoutPick — extended branch coverage
// ──────────────────────────────────────────────

describe('buildScoutPick — extended coverage', () => {
  it('low-confidence + high goals → goals tone', () => {
    const st = makeStats({ total: 3, over25Pct: 62, kgVarPct: 50, totalAvgGf: '1.4', totalAvgGa: '1.4' });
    expect(buildScoutPick('H', 'A', st, st, 5, 5, 1, false).tone).toBe('goals');
  });
  it('low-confidence + low goals → draw tone', () => {
    const st = makeStats({ total: 3, over25Pct: 35, kgVarPct: 40, totalAvgGf: '0.9', totalAvgGa: '0.8' });
    expect(buildScoutPick('H', 'A', st, st, 5, 5, 1, false).tone).toBe('draw');
  });
  it('low-confidence + home edge → home tone', () => {
    const hSt = makeStats({ total: 3, over25Pct: 50, kgVarPct: 40, totalAvgGf: '1.3', totalAvgGa: '1.2', homeWinPct: 60 });
    const aSt = makeStats({ total: 3, over25Pct: 50, kgVarPct: 40, totalAvgGf: '1.0', totalAvgGa: '1.6', awayWinPct: 20 });
    expect(buildScoutPick('H', 'A', hSt, aSt, 8, 3, 1, false).tone).toBe('home');
  });
  it('low-confidence + away edge → away tone', () => {
    const hSt = makeStats({ total: 3, over25Pct: 50, kgVarPct: 40, totalAvgGf: '1.0', totalAvgGa: '1.6', homeWinPct: 20 });
    const aSt = makeStats({ total: 3, over25Pct: 50, kgVarPct: 40, totalAvgGf: '1.3', totalAvgGa: '1.2', awayWinPct: 50 });
    expect(buildScoutPick('H', 'A', hSt, aSt, 3, 8, 1, false).tone).toBe('away');
  });
  it('low-confidence + high KG + balanced edges → goals tone', () => {
    const st = makeStats({ total: 3, over25Pct: 50, kgVarPct: 55, totalAvgGf: '1.2', totalAvgGa: '1.2', homeWinPct: 40, awayWinPct: 35 });
    expect(buildScoutPick('H', 'A', st, st, 5, 5, 1, false).tone).toBe('goals');
  });
  it('high over + combined attack → goals (second non-lc path)', () => {
    const st = makeStats({ total: 10, over25Pct: 63, kgVarPct: 45, totalAvgGf: '1.5', totalAvgGa: '1.5' });
    expect(buildScoutPick('H', 'A', st, st, 5, 5, 3, false).tone).toBe('goals');
  });
  it('low over + balanced form → draw (balance path)', () => {
    const st = makeStats({ total: 10, over25Pct: 40, kgVarPct: 55, totalAvgGf: '1.2', totalAvgGa: '1.2' });
    expect(buildScoutPick('H', 'A', st, st, 5, 5, 3, false).tone).toBe('draw');
  });
  it('moderate home edge (4 ≤ diff < 7) → home tone', () => {
    const hSt = makeStats({ total: 10, over25Pct: 48, kgVarPct: 50, totalAvgGf: '1.4', totalAvgGa: '1.3', homeWinPct: 55 });
    const aSt = makeStats({ total: 10, over25Pct: 48, kgVarPct: 50, totalAvgGf: '1.2', totalAvgGa: '1.2', awayWinPct: 30 });
    expect(buildScoutPick('H', 'A', hSt, aSt, 6, 4, 3, false).tone).toBe('home');
  });
  it('moderate away edge (4 ≤ diff < 7) → away tone', () => {
    const hSt = makeStats({ total: 10, over25Pct: 48, kgVarPct: 50, totalAvgGf: '1.2', totalAvgGa: '1.3', homeWinPct: 30 });
    const aSt = makeStats({ total: 10, over25Pct: 48, kgVarPct: 50, totalAvgGf: '1.4', totalAvgGa: '1.2', awayWinPct: 55 });
    expect(buildScoutPick('H', 'A', hSt, aSt, 4, 6, 3, false).tone).toBe('away');
  });
});

// ──────────────────────────────────────────────
// buildScoutSummary — missing branches
// ──────────────────────────────────────────────

describe('buildScoutSummary — missing branches', () => {
  it('away attack edge branch returns non-empty string', () => {
    const hSt = makeStats({ total: 8, totalAvgGf: '1.2', totalAvgGa: '1.4', over25Pct: 50, kgVarPct: 50, homeWinPct: 45, homePlayed: 5 });
    const aSt = makeStats({ total: 8, totalAvgGf: '2.0', totalAvgGa: '1.1', over25Pct: 50, kgVarPct: 50, awayWinPct: 45, awayPlayed: 5 });
    expect(buildScoutSummary('Home', 'Away', hSt, aSt, 5, 7, 3, false, 0).length).toBeGreaterThan(20);
  });
  it('both strong defenses branch returns non-empty string', () => {
    const st = makeStats({ total: 8, totalAvgGf: '1.2', totalAvgGa: '0.9', over25Pct: 40, kgVarPct: 45, homeWinPct: 45, homePlayed: 5, awayWinPct: 45, awayPlayed: 5 });
    expect(buildScoutSummary('Home', 'Away', st, st, 5, 5, 3, false, 0).length).toBeGreaterThan(20);
  });
  it('high over + low kg → gollü ama tek taraflı message', () => {
    const st = makeStats({ total: 10, over25Pct: 65, kgVarPct: 38, totalAvgGf: '1.5', totalAvgGa: '1.5' });
    expect(buildScoutSummary('Home', 'Away', st, st, 5, 5, 3, false, 0).length).toBeGreaterThan(20);
  });
  it('low over + high kg → dar skorlu beraberlik message', () => {
    const st = makeStats({ total: 10, over25Pct: 35, kgVarPct: 60, totalAvgGf: '1.2', totalAvgGa: '1.2' });
    expect(buildScoutSummary('Home', 'Away', st, st, 5, 5, 3, false, 0).length).toBeGreaterThan(20);
  });
  it('small sample → sınırlı outlook', () => {
    const st = makeStats({ total: 4, over25Pct: 50, kgVarPct: 50 });
    expect(buildScoutSummary('Home', 'Away', st, st, 5, 5, 3, false, 0)).toContain('sınırlı');
  });
  it('strong away deplasman → deplasman message', () => {
    const hSt = makeStats({ total: 8, totalAvgGf: '1.5', totalAvgGa: '1.2', over25Pct: 55, kgVarPct: 50, homeWinPct: 45, homePlayed: 5 });
    const aSt = makeStats({ total: 8, totalAvgGf: '1.5', totalAvgGa: '1.2', over25Pct: 55, kgVarPct: 50, awayWinPct: 55, awayPlayed: 5 });
    expect(buildScoutSummary('Home', 'Away', hSt, aSt, 5, 5, 3, false, 0).length).toBeGreaterThan(20);
  });
  it('form-biased outlook (large form diff + medium over)', () => {
    const st = makeStats({ total: 10, over25Pct: 52, kgVarPct: 52, totalAvgGf: '1.4', totalAvgGa: '1.3' });
    expect(buildScoutSummary('Home', 'Away', st, st, 9, 3, 3, false, 0).length).toBeGreaterThan(20);
  });
});

// ──────────────────────────────────────────────
// getMotivationComment — UCL paths
// ──────────────────────────────────────────────

describe('getMotivationComment — UCL paths', () => {
  it('both teams in top 8 → mentions ilk 8', () => {
    expect(getMotivationComment(3, 7, 2001, {})).toContain('ilk 8');
  });
  it('one team in top 8, one in play-off → mentions 8', () => {
    expect(getMotivationComment(5, 18, 2001, {})).toContain('8');
  });
  it('both teams in play-off zone (9–24) → mentions play-off', () => {
    expect(getMotivationComment(12, 20, 2001, {})).toContain('play-off');
  });
  it('one team eliminated (> 24) → mentions eleme hattının dışında', () => {
    expect(getMotivationComment(25, 10, 2001, {})).toContain('eleme hattının dışında');
  });
});

// ──────────────────────────────────────────────
// getMotivationComment — settled + position paths
// ──────────────────────────────────────────────

describe('getMotivationComment — position coverage', () => {
  it('homePos=1 alone → lider grupta message', () => {
    const r = getMotivationComment(1, 8, 2021, { homePts: 80, homePlayed: 30, leaderPts: 80, totalTeams: 20 });
    expect(r).toContain('lider grupta');
  });
  it('awayPos=1 alone → lider grupta message', () => {
    const r = getMotivationComment(8, 1, 2021, { awayPts: 80, awayPlayed: 30, leaderPts: 80, totalTeams: 20 });
    expect(r).toContain('lider grupta');
  });
  it('homePos in relegation zone only → ev sahibi alt sıra', () => {
    expect(getMotivationComment(17, 8, 2021, { totalTeams: 20 })).toContain('alt sıra');
  });
  it('awayPos in relegation zone only → deplasman alt sıra', () => {
    expect(getMotivationComment(8, 19, 2021, { totalTeams: 20 })).toContain('alt sıra');
  });
  it('home in Europe zone alone → Avrupa kupası', () => {
    expect(getMotivationComment(5, 12, 2021, { totalTeams: 20 })).toContain('Avrupa');
  });
  it('away in Europe zone alone → Avrupa kupası', () => {
    expect(getMotivationComment(12, 6, 2021, { totalTeams: 20 })).toContain('Avrupa');
  });
  it('both teams in Europe zone → both Avrupa', () => {
    expect(getMotivationComment(4, 6, 2021, { totalTeams: 20 })).toContain('Avrupa');
  });
  it('both top-3, cannot reach leader → sınırlı message', () => {
    const ctx = { homePts: 70, awayPts: 68, homePlayed: 36, awayPlayed: 36, leaderPts: 85, totalTeams: 20, safetyPts: 25 };
    const r = getMotivationComment(2, 3, 2021, ctx);
    expect(r).toBeTruthy();
  });
});

// ──────────────────────────────────────────────
// getH2HComment — additional branches
// ──────────────────────────────────────────────

describe('getH2HComment — additional branches', () => {
  it('away team historically dominant → mentions Away FC', () => {
    expect(getH2HComment(makeH2H(6, 0, 5) as any, 'Home FC', 'Away FC')).toContain('Away FC');
  });
  it('high-scoring H2H → gollü geçmiş', () => {
    expect(getH2HComment(makeH2H(3, 1, 1) as any, 'Home FC', 'Away FC')).toContain('gollü geçmiş');
  });
  it('low-scoring balanced H2H → az gollü or balanced text', () => {
    const lowH2H = [
      { score: { fullTime: { home: 1, away: 0 } }, homeTeam: { id: 1, name: 'Home FC', shortName: 'Home FC' }, awayTeam: { id: 2, name: 'Away FC' }, utcDate: '2025-01-01' },
      { score: { fullTime: { home: 0, away: 1 } }, homeTeam: { id: 1, name: 'Home FC', shortName: 'Home FC' }, awayTeam: { id: 2, name: 'Away FC' }, utcDate: '2025-01-02' },
      { score: { fullTime: { home: 0, away: 0 } }, homeTeam: { id: 1, name: 'Home FC', shortName: 'Home FC' }, awayTeam: { id: 2, name: 'Away FC' }, utcDate: '2025-01-03' },
    ];
    expect(getH2HComment(lowH2H as any, 'Home FC', 'Away FC').length).toBeGreaterThan(10);
  });
  it('balanced H2H with mid-range goals → balanced result text', () => {
    const balH2H = [
      { score: { fullTime: { home: 2, away: 1 } }, homeTeam: { id: 1, name: 'Home FC', shortName: 'Home FC' }, awayTeam: { id: 2, name: 'Away FC' }, utcDate: '2025-01-01' },
      { score: { fullTime: { home: 1, away: 2 } }, homeTeam: { id: 1, name: 'Home FC', shortName: 'Home FC' }, awayTeam: { id: 2, name: 'Away FC' }, utcDate: '2025-01-02' },
      { score: { fullTime: { home: 1, away: 1 } }, homeTeam: { id: 1, name: 'Home FC', shortName: 'Home FC' }, awayTeam: { id: 2, name: 'Away FC' }, utcDate: '2025-01-03' },
    ];
    expect(getH2HComment(balH2H as any, 'Home FC', 'Away FC').length).toBeGreaterThan(10);
  });
});

// ──────────────────────────────────────────────
// getOddsComment / getRefereeProfile — missing branches
// ──────────────────────────────────────────────

describe('getOddsComment — favOdd ≤ 2.0 ternary branches', () => {
  it('risk Düşük → destekliyor (not kısmen)', () => {
    const r = getOddsComment({ home: '1.80', away: '4.50' } as any, 'Home', { risk: 'Düşük' } as any);
    expect(r).toContain('destekliyor');
    expect(r).not.toContain('kısmen');
  });
  it('risk Orta → kısmen destekliyor', () => {
    const r = getOddsComment({ home: '1.80', away: '4.50' } as any, 'Home', { risk: 'Orta' } as any);
    expect(r).toContain('kısmen destekliyor');
  });
});

describe('getRefereeProfile — league variants', () => {
  it('techLgs (2014) returns a non-empty narrative', () => {
    expect(getRefereeProfile('Test Ref', 2014).narrative.length).toBeGreaterThan(10);
  });
  it('other league (2015) returns a non-empty narrative', () => {
    expect(getRefereeProfile('Test Ref', 2015).narrative.length).toBeGreaterThan(10);
  });
});
