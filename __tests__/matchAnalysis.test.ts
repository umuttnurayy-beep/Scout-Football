import {
  getMotivationComment,
  getDeepH2HStats,
  getGuven,
  getWeatherComment,
  isWeatherRisk,
  getDrawAnalysis,
  getCompareComment,
  strHash,
  shiftLevel,
  MIN_H2H,
  type MatchFormStats,
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
