function createBuildHistory({ maxEntries = 20 } = {}) {
  const entries = [];

  function record({ date, generatedAt, matchCount, issues, sourceWarnings, stale }) {
    entries.push({
      date: String(date || ''),
      generatedAt: String(generatedAt || new Date().toISOString()),
      matchCount: Number(matchCount) || 0,
      issues: Array.isArray(issues) ? [...issues] : [],
      sourceWarnings: Array.isArray(sourceWarnings) ? [...sourceWarnings] : [],
      stale: Boolean(stale),
    });
    if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
  }

  function getHistory() {
    return entries.map(entry => ({ ...entry }));
  }

  function getSummary() {
    const total = entries.length;
    const withIssues = entries.filter(e => e.issues.length > 0).length;
    const withWarnings = entries.filter(e => e.sourceWarnings.length > 0).length;
    const staleServed = entries.filter(e => e.stale).length;
    return { total, withIssues, withWarnings, staleServed };
  }

  return { record, getHistory, getSummary };
}

module.exports = { createBuildHistory };
