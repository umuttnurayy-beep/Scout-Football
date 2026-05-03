jest.mock('../services/api', () => ({}));

import type { FDMatch, SLFormMatch } from '../services/api';
import { transliterate, teamsMatch, parseForm, calcSeasonStats, calcSLSeasonStats, normalizeTeamName, getTeamProfile } from '../utils/teamStats';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeFDMatch(homeId: number, home: number | null, away: number | null, utcDate = '2026-05-01T14:00:00Z'): FDMatch {
  return {
    id: Math.random(),
    utcDate,
    status: home != null ? 'FINISHED' : 'SCHEDULED',
    homeTeam: { id: homeId, name: 'Home FC' },
    awayTeam: { id: 99,     name: 'Away FC' },
    score: { fullTime: { home, away } },
  } as FDMatch;
}

function makeSLMatch(homeTeamId: number, homeScore: number | null, awayScore: number | null): SLFormMatch {
  return { homeTeamId, awayTeamId: 99, homeScore, awayScore };
}

// ─── transliterate ────────────────────────────────────────────────────────────

describe('transliterate', () => {
  test('lowercases input', () => {
    expect(transliterate('ARSENAL')).toBe('arsenal');
  });

  test('maps Turkish consonants', () => {
    expect(transliterate('ğşçüö')).toBe('gscuo');
  });

  test('maps uppercase Turkish consonants', () => {
    expect(transliterate('ŞÇÜÖğ')).toBe('scuog');
  });

  test('maps lowercase dotless ı to i', () => {
    expect(transliterate('ışık')).toBe('isik');
  });

  test('collapses multiple spaces and trims', () => {
    expect(transliterate('  A  B  ')).toBe('a b');
  });

  test('leaves ASCII alphanumeric unchanged', () => {
    expect(transliterate('Arsenal123')).toBe('arsenal123');
  });
});

// ─── teamsMatch ───────────────────────────────────────────────────────────────

describe('teamsMatch', () => {
  test('exact name match', () => {
    expect(teamsMatch('Arsenal', 'Arsenal')).toBe(true);
  });

  test('ignores common prefixes (FC, AFC)', () => {
    expect(teamsMatch('Arsenal FC', 'Arsenal')).toBe(true);
    expect(teamsMatch('AFC Bournemouth', 'Bournemouth')).toBe(true);
  });

  test('one name contains the other', () => {
    expect(teamsMatch('Manchester City', 'Manchester')).toBe(true);
  });

  test('completely different teams do not match', () => {
    expect(teamsMatch('Arsenal', 'Liverpool')).toBe(false);
  });
});

// ─── parseForm (FD path) ──────────────────────────────────────────────────────

describe('parseForm — FD path (isSL=false)', () => {
  const teamId = 57;

  test('returns empty array for no finished matches', () => {
    const m = makeFDMatch(teamId, null, null);
    expect(parseForm([m], teamId, false)).toEqual([]);
  });

  test('Win when home team scores more', () => {
    const m = makeFDMatch(teamId, 2, 0);
    expect(parseForm([m], teamId, false)).toEqual(['G']);
  });

  test('Draw when scores are equal', () => {
    const m = makeFDMatch(teamId, 1, 1);
    expect(parseForm([m], teamId, false)).toEqual(['B']);
  });

  test('Loss when home team scores fewer', () => {
    const m = makeFDMatch(teamId, 0, 3);
    expect(parseForm([m], teamId, false)).toEqual(['M']);
  });

  test('Away perspective: Win when away scores more', () => {
    // teamId is away team (id=99), home scored 1 away scored 2 → Win for teamId
    const m = makeFDMatch(57, 1, 2);
    expect(parseForm([m], 99, false)).toEqual(['G']);
  });

  test('slices to last 5 matches', () => {
    const wins = Array.from({ length: 7 }, (_, i) => makeFDMatch(teamId, i + 1, 0));
    const result = parseForm(wins, teamId, false);
    expect(result).toHaveLength(5);
    expect(result.every(r => r === 'G')).toBe(true);
  });

  test('skips unfinished matches (null score)', () => {
    const finished = makeFDMatch(teamId, 2, 1);
    const pending  = makeFDMatch(teamId, null, null);
    expect(parseForm([pending, finished], teamId, false)).toEqual(['G']);
  });

  test('mixed G/B/M sequence', () => {
    const matches = [
      makeFDMatch(teamId, 2, 0),  // G
      makeFDMatch(teamId, 1, 1),  // B
      makeFDMatch(teamId, 0, 2),  // M
    ];
    expect(parseForm(matches, teamId, false)).toEqual(['G', 'B', 'M']);
  });

  test('sorts by utcDate before slicing — reverse-order input gives correct last 5', () => {
    // newest-first input: the 6th oldest match is a loss (M), last 5 are all wins (G)
    const matches = [
      makeFDMatch(teamId, 3, 0, '2026-05-06T14:00:00Z'), // newest  → G (kept, pos 5)
      makeFDMatch(teamId, 2, 0, '2026-05-05T14:00:00Z'), //          → G (kept, pos 4)
      makeFDMatch(teamId, 1, 0, '2026-05-04T14:00:00Z'), //          → G (kept, pos 3)
      makeFDMatch(teamId, 1, 0, '2026-05-03T14:00:00Z'), //          → G (kept, pos 2)
      makeFDMatch(teamId, 1, 0, '2026-05-02T14:00:00Z'), //          → G (kept, pos 1)
      makeFDMatch(teamId, 0, 3, '2026-05-01T14:00:00Z'), // oldest   → M (dropped)
    ];
    const result = parseForm(matches, teamId, false);
    expect(result).toHaveLength(5);
    expect(result.every(r => r === 'G')).toBe(true);
  });
});

