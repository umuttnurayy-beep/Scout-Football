jest.mock('../services/api', () => ({}));

import {
  groupTies,
  tieResult,
  getTagColor,
  getLeagueCharacter,
  computeLeagueStats,
  getTeamLabel,
  type UCLTie,
  type Level,
  type LeagueStanding,
} from '../utils/leagueAnalysis';

// ─── test helpers ─────────────────────────────────────────────────────────────

function makeFDMatch(overrides: {
  id?: number;
  homeId?: number; homeName?: string; homeShort?: string;
  awayId?: number; awayName?: string; awayShort?: string;
  homeScore?: number | null; awayScore?: number | null;
  utcDate?: string;
} = {}): any {
  return {
    id:          overrides.id ?? 1,
    utcDate:     overrides.utcDate ?? '2026-04-10T19:00:00Z',
    homeTeam:    { id: overrides.homeId ?? 1, name: overrides.homeName ?? 'Home FC', shortName: overrides.homeShort ?? 'Home' },
    awayTeam:    { id: overrides.awayId ?? 2, name: overrides.awayName ?? 'Away FC', shortName: overrides.awayShort ?? 'Away' },
    score:       {
      fullTime: {
        home: overrides.homeScore !== undefined ? overrides.homeScore : null,
        away: overrides.awayScore !== undefined ? overrides.awayScore : null,
      },
    },
    competition: { id: 2001, name: 'UCL' },
    status:      overrides.homeScore !== null ? 'FINISHED' : 'SCHEDULED',
  };
}

function makeStanding(overrides: Partial<LeagueStanding> = {}): LeagueStanding {
  return {
    pos:    1,
    team:   'Test FC',
    teamId: 100,
    played: 20,
    win:    12,
    draw:   3,
    loss:   5,
    gf:     35,
    ga:     18,
    pts:    39,
    ...overrides,
  };
}

// ─── groupTies ────────────────────────────────────────────────────────────────

describe('groupTies', () => {
  test('returns empty array for empty input', () => {
    expect(groupTies([])).toEqual([]);
  });

  test('returns single-leg tie when no return match', () => {
    const m = makeFDMatch({ homeId: 1, awayId: 2 });
    const result = groupTies([m]);
    expect(result).toHaveLength(1);
    expect(result[0].leg1).toBe(m);
    expect(result[0].leg2).toBeNull();
  });

  test('pairs two legs by reversed team IDs', () => {
    const leg1 = makeFDMatch({ id: 10, homeId: 1, awayId: 2, utcDate: '2026-03-01T19:00:00Z' });
    const leg2 = makeFDMatch({ id: 20, homeId: 2, awayId: 1, utcDate: '2026-03-15T19:00:00Z' });
    const result = groupTies([leg1, leg2]);
    expect(result).toHaveLength(1);
    expect(result[0].leg2).not.toBeNull();
  });

  test('leg1 is always the earlier match', () => {
    const early = makeFDMatch({ id: 10, homeId: 1, awayId: 2, utcDate: '2026-03-01T19:00:00Z' });
    const late  = makeFDMatch({ id: 20, homeId: 2, awayId: 1, utcDate: '2026-03-15T19:00:00Z' });
    // Pass in reverse order
    const result = groupTies([late, early]);
    expect(result[0].leg1.id).toBe(10); // early match is leg1
    expect(result[0].leg2!.id).toBe(20);
  });

  test('handles two separate ties in same input', () => {
    const tie1leg1 = makeFDMatch({ id: 1, homeId: 11, awayId: 12, utcDate: '2026-03-01T19:00:00Z' });
    const tie1leg2 = makeFDMatch({ id: 2, homeId: 12, awayId: 11, utcDate: '2026-03-15T19:00:00Z' });
    const tie2leg1 = makeFDMatch({ id: 3, homeId: 21, awayId: 22, utcDate: '2026-03-02T19:00:00Z' });
    const tie2leg2 = makeFDMatch({ id: 4, homeId: 22, awayId: 21, utcDate: '2026-03-16T19:00:00Z' });
    const result = groupTies([tie1leg1, tie1leg2, tie2leg1, tie2leg2]);
    expect(result).toHaveLength(2);
    expect(result.every(t => t.leg2 !== null)).toBe(true);
  });

  test('does not pair teams from different matchups', () => {
    const a = makeFDMatch({ id: 1, homeId: 1, awayId: 2 });
    const b = makeFDMatch({ id: 2, homeId: 3, awayId: 4 });
    const result = groupTies([a, b]);
    expect(result).toHaveLength(2);
    expect(result[0].leg2).toBeNull();
    expect(result[1].leg2).toBeNull();
  });
});

