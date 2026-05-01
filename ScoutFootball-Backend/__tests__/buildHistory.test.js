const { createBuildHistory } = require('../utils/buildHistory');

const baseEntry = {
  date: '2026-05-01',
  generatedAt: '2026-05-01T12:00:00.000Z',
  matchCount: 10,
  issues: [],
  sourceWarnings: [],
  sourceSeverity: null,
  stale: false,
  featuredMatchId: 77,
  nextPreviewDate: '2026-05-02',
  nextPreviewFeaturedMatchId: 88,
  nextPreviewSource: 'fresh',
};

describe('createBuildHistory', () => {
  test('records entries and returns them in order', () => {
    const h = createBuildHistory();
    h.record({ ...baseEntry, date: '2026-05-01' });
    h.record({ ...baseEntry, date: '2026-05-02' });
    const history = h.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].date).toBe('2026-05-01');
    expect(history[1].date).toBe('2026-05-02');
  });

  test('caps at maxEntries and evicts oldest', () => {
    const h = createBuildHistory({ maxEntries: 3 });
    h.record({ ...baseEntry, date: 'a' });
    h.record({ ...baseEntry, date: 'b' });
    h.record({ ...baseEntry, date: 'c' });
    h.record({ ...baseEntry, date: 'd' });
    const history = h.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].date).toBe('b');
    expect(history[2].date).toBe('d');
  });

  test('getHistory returns copies so caller cannot mutate internal state', () => {
    const h = createBuildHistory();
    h.record(baseEntry);
    const copy = h.getHistory();
    copy[0].date = 'mutated';
    expect(h.getHistory()[0].date).toBe('2026-05-01');
  });

  test('getSummary counts entries with issues, warnings, and stale', () => {
    const h = createBuildHistory();
    h.record({ ...baseEntry, issues: [], sourceWarnings: [], stale: false });
    h.record({ ...baseEntry, issues: ['matches'], sourceWarnings: ['Main feed failed.'], stale: false, nextPreviewDate: null, nextPreviewFeaturedMatchId: null, nextPreviewSource: null });
    h.record({ ...baseEntry, issues: [], sourceWarnings: [], stale: true, nextPreviewDate: null, nextPreviewFeaturedMatchId: null, nextPreviewSource: null });
    const s = h.getSummary();
    expect(s.total).toBe(3);
    expect(s.withIssues).toBe(1);
    expect(s.withWarnings).toBe(1);
    expect(s.staleServed).toBe(1);
    expect(s.withNextPreview).toBe(1);
    expect(s.bySeverity).toEqual({ warning: 0, error: 0 });
    expect(s.issueByBucket).toEqual({ matches: 1, superlig: 0, standings: 0, other: 0 });
    expect(s.severityReasonBreakdown).toEqual({
      warning: { matches: 0, superlig: 0, standings: 0, other: 0 },
      error: { matches: 0, superlig: 0, standings: 0, other: 0 },
    });
    expect(s.nextPreviewBySource).toEqual({ fresh: 1, cache: 0, stale: 0 });
  });

  test('getSummary returns zeros on empty history', () => {
    const h = createBuildHistory();
    expect(h.getSummary()).toEqual({
      total: 0,
      withIssues: 0,
      withWarnings: 0,
      staleServed: 0,
      withNextPreview: 0,
      bySeverity: { warning: 0, error: 0 },
      issueByBucket: { matches: 0, superlig: 0, standings: 0, other: 0 },
      severityReasonBreakdown: {
        warning: { matches: 0, superlig: 0, standings: 0, other: 0 },
        error: { matches: 0, superlig: 0, standings: 0, other: 0 },
      },
      nextPreviewBySource: { fresh: 0, cache: 0, stale: 0 },
    });
  });

  test('record coerces types and ignores malformed input', () => {
    const h = createBuildHistory();
    h.record({
      date: null,
      generatedAt: undefined,
      matchCount: 'nope',
      issues: null,
      sourceWarnings: undefined,
      sourceSeverity: 'loud',
      stale: 1,
      featuredMatchId: 'bad',
      nextPreviewDate: undefined,
      nextPreviewFeaturedMatchId: 'oops',
      nextPreviewSource: 'mystery',
    });
    const entry = h.getHistory()[0];
    expect(entry.date).toBe('');
    expect(typeof entry.generatedAt).toBe('string');
    expect(entry.matchCount).toBe(0);
    expect(entry.issues).toEqual([]);
    expect(entry.sourceWarnings).toEqual([]);
    expect(entry.sourceSeverity).toBeNull();
    expect(entry.stale).toBe(true);
    expect(entry.featuredMatchId).toBeNull();
    expect(entry.nextPreviewDate).toBeNull();
    expect(entry.nextPreviewFeaturedMatchId).toBeNull();
    expect(entry.nextPreviewSource).toBeNull();
  });

  test('getSummary counts warning and error severities', () => {
    const h = createBuildHistory();
    h.record({ ...baseEntry, date: 'a', sourceSeverity: 'warning', issues: ['standings:2021'], nextPreviewDate: null, nextPreviewFeaturedMatchId: null, nextPreviewSource: null });
    h.record({ ...baseEntry, date: 'b', sourceSeverity: 'error', issues: ['matches', 'superlig'], nextPreviewDate: null, nextPreviewFeaturedMatchId: null, nextPreviewSource: null });
    h.record({ ...baseEntry, date: 'c', sourceSeverity: null, nextPreviewDate: null, nextPreviewFeaturedMatchId: null, nextPreviewSource: null });
    expect(h.getSummary()).toMatchObject({
      bySeverity: { warning: 1, error: 1 },
      issueByBucket: { matches: 1, superlig: 1, standings: 1, other: 0 },
      severityReasonBreakdown: {
        warning: { matches: 0, superlig: 0, standings: 1, other: 0 },
        error: { matches: 1, superlig: 1, standings: 0, other: 0 },
      },
    });
  });
});