// ─── parseForm (SL path) ──────────────────────────────────────────────────────

describe('parseForm — SL path (isSL=true)', () => {
  const teamId = 133804;

  test('Win when homeScore > awayScore and team is home', () => {
    expect(parseForm([makeSLMatch(teamId, 3, 1)], teamId, true)).toEqual(['G']);
  });

  test('Draw when scores equal', () => {
    expect(parseForm([makeSLMatch(teamId, 2, 2)], teamId, true)).toEqual(['B']);
  });

  test('Loss when homeScore < awayScore and team is home', () => {
    expect(parseForm([makeSLMatch(teamId, 0, 1)], teamId, true)).toEqual(['M']);
  });

  test('Away perspective: Win when away scores more', () => {
    // teamId is away (awayTeamId=99 in helper, but homeTeamId=133804 means opponent is home)
    // If homeTeamId !== teamId: gf = awayScore, ga = homeScore
    const m = makeSLMatch(133804, 1, 3);
    expect(parseForm([m], 99, true)).toEqual(['G']);
  });

  test('null scores treated as 0 → Draw', () => {
    expect(parseForm([makeSLMatch(teamId, null, null)], teamId, true)).toEqual(['B']);
  });

  test('does not slice to 5 (SL path returns all)', () => {
    const wins = Array.from({ length: 8 }, () => makeSLMatch(teamId, 2, 0));
    expect(parseForm(wins, teamId, true)).toHaveLength(8);
  });

  test('empty match list returns empty array', () => {
    expect(parseForm([], teamId, true)).toEqual([]);
  });
});

// ─── calcSeasonStats ─────────────────────────────────────────────────────────