// ─── tieResult ────────────────────────────────────────────────────────────────

describe('tieResult', () => {
  test('single leg with scores: winner by score', () => {
    const m = makeFDMatch({ homeId: 1, awayId: 2, homeShort: 'Arsenal', awayShort: 'Bayern', homeScore: 2, awayScore: 1 });
    const r = tieResult({ leg1: m, leg2: null });
    expect(r.homeAgg).toBe(2);
    expect(r.awayAgg).toBe(1);
    expect(r.winner).toBe('Arsenal');
  });

  test('single leg with null scores: winner=null, agg=0', () => {
    const m = makeFDMatch({ homeId: 1, awayId: 2, homeScore: null, awayScore: null });
    const r = tieResult({ leg1: m, leg2: null });
    expect(r.winner).toBeNull();
    expect(r.homeAgg).toBe(0);
    expect(r.awayAgg).toBe(0);
  });

  test('two-leg tie: homeAgg = l1h + l2a, awayAgg = l1a + l2h', () => {
    // leg1: Arsenal(home) 2–0 Bayern | leg2: Bayern(home) 1–2 Arsenal
    // l1h=2, l1a=0, l2h=1, l2a=2
    // homeAgg = l1h + l2a = 2 + 2 = 4
    // awayAgg = l1a + l2h = 0 + 1 = 1
    const leg1 = makeFDMatch({ id: 1, homeId: 1, awayId: 2, homeShort: 'Arsenal', awayShort: 'Bayern', homeScore: 2, awayScore: 0 });
    const leg2 = makeFDMatch({ id: 2, homeId: 2, awayId: 1, homeShort: 'Bayern',  awayShort: 'Arsenal', homeScore: 1, awayScore: 2 });
    const r = tieResult({ leg1, leg2 });
    expect(r.homeAgg).toBe(4); // 2 + 2
    expect(r.awayAgg).toBe(1); // 0 + 1
    expect(r.winner).toBe('Arsenal');
  });

  test('two-leg aggregate draw: winner=null', () => {
    // leg1: A 1-0 B, leg2: B 1-0 A
    // homeAgg = l1h + l2a = 1 + 0 = 1
    // awayAgg = l1a + l2h = 0 + 1 = 1 → draw
    const leg1 = makeFDMatch({ id: 1, homeId: 1, awayId: 2, homeShort: 'Arsenal', awayShort: 'Bayern', homeScore: 1, awayScore: 0 });
    const leg2 = makeFDMatch({ id: 2, homeId: 2, awayId: 1, homeShort: 'Bayern',  awayShort: 'Arsenal', homeScore: 1, awayScore: 0 });
    const r = tieResult({ leg1, leg2 });
    expect(r.homeAgg).toBe(1); // 1 + 0
    expect(r.awayAgg).toBe(1); // 0 + 1
    expect(r.winner).toBeNull();
  });

  test('two-leg: away team wins on aggregate', () => {
    // leg1: A 0-2 B, leg2: B 1-0 A
    // homeAgg = l1h + l2a = 0 + 0 = 0, awayAgg = l1a + l2h = 2 + 1 = 3 → B wins
    const leg1 = makeFDMatch({ id: 1, homeId: 1, awayId: 2, homeShort: 'Arsenal', awayShort: 'Bayern', homeScore: 0, awayScore: 2 });
    const leg2 = makeFDMatch({ id: 2, homeId: 2, awayId: 1, homeShort: 'Bayern',  awayShort: 'Arsenal', homeScore: 1, awayScore: 0 });
    const r = tieResult({ leg1, leg2 });
    expect(r.homeAgg).toBe(0);
    expect(r.awayAgg).toBe(3);
    expect(r.winner).toBe('Bayern');
  });

  test('two-leg with null scores: winner=null', () => {
    const leg1 = makeFDMatch({ id: 1, homeId: 1, awayId: 2, homeScore: null, awayScore: null });
    const leg2 = makeFDMatch({ id: 2, homeId: 2, awayId: 1, homeScore: null, awayScore: null });
    const r = tieResult({ leg1, leg2 });
    expect(r.winner).toBeNull();
    expect(r.homeAgg).toBe(0);
    expect(r.awayAgg).toBe(0);
  });
});

