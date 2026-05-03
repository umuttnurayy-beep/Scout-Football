import {
  arrayOrEmpty,
  isRecord,
  isStanding,
  normalizeNextPreview,
  standingsMapOrEmpty,
  standingsOrEmpty,
} from '../services/apiNormalizers';

describe('api normalizers', () => {
  it('keeps arrays and safely drops non-arrays', () => {
    expect(arrayOrEmpty([1, 2])).toEqual([1, 2]);
    expect(arrayOrEmpty(null)).toEqual([]);
    expect(arrayOrEmpty({ 0: 'A' })).toEqual([]);
  });

  it('detects plain records but rejects null and arrays', () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
  });

  it('accepts only standings with required numeric fields', () => {
    const valid = { team: 'Arsenal', pos: 1, played: 35, pts: 82 };
    expect(isStanding(valid)).toBe(true);
    expect(isStanding({ ...valid, pos: '1' })).toBe(false);
    expect(isStanding({ ...valid, team: null })).toBe(false);
  });

  it('filters malformed standings rows and invalid league keys', () => {
    const rows = [
      { team: 'Liverpool', pos: 1, played: 35, pts: 82 },
      { team: 'Broken', pos: '2', played: 35, pts: 80 },
      null,
    ];

    expect(standingsOrEmpty(rows)).toEqual([{ team: 'Liverpool', pos: 1, played: 35, pts: 82 }]);
    expect(standingsOrEmpty({ rows })).toEqual([]);
    expect(standingsMapOrEmpty({
      2021: rows,
      nope: [{ team: 'Ignored', pos: 1, played: 1, pts: 3 }],
      203: 'bad rows',
    })).toEqual({
      2021: [{ team: 'Liverpool', pos: 1, played: 35, pts: 82 }],
      203: [],
    });
  });

  it('normalizes valid next preview payloads and clamps invalid source values', () => {
    expect(normalizeNextPreview({
      date: '2026-05-04',
      matches: [{ id: 1 }],
      superLigMatches: [{ id: 2 }],
      featuredMatchId: 44,
      source: 'stale',
    })).toEqual({
      date: '2026-05-04',
      matches: [{ id: 1 }],
      superLigMatches: [{ id: 2 }],
      featuredMatchId: 44,
      source: 'stale',
    });

    expect(normalizeNextPreview({
      date: '2026-05-04',
      matches: [],
      superLigMatches: [],
      featuredMatchId: '44',
      source: 'unknown',
    })).toEqual({
      date: '2026-05-04',
      matches: [],
      superLigMatches: [],
      featuredMatchId: null,
      source: null,
    });
  });

  it('drops malformed next preview payloads', () => {
    expect(normalizeNextPreview(null)).toBeNull();
    expect(normalizeNextPreview({ date: '2026-05-04', matches: null, superLigMatches: [] })).toBeNull();
    expect(normalizeNextPreview({ matches: [], superLigMatches: [] })).toBeNull();
  });
});