describe('calcSeasonStats', () => {
  const HOME = 57; // team under test plays as home
  const AWAY = 99; // fixed away opponent id in makeFDMatch

  function fdHome(h: number, a: number) { return makeFDMatch(HOME, h, a); }
  function fdAway(h: number, a: number) { return makeFDMatch(AWAY, h, a); } // team is away (id=HOME not in homeTeam)

  test('returns null for empty match list', () => {
    expect(calcSeasonStats([], HOME)).toBeNull();
  });

  test('returns null when all matches are unfinished', () => {
    expect(calcSeasonStats([makeFDMatch(HOME, null, null)], HOME)).toBeNull();
  });

  test('total equals number of finished matches', () => {
    const r = calcSeasonStats([fdHome(2, 1), makeFDMatch(HOME, null, null)], HOME);
    expect(r?.total).toBe(1);
  });

  test('home win 2-1: correct record and averages', () => {
    const r = calcSeasonStats([fdHome(2, 1)], HOME)!;
    expect(r.home).toEqual({ played: 1, win: 1, draw: 0, loss: 0 });
    expect(r.away).toEqual({ played: 0, win: 0, draw: 0, loss: 0 });
    expect(r.avgGF).toBe('2.0');
    expect(r.avgGA).toBe('1.0');
  });

  test('home draw 1-1: draw recorded, BTTS', () => {
    const r = calcSeasonStats([fdHome(1, 1)], HOME)!;
    expect(r.home).toEqual({ played: 1, win: 0, draw: 1, loss: 0 });
    expect(r.bttsPct).toBe(100);
  });

  test('home loss 0-2: loss recorded, failed to score', () => {
    const r = calcSeasonStats([fdHome(0, 2)], HOME)!;
    expect(r.home).toEqual({ played: 1, win: 0, draw: 0, loss: 1 });
    expect(r.failedToScorePct).toBe(100);
  });

  test('clean sheet: ga=0 → cleanSheetPct 100', () => {
    const r = calcSeasonStats([fdHome(1, 0)], HOME)!;
    expect(r.cleanSheetPct).toBe(100);
    expect(r.bttsPct).toBe(0);
  });

  test('away perspective: win when away team scores more', () => {
    // makeFDMatch(AWAY, 1, 2) → homeTeam.id=AWAY, awayTeam.id=99
    // team HOME is NOT in this match at all — need team as away
    // makeFDMatch(AWAY, 1, 2) and teamId=AWAY means home perspective for AWAY team
    // For HOME team as away: use makeFDMatch(99, 1, 3) where HOME=57≠homeTeam.id=99
    const m = makeFDMatch(AWAY, 1, 3); // homeTeam=99(AWAY), awayTeam=99 also? no — awayTeam id is always 99 in helper
    // Actually for HOME=57 as away: homeTeam.id must NOT be 57
    // makeFDMatch sets homeTeam.id=homeId and awayTeam.id=99
    // So for HOME=57 as away team: homeId != 57, e.g. homeId=10, awayTeam.id=99 ≠ 57, so HOME(57) is neither → but that's wrong
    // The correct approach: HOME team plays as away when awayTeam.id === HOME
    // But the helper always sets awayTeam.id=99. So test away with teamId=99:
    const away = makeFDMatch(HOME, 1, 3); // homeTeam=57, awayTeam=99; for teamId=99: away match, gf=3, ga=1
    const r = calcSeasonStats([away], AWAY)!;
    expect(r.away).toEqual({ played: 1, win: 1, draw: 0, loss: 0 });
    expect(r.avgGF).toBe('3.0');
    expect(r.avgGA).toBe('1.0');
  });

  test('over 1.5/2.5/3.5 thresholds', () => {
    const m1 = fdHome(1, 1); // 2 goals → over1.5 only
    const m2 = fdHome(2, 1); // 3 goals → over1.5 + over2.5
    const m3 = fdHome(3, 2); // 5 goals → all three
    const r = calcSeasonStats([m1, m2, m3], HOME)!;
    expect(r.over15Pct).toBe(100);
    expect(r.over25Pct).toBe(Math.round(2 / 3 * 100));
    expect(r.over35Pct).toBe(Math.round(1 / 3 * 100));
  });

  test('mixed home and away record', () => {
    const r = calcSeasonStats([
      fdHome(2, 0),          // home win, clean sheet
      fdHome(1, 1),          // home draw
      makeFDMatch(HOME, 0, 1), // home loss, failed to score
    ], HOME)!;
    expect(r.home).toEqual({ played: 3, win: 1, draw: 1, loss: 1 });
    expect(r.total).toBe(3);
    expect(r.cleanSheetPct).toBe(Math.round(1 / 3 * 100));
    expect(r.failedToScorePct).toBe(Math.round(1 / 3 * 100));
  });
});

// ─── calcSLSeasonStats ────────────────────────────────────────────────────────