// ─── getTagColor ──────────────────────────────────────────────────────────────

describe('getTagColor', () => {
  test('Yüksek → red palette', () => {
    const cp = getTagColor('Yüksek', false);
    expect(cp.color).toBe('#A32D2D');
    expect(cp.bg).toBe('#FDE8E8');
  });

  test('Orta → yellow palette', () => {
    const cp = getTagColor('Orta', false);
    expect(cp.color).toBe('#E6A817');
    expect(cp.bg).toBe('#FFF8E1');
  });

  test('Düşük → gray palette', () => {
    const cp = getTagColor('Düşük', false);
    expect(cp.color).toBe('#666');
    expect(cp.bg).toBe('#f0f0f0');
  });

  test('isDark=true returns dark variants', () => {
    const light = getTagColor('Yüksek', false);
    const dark  = getTagColor('Yüksek', true);
    expect(dark.color).not.toBe(light.color);
    expect(dark.bg).not.toBe(light.bg);
  });

  test('dark red for Yüksek', () => {
    const cp = getTagColor('Yüksek', true);
    expect(cp.color).toBe('#F85149');
    expect(cp.bg).toBe('#3D0F0F');
  });
});

// ─── getLeagueCharacter ───────────────────────────────────────────────────────

describe('getLeagueCharacter', () => {
  test('avgGoals >= 3.0 → "Hücum Ağırlıklı"', () => {
    const lc = getLeagueCharacter(3.2, 0.20);
    expect(lc.label).toBe('Hücum Ağırlıklı');
    expect(lc.gol).toBe('Yüksek');
    expect(lc.stil).toBe('Hücumcu');
  });

  test('avgGoals < 2.0 + drawRate >= 0.28 → "Savunma & Sıkışık"', () => {
    const lc = getLeagueCharacter(1.8, 0.30);
    expect(lc.label).toBe('Savunma & Sıkışık');
    expect(lc.gol).toBe('Düşük');
    expect(lc.stil).toBe('Savunmacı');
  });

  test('avgGoals < 2.0 + drawRate < 0.28 → "Savunma Ağırlıklı"', () => {
    const lc = getLeagueCharacter(1.7, 0.20);
    expect(lc.label).toBe('Savunma Ağırlıklı');
  });

  test('drawRate >= 0.30 (avg not too low) → "Beraberlik Eğilimli"', () => {
    const lc = getLeagueCharacter(2.3, 0.32);
    expect(lc.label).toBe('Beraberlik Eğilimli');
    expect(lc.risk).toBe('Yüksek');
  });

  test('avgGoals >= 2.5 + drawRate <= 0.24 → "Hücumcu & Sonuç Odaklı"', () => {
    const lc = getLeagueCharacter(2.7, 0.22);
    expect(lc.label).toBe('Hücumcu & Sonuç Odaklı');
  });

  test('middle range without special conditions → "Dengeli"', () => {
    const lc = getLeagueCharacter(2.3, 0.26);
    expect(lc.label).toBe('Dengeli');
    expect(lc.stil).toBe('Dengeli');
  });

  test('gol level thresholds', () => {
    expect(getLeagueCharacter(3.0, 0.20).gol).toBe('Yüksek');  // >= 2.8
    expect(getLeagueCharacter(2.5, 0.20).gol).toBe('Orta');    // >= 2.2
    expect(getLeagueCharacter(2.3, 0.20).gol).toBe('Orta');    // >= 2.2
    expect(getLeagueCharacter(1.9, 0.20).gol).toBe('Düşük');   // < 2.2
  });

  test('tempo level thresholds', () => {
    expect(getLeagueCharacter(3.0, 0.20).tempo).toBe('Yüksek'); // >= 2.7
    expect(getLeagueCharacter(2.5, 0.20).tempo).toBe('Orta');   // >= 2.2
    expect(getLeagueCharacter(1.9, 0.20).tempo).toBe('Düşük');  // < 2.2
  });

  test('risk level thresholds', () => {
    expect(getLeagueCharacter(2.5, 0.30).risk).toBe('Yüksek'); // drawRate >= 0.30
    expect(getLeagueCharacter(2.5, 0.27).risk).toBe('Orta');   // drawRate >= 0.25
    expect(getLeagueCharacter(2.5, 0.20).risk).toBe('Düşük');  // drawRate < 0.25
  });

  test('returns correct structure shape', () => {
    const lc = getLeagueCharacter(2.5, 0.25);
    expect(typeof lc.label).toBe('string');
    expect(typeof lc.color).toBe('string');
    expect(typeof lc.bg).toBe('string');
    expect(Array.isArray(lc.traits)).toBe(true);
    expect(typeof lc.rec).toBe('string');
    expect(typeof lc.ozet).toBe('string');
  });
});

