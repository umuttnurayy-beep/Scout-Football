jest.mock('../services/api', () => ({}));

import type { FDMatch, SLFormMatch } from '../services/api';
import { transliterate, teamsMatch, parseForm } from '../utils/teamStats';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeFDMatch(homeId: number, home: number | null, away: number | null): FDMatch {
  return {
    id: Math.random(),
    utcDate: '2026-05-01T14:00:00Z',
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