describe('calcSLSeasonStats', () => {
  const TEAM = 133804;

  test('returns null for empty list', () => {
    expect(calcSLSeasonStats([], TEAM)).toBeNull();
  });

  test('returns null when all scores are null', () => {
    expect(calcSLSeasonStats([makeSLMatch(TEAM, null, null)], TEAM)).toBeNull();
  });

  test('home win 2-0: correct record + clean sheet', () => {
    const r = calcSLSeasonStats([makeSLMatch(TEAM, 2, 0)], TEAM)!;
    expect(r.home).toEqual({ played: 1, win: 1, draw: 0, loss: 0 });
    expect(r.cleanSheetPct).toBe(100);
    expect(r.avgGF).toBe('2.0');
    expect(r.avgGA).toBe('0.0');
  });

  test('away win when team is away: gf = awayScore', () => {
    const m = makeSLMatch(99, 1, 3); // opponent home, TEAM away; gf=3, ga=1
    const r = calcSLSeasonStats([m], TEAM)!;
    expect(r.away).toEqual({ played: 1, win: 1, draw: 0, loss: 0 });
    expect(r.avgGF).toBe('3.0');
  });

  test('BTTS when both teams score', () => {
    const r = calcSLSeasonStats([makeSLMatch(TEAM, 2, 1)], TEAM)!;
    expect(r.bttsPct).toBe(100);
  });

  test('over thresholds', () => {
    const r = calcSLSeasonStats([
      makeSLMatch(TEAM, 1, 1), // 2 goals
      makeSLMatch(TEAM, 2, 1), // 3 goals
      makeSLMatch(TEAM, 3, 2), // 5 goals
    ], TEAM)!;
    expect(r.over15Pct).toBe(100);
    expect(r.over25Pct).toBe(Math.round(2 / 3 * 100));
    expect(r.over35Pct).toBe(Math.round(1 / 3 * 100));
  });

  test('failed to score when gf=0', () => {
    const r = calcSLSeasonStats([makeSLMatch(TEAM, 0, 2)], TEAM)!;
    expect(r.failedToScorePct).toBe(100);
    expect(r.cleanSheetPct).toBe(0);
  });
});

// ─── normalizeTeamName ────────────────────────────────────────────────────────

describe('normalizeTeamName', () => {
  test('lowercases and strips FC prefix', () => {
    expect(normalizeTeamName('Arsenal FC')).toBe('arsenal');
  });

  test('strips AFC prefix', () => {
    expect(normalizeTeamName('AFC Bournemouth')).toBe('bournemouth');
  });

  test('strips SC and CF tokens', () => {
    expect(normalizeTeamName('SC Freiburg')).toBe('freiburg');
    expect(normalizeTeamName('Cádiz CF')).toBe('cdiz');
  });

  test('removes non-alphanumeric characters', () => {
    expect(normalizeTeamName("Brighton & Hove Albion")).toBe('brighton hove albion');
  });

  test('collapses multiple spaces', () => {
    expect(normalizeTeamName('Manchester  City')).toBe('manchester city');
  });

  test('plain name passes through lowercased', () => {
    expect(normalizeTeamName('Liverpool')).toBe('liverpool');
  });
});

// ─── getTeamProfile ───────────────────────────────────────────────────────────

describe('getTeamProfile', () => {
  test('Dominant: avgGf ≥ 2.0 and avgGa ≤ 1.0', () => {
    const p = getTeamProfile(2.0, 1.0, 60, false);
    expect(p.label).toBe('Dominant');
    expect(p.emoji).toBe('👑');
  });

  test('Tempolu: total goals > 3.2 (not Dominant)', () => {
    // avgGf=2.0, avgGa=1.3 → total=3.3>3.2, but NOT dominant (ga>1.0)
    const p = getTeamProfile(2.0, 1.3, 50, false);
    expect(p.label).toBe('Tempolu');
  });

  test('Hücumcu: avgGf ≥ 1.8 and avgGa ≥ 1.4 (total ≤ 3.2)', () => {
    const p = getTeamProfile(1.8, 1.4, 50, false);
    expect(p.label).toBe('Hücumcu');
  });

  test('Katı Savunmacı: avgGf ≤ 1.0 and avgGa ≤ 0.8', () => {
    const p = getTeamProfile(0.9, 0.7, 40, false);
    expect(p.label).toBe('Katı Savunmacı');
  });

  test('Savunmacı: avgGf ≤ 1.2 and avgGa ≤ 1.0 (but not Katı)', () => {
    const p = getTeamProfile(1.1, 1.0, 40, false);
    expect(p.label).toBe('Savunmacı');
  });

  test('Kırılgan Savunma: avgGa > 1.7 when total tempo does not dominate', () => {
    const p = getTeamProfile(1.3, 1.8, 45, false);
    expect(p.label).toBe('Kırılgan Savunma');
  });

  test('Kontrollü: winPct ≥ 55 and avgGf ≥ 1.5', () => {
    const p = getTeamProfile(1.6, 1.2, 55, false);
    expect(p.label).toBe('Kontrollü');
  });

  test('Dengeli: catch-all default', () => {
    const p = getTeamProfile(1.3, 1.1, 45, false);
    expect(p.label).toBe('Dengeli');
  });

  test('isDark changes color for Dominant', () => {
    const light = getTeamProfile(2.0, 1.0, 60, false);
    const dark  = getTeamProfile(2.0, 1.0, 60, true);
    expect(light.color).not.toBe(dark.color);
  });
});