// ─── computeLeagueStats ───────────────────────────────────────────────────────

describe('computeLeagueStats', () => {
  const standings: LeagueStanding[] = [
    makeStanding({ pos: 1, team: 'A', played: 20, win: 15, draw: 3, loss: 2, gf: 50, ga: 15, pts: 48 }),
    makeStanding({ pos: 2, team: 'B', played: 20, win: 12, draw: 4, loss: 4, gf: 40, ga: 20, pts: 40 }),
    makeStanding({ pos: 3, team: 'C', played: 20, win: 10, draw: 5, loss: 5, gf: 35, ga: 25, pts: 35 }),
    makeStanding({ pos: 4, team: 'D', played: 20, win:  5, draw: 5, loss: 10, gf: 20, ga: 40, pts: 20 }),
  ];

  test('calculates avgGoals correctly', () => {
    // totalGames = sum(played)/2 = 80/2 = 40
    // totalGoals = gf sum = 145
    // avgGoals = 145/40 = 3.625 — but wait, totalGames is matches, totalGoals includes both home+away of same match
    // Actually it's just sum of all gf over total games
    const r = computeLeagueStats(standings, false);
    const totalGames = standings.reduce((s, t) => s + t.played, 0) / 2;
    const totalGoals = standings.reduce((s, t) => s + t.gf, 0);
    expect(r.avgGoals).toBeCloseTo(totalGoals / totalGames, 5);
  });

  test('leader is first standing entry', () => {
    const r = computeLeagueStats(standings, false);
    expect(r.leader?.team).toBe('A');
  });

  test('leaderGap = leader.pts - second.pts', () => {
    const r = computeLeagueStats(standings, false);
    expect(r.leaderGap).toBe(48 - 40); // 8
  });

  test('drawRate = (totalDraws/2) / totalGames', () => {
    const r = computeLeagueStats(standings, false);
    const totalGames = standings.reduce((s, t) => s + t.played, 0) / 2;
    const totalDraws = standings.reduce((s, t) => s + t.draw, 0) / 2;
    expect(r.drawRate).toBeCloseTo(totalDraws / totalGames, 5);
  });

  test('attackScore for highest scorer = 10', () => {
    const r = computeLeagueStats(standings, false);
    // Team A has highest gf/played
    const aScore = r.attackScore(standings[0]);
    expect(aScore).toBeCloseTo(10, 5);
  });

  test('attackScore for lowest scorer = 1', () => {
    const r = computeLeagueStats(standings, false);
    const dScore = r.attackScore(standings[3]); // Team D has lowest gf
    expect(dScore).toBeCloseTo(1, 5);
  });

  test('defenseScore for best defense = 10', () => {
    const r = computeLeagueStats(standings, false);
    // Team A allows fewest goals
    expect(r.defenseScore(standings[0])).toBeCloseTo(10, 5);
  });

  test('defenseScore for worst defense = 1', () => {
    const r = computeLeagueStats(standings, false);
    // Team D allows most goals
    expect(r.defenseScore(standings[3])).toBeCloseTo(1, 5);
  });

  test('ligChar is set when standings non-empty', () => {
    const r = computeLeagueStats(standings, false);
    expect(r.ligChar).not.toBeNull();
    expect(typeof r.ligChar?.label).toBe('string');
  });

  test('goalScore and tempoScore are between 0 and 100', () => {
    const r = computeLeagueStats(standings, false);
    expect(r.goalScore).toBeGreaterThanOrEqual(0);
    expect(r.goalScore).toBeLessThanOrEqual(100);
    expect(r.tempoScore).toBeGreaterThanOrEqual(0);
    expect(r.tempoScore).toBeLessThanOrEqual(100);
  });

  test('mostGoals is the team with highest gf/played', () => {
    const r = computeLeagueStats(standings, false);
    expect(r.mostGoals?.team).toBe('A');
  });

  test('bestDef is the team with lowest ga/played', () => {
    const r = computeLeagueStats(standings, false);
    expect(r.bestDef?.team).toBe('A');
  });

  test('returns sensible defaults for empty standings', () => {
    const r = computeLeagueStats([], false);
    expect(r.avgGoals).toBe(0);
    expect(r.leader).toBeNull();
    expect(r.ligChar).toBeNull();
    expect(r.liderTags).toEqual([]);
  });
});

