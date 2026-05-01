function createBuildHistory({ maxEntries = 20 } = {}) {
  const entries = [];
  const NEXT_PREVIEW_SOURCES = ['fresh', 'cache', 'stale'];
  const ISSUE_BUCKETS = ['matches', 'superlig', 'standings', 'other'];

  function issueBucket(issue) {
    const value = String(issue || '').trim().toLowerCase();
    if (!value) return 'other';
    if (value === 'matches') return 'matches';
    if (value === 'superlig') return 'superlig';
    if (value.startsWith('standings:')) return 'standings';
    return 'other';
  }

  function record({
    date,
    generatedAt,
    matchCount,
    issues,
    sourceWarnings,
    sourceSeverity,
    stale,
    featuredMatchId,
    nextPreviewDate,
    nextPreviewFeaturedMatchId,
    nextPreviewSource,
  }) {
    entries.push({
      date: String(date || ''),
      generatedAt: String(generatedAt || new Date().toISOString()),
      matchCount: Number(matchCount) || 0,
      issues: Array.isArray(issues) ? [...issues] : [],
      sourceWarnings: Array.isArray(sourceWarnings) ? [...sourceWarnings] : [],
      sourceSeverity: ['warning', 'error'].includes(sourceSeverity) ? sourceSeverity : null,
      stale: Boolean(stale),
      featuredMatchId: Number.isFinite(Number(featuredMatchId)) ? Number(featuredMatchId) : null,
      nextPreviewDate: nextPreviewDate ? String(nextPreviewDate) : null,
      nextPreviewFeaturedMatchId: Number.isFinite(Number(nextPreviewFeaturedMatchId))
        ? Number(nextPreviewFeaturedMatchId)
        : null,
      nextPreviewSource: NEXT_PREVIEW_SOURCES.includes(nextPreviewSource) ? nextPreviewSource : null,
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
    const withNextPreview = entries.filter(e => Boolean(e.nextPreviewDate)).length;
    const bySeverity = entries.reduce((acc, entry) => {
      if (entry.sourceSeverity) acc[entry.sourceSeverity] += 1;
      return acc;
    }, { warning: 0, error: 0 });
    const issueByBucket = entries.reduce((acc, entry) => {
      for (const issue of entry.issues) {
        const bucket = issueBucket(issue);
        acc[bucket] += 1;
      }
      return acc;
    }, { matches: 0, superlig: 0, standings: 0, other: 0 });
    const severityReasonBreakdown = entries.reduce((acc, entry) => {
      if (!entry.sourceSeverity) return acc;
      for (const issue of entry.issues) {
        const bucket = issueBucket(issue);
        acc[entry.sourceSeverity][bucket] += 1;
      }
      return acc;
    }, {
      warning: { matches: 0, superlig: 0, standings: 0, other: 0 },
      error: { matches: 0, superlig: 0, standings: 0, other: 0 },
    });
    const nextPreviewBySource = entries.reduce((acc, entry) => {
      if (entry.nextPreviewSource) acc[entry.nextPreviewSource] += 1;
      return acc;
    }, { fresh: 0, cache: 0, stale: 0 });
    return {
      total,
      withIssues,
      withWarnings,
      staleServed,
      withNextPreview,
      bySeverity,
      issueByBucket,
      severityReasonBreakdown,
      nextPreviewBySource,
    };
  }

  return { record, getHistory, getSummary };
}

module.exports = { createBuildHistory };
