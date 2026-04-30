const { createBuildHistory } = require('../utils/buildHistory');

const baseEntry = {
  date: '2026-05-01',
  generatedAt: '2026-05-01T12:00:00.000Z',
  matchCount: 10,
  issues: [],
  sourceWarnings: [],
  stale: false,
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
    h.record({ ...baseEntry, issues: ['matches'], sourceWarnings: ['Main feed failed.'], stale: false });
    h.record({ ...baseEntry, issues: [], sourceWarnings: [], stale: true });
    const s = h.getSummary();
    expect(s.total).toBe(3);
    expect(s.withIssues).toBe(1);
    expect(s.withWarnings).toBe(1);
    expect(s.staleServed).toBe(1);
  });

  test('getSummary returns zeros on empty history', () => {
    const h = createBuildHistory();
    expect(h.getSummary()).toEqual({ total: 0, withIssues: 0, withWarnings: 0, staleServed: 0 });
  });

  test('record coerces types and ignores malformed input', () => {
    const h = createBuildHistory();
    h.record({ date: null, generatedAt: undefined, matchCount: 'nope', issues: null, sourceWarnings: undefined, stale: 1 });
    const entry = h.getHistory()[0];
    expect(entry.date).toBe('');
    expect(typeof entry.generatedAt).toBe('string');
    expect(entry.matchCount).toBe(0);
    expect(entry.issues).toEqual([]);
    expect(entry.sourceWarnings).toEqual([]);
    expect(entry.stale).toBe(true);
  });
});