// ─── getTeamLabel ─────────────────────────────────────────────────────────────

describe('getTeamLabel', () => {
  // params: gfPer, gaPer, winRate, pos, total, avgGfPer, avgGaPer, isDark?
  const avg = { gfPer: 1.5, gaPer: 1.2 };

  test('returns "Formda" when winRate >= 0.60', () => {
    expect(getTeamLabel(1.5, 1.2, 0.60, 1, 20, avg.gfPer, avg.gaPer).label).toBe('Formda');
    expect(getTeamLabel(1.5, 1.2, 0.75, 1, 20, avg.gfPer, avg.gaPer).label).toBe('Formda');
  });

  test('returns "Hücumcu & Kırılgan" when gf >= 1.25x avg AND ga >= 1.15x avg', () => {
    // gfPer=1.5*1.25=1.875, gaPer=1.2*1.15=1.38
    expect(getTeamLabel(1.9, 1.4, 0.40, 5, 20, avg.gfPer, avg.gaPer).label).toBe('Hücumcu & Kırılgan');
  });

  test('returns "Hücumcu" when gf >= 1.20x avg but ga < 1.15x avg', () => {
    // gfPer=1.5*1.20=1.80 needed, gaPer below 1.38
    expect(getTeamLabel(1.85, 1.1, 0.40, 5, 20, avg.gfPer, avg.gaPer).label).toBe('Hücumcu');
  });

  test('returns "Savunmacı" when gaPer <= 0.80x avg', () => {
    // gaPer=1.2*0.80=0.96
    expect(getTeamLabel(1.2, 0.9, 0.40, 5, 20, avg.gfPer, avg.gaPer).label).toBe('Savunmacı');
  });

  test('returns "Dengesiz" when winRate < 0.25 and pos > 60% of total', () => {
    // pos=14 > 20*0.60=12
    expect(getTeamLabel(1.0, 1.5, 0.20, 14, 20, avg.gfPer, avg.gaPer).label).toBe('Dengesiz');
  });

  test('returns "Dengeli" for average stats', () => {
    expect(getTeamLabel(1.5, 1.2, 0.45, 8, 20, avg.gfPer, avg.gaPer).label).toBe('Dengeli');
  });

  test('Formda check takes priority over Hücumcu when winRate >= 0.60', () => {
    // High gfPer would trigger Hücumcu but winRate >= 0.60 returns Formda first
    expect(getTeamLabel(2.5, 1.0, 0.65, 1, 20, avg.gfPer, avg.gaPer).label).toBe('Formda');
  });

  test('returns a label with a color property', () => {
    const r = getTeamLabel(1.5, 1.2, 0.45, 8, 20, avg.gfPer, avg.gaPer);
    expect(typeof r.label).toBe('string');
    expect(typeof r.color).toBe('string');
  });
});
