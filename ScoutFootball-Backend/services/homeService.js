const HOME_SUPPORTED_LEAGUES = [2021, 2014, 2002, 2019, 2015, 2001];
const HOME_CACHE_VERSION = 'v12';
const HOME_FEATURED_VERSION = 'v4';
const HOME_LOOKAHEAD_DAYS = 7;
const HOME_FEATURED_TTL = 365 * 24 * 60 * 60 * 1000;
const HOME_STALE_TTL = 48 * 60 * 60 * 1000;
const HOME_LEAGUE_WEIGHT = {
  2001: 30,
  2021: 26,
  2014: 26,
  2002: 22,
  2019: 22,
  2015: 18,
  203: 14,
};
const HOME_MAJOR_TEAMS = [
  'real madrid', 'barcelona', 'atletico madrid',
  'bayern', 'borussia dortmund', 'dortmund',
  'psg', 'paris',
  'arsenal', 'liverpool', 'manchester city', 'man city', 'manchester united', 'man united', 'man utd', 'chelsea', 'tottenham',
  'inter', 'internazionale', 'milan', 'juventus', 'napoli', 'roma',
  'galatasaray', 'fenerbahce', 'fenerbahçe', 'besiktas', 'beşiktaş', 'trabzonspor',
];
const HOME_MARQUEE_MATCHUPS = [
  { teams: ['galatasaray', 'fenerbahce'], bonus: 12 },
  { teams: ['galatasaray', 'fenerbahçe'], bonus: 12 },
  { teams: ['real madrid', 'barcelona'], bonus: 12 },
  { teams: ['man united', 'liverpool'], bonus: 10 },
  { teams: ['manchester united', 'liverpool'], bonus: 10 },
  { teams: ['man united', 'man city'], bonus: 9 },
  { teams: ['manchester united', 'manchester city'], bonus: 9 },
  { teams: ['inter', 'milan'], bonus: 9 },
  { teams: ['milan', 'juventus'], bonus: 9 },
  { teams: ['inter', 'juventus'], bonus: 9 },
  { teams: ['bayern', 'dortmund'], bonus: 9 },
];
const HOME_SINGLE_MAJOR_TEAM_BONUS = 7;
const HOME_DOUBLE_MAJOR_TEAM_BONUS = 18;

function normalizeHomeDate(rawDate) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(rawDate || ''))
    ? String(rawDate)
    : new Date().toISOString().split('T')[0];
}

function addDays(date, offset) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + offset);
  return next.toISOString().split('T')[0];
}

function minutesFromUtcDate(utcDate) {
  const date = new Date(utcDate);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function minutesFromSportsDbTime(time) {
  const parts = String(time || '').split(':');
  if (parts.length < 2) return 0;
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
}

function homeCacheKey(date) {
  return `home_${HOME_CACHE_VERSION}_${date}`;
}

function homeStaleCacheKey(date) {
  return `home_last_good_${HOME_CACHE_VERSION}_${date}`;
}

function normalizeNextPreviewSource(source) {
  return ['fresh', 'cache', 'stale'].includes(source) ? source : null;
}

function normalizeSourceSeverity(severity) {
  return ['warning', 'error'].includes(severity) ? severity : null;
}

function createHomeService(deps) {
  const {
    dedupe,
    getCache,
    getStaleCache,
    setCache,
    fetchFootballDataMatchesForDate,
    fetchSuperLigMatchesForDate,
    fetchSuperLigStandingsCached,
    fetchStandingsForLeague,
    hasMatchTeamNames,
    isLiveStatus,
    ttlForMatchDate,
    buildHistory,
    warmMatchContexts,
    logger = console,
  } = deps;

  function visibleLeagueIdsFromPayload(matches, superLigMatches) {
    const ids = new Set();
    for (const match of matches || []) {
      const id = match.competition?.id;
      if (HOME_SUPPORTED_LEAGUES.includes(id) && hasMatchTeamNames(match)) ids.add(id);
    }
    if ((superLigMatches || []).some(m => m.home && m.away)) ids.add(203);
    return [...ids];
  }

  function filterSupportedMatches(matches) {
    return (matches || []).filter(match =>
      HOME_SUPPORTED_LEAGUES.includes(match.competition?.id) && hasMatchTeamNames(match)
    );
  }

  function visibleMatchCountFromPayload(matches, superLigMatches) {
    const mainCount = filterSupportedMatches(matches).length;
    const superLigCount = (superLigMatches || []).filter(m => m.home && m.away).length;
    return mainCount + superLigCount;
  }

  function visibleFeaturedCandidates(matches, superLigMatches) {
    const main = (matches || [])
      .filter(match => HOME_SUPPORTED_LEAGUES.includes(match.competition?.id) && hasMatchTeamNames(match))
      .map(match => ({
        id: Number(match.id) || 0,
        leagueId: match.competition?.id || 0,
        finished: match.status === 'FINISHED',
        minutes: minutesFromUtcDate(match.utcDate),
        home: match.homeTeam?.shortName || match.homeTeam?.name || '',
        away: match.awayTeam?.shortName || match.awayTeam?.name || '',
      }));

    const superLig = (superLigMatches || [])
      .filter(match => match.home && match.away)
      .map(match => ({
        id: Number(match.id) || 0,
        leagueId: 203,
        finished: ['Match Finished', 'FT', 'AET', 'PEN'].includes(match.status || '') || (match.homeScore !== null && match.homeScore !== undefined),
        minutes: minutesFromSportsDbTime(match.time),
        home: match.home,
        away: match.away,
      }));

    return [...main, ...superLig].filter(match => match.id);
  }

  function scoreFeaturedCandidate(match) {
    let score = HOME_LEAGUE_WEIGHT[match.leagueId] || 8;
    if (!match.finished) score += 1;
    if (match.minutes >= 20 * 60) score += 2;
    else if (match.minutes >= 18 * 60) score += 1;
    const teams = [match.home, match.away].map(team => String(team || '').toLowerCase());
    const majorCount = teams.filter(team =>
      HOME_MAJOR_TEAMS.some(major => team.includes(major) || major.includes(team))
    ).length;
    if (majorCount >= 2) score += HOME_DOUBLE_MAJOR_TEAM_BONUS;
    else if (majorCount === 1) score += HOME_SINGLE_MAJOR_TEAM_BONUS;
    const marquee = HOME_MARQUEE_MATCHUPS.find(item => {
      const [a, b] = item.teams;
      return (teams[0].includes(a) && teams[1].includes(b)) ||
        (teams[0].includes(b) && teams[1].includes(a));
    });
    if (marquee) score += marquee.bonus;
    return score;
  }

  function deriveSourceSeverity(upstreamErrors, standingsIssues) {
    if ((upstreamErrors || []).length > 0) return 'error';
    if ((standingsIssues || []).length > 0) return 'warning';
    return null;
  }

  function deriveSourceSeverityFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.sourceSeverity === 'warning' || payload.sourceSeverity === 'error') {
      return payload.sourceSeverity;
    }
    const issues = Array.isArray(payload.issues) ? payload.issues : [];
    if (issues.some(issue => issue === 'matches' || issue === 'superlig')) return 'error';
    if (issues.some(issue => String(issue).startsWith('standings:'))) return 'warning';
    return null;
  }

  function withDerivedPayloadFields(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    return {
      ...payload,
      sourceSeverity: deriveSourceSeverityFromPayload(payload),
    };
  }

  async function readCachedHomePreview(date) {
    const freshCached = await getCache(homeCacheKey(date));
    if (freshCached) {
      const supportedMatches = filterSupportedMatches(freshCached.matches);
      const superLigMatches = (freshCached.superLigMatches || []).filter(match => match.home && match.away);
      const leagueIds = visibleLeagueIdsFromPayload(supportedMatches, superLigMatches);
      if (leagueIds.length > 0) {
        return {
          date,
          matches: supportedMatches,
          superLigMatches,
          leagueIds,
          featuredMatchId: Number(freshCached.featuredMatchId) || null,
          source: 'cache',
        };
      }
    }

    const staleCached = await getStaleCache(homeStaleCacheKey(date));
    if (!staleCached) return null;

    const supportedMatches = filterSupportedMatches(staleCached.matches);
    const superLigMatches = (staleCached.superLigMatches || []).filter(match => match.home && match.away);
    const leagueIds = visibleLeagueIdsFromPayload(supportedMatches, superLigMatches);
    if (leagueIds.length === 0) return null;

    return {
      date,
      matches: supportedMatches,
      superLigMatches,
      leagueIds,
      featuredMatchId: Number(staleCached.featuredMatchId) || null,
      source: 'stale',
    };
  }

  async function selectStableFeaturedMatchId(date, matches, superLigMatches, options = {}) {
    const cacheKey = `home_featured_${HOME_FEATURED_VERSION}_${date}`;
    const cachedId = Number(await getCache(cacheKey) || await getStaleCache(cacheKey)) || null;
    if (cachedId) {
      return cachedId;
    }

    const candidates = visibleFeaturedCandidates(matches, superLigMatches);
    if (candidates.length === 0 || options.freezeSelection) return null;

    const selected = [...candidates].sort((a, b) => {
      const diff = scoreFeaturedCandidate(b) - scoreFeaturedCandidate(a);
      if (diff !== 0) return diff;
      return a.id - b.id;
    })[0];
    await setCache(cacheKey, selected.id, HOME_FEATURED_TTL);
    return selected.id;
  }

  function pickContextWarmupTargets(matches, superLigMatches, featuredMatchId, limit = 6) {
    const candidates = visibleFeaturedCandidates(matches, superLigMatches);
    if (candidates.length === 0) return { footballDataMatches: [], superLigMatches: [] };

    const sorted = [...candidates].sort((a, b) => {
      const featuredA = featuredMatchId && a.id === Number(featuredMatchId) ? 1 : 0;
      const featuredB = featuredMatchId && b.id === Number(featuredMatchId) ? 1 : 0;
      if (featuredA !== featuredB) return featuredB - featuredA;
      const scoreDiff = scoreFeaturedCandidate(b) - scoreFeaturedCandidate(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.id - b.id;
    }).slice(0, limit);
    const targetIds = new Set(sorted.map(match => match.id));

    return {
      footballDataMatches: (matches || [])
        .filter(match => targetIds.has(Number(match.id)))
        .slice(0, limit),
      superLigMatches: (superLigMatches || [])
        .filter(match => targetIds.has(Number(match.id)))
        .slice(0, limit),
    };
  }

  function scheduleContextWarmup(date, payload) {
    if (typeof warmMatchContexts !== 'function' || !payload) return;
    if (deriveSourceSeverityFromPayload(payload) === 'error') return;
    const targets = pickContextWarmupTargets(
      payload.matches || [],
      payload.superLigMatches || [],
      payload.featuredMatchId,
    );
    if (targets.footballDataMatches.length === 0 && targets.superLigMatches.length === 0) return;

    Promise.resolve()
      .then(() => warmMatchContexts({ date, ...targets }))
      .catch(e => logger.error('[home] context warmup failed:', e.message));
  }

  async function buildStandingsMapForLeagueIds(leagueIds) {
    const issues = [];
    const sourceWarnings = [];
    const entries = await Promise.all(leagueIds.map(async leagueId => {
      try {
        if (leagueId === 203) return [leagueId, await fetchSuperLigStandingsCached()];
        return [leagueId, await fetchStandingsForLeague(leagueId)];
      } catch (e) {
        logger.error(`[home] standings failed for ${leagueId}:`, e.message);
        issues.push(`standings:${leagueId}`);
        sourceWarnings.push(`Standings fetch failed for league ${leagueId}.`);
        return [leagueId, []];
      }
    }));
    const map = entries.reduce((map, [leagueId, rows]) => {
      if (Array.isArray(rows) && rows.length > 0) map[leagueId] = rows;
      return map;
    }, {});
    return { map, issues, sourceWarnings };
  }

  async function buildHome(rawDate) {
    const date = normalizeHomeDate(rawDate);
    const cacheKey = homeCacheKey(date);
    const staleKey = homeStaleCacheKey(date);
    const cached = await getCache(cacheKey);
    if (cached) {
      const payload = withDerivedPayloadFields(cached);
      scheduleContextWarmup(date, payload);
      return { ok: true, data: payload };
    }

    try {
      const result = await dedupe(cacheKey, async () => {
        const fresh = await getCache(cacheKey);
        if (fresh) return { payload: fresh, stale: false };

        const upstreamErrors = [];
        const sourceWarnings = [];
        const [matches, superLigMatches] = await Promise.all([
          fetchFootballDataMatchesForDate(date).catch(e => {
            logger.error('/home matches hata:', e.message);
            upstreamErrors.push('matches');
            sourceWarnings.push('Main match feed failed for the selected day.');
            return [];
          }),
          fetchSuperLigMatchesForDate(date).catch(e => {
            logger.error('/home superlig hata:', e.message);
            upstreamErrors.push('superlig');
            sourceWarnings.push('Super Lig match feed failed for the selected day.');
            return [];
          }),
        ]);

        if (upstreamErrors.length > 0 && visibleMatchCountFromPayload(matches, superLigMatches) === 0) {
          const stale = await getStaleCache(staleKey);
          if (stale) return { payload: withDerivedPayloadFields(stale), stale: true };
        }

        const supportedMatches = filterSupportedMatches(matches);
        const currentLeagueIds = visibleLeagueIdsFromPayload(supportedMatches, superLigMatches);
        const featuredMatchId = await selectStableFeaturedMatchId(date, supportedMatches, superLigMatches, {
          freezeSelection: upstreamErrors.length > 0,
        });
        let nextPreview = null;
        let nextLeagueIds = [];

        if (visibleMatchCountFromPayload(supportedMatches, superLigMatches) <= 1) {
          for (let offset = 1; offset <= HOME_LOOKAHEAD_DAYS; offset += 1) {
            const nextDate = addDays(date, offset);
            const cachedPreview = await readCachedHomePreview(nextDate);
            if (cachedPreview) {
              nextLeagueIds = cachedPreview.leagueIds;
              nextPreview = {
                date: cachedPreview.date,
                matches: cachedPreview.matches,
                superLigMatches: cachedPreview.superLigMatches,
                featuredMatchId: cachedPreview.featuredMatchId,
                source: cachedPreview.source,
              };
              break;
            }

            const [nextMatches, nextSuperLigMatches] = await Promise.all([
              fetchFootballDataMatchesForDate(nextDate).catch(() => []),
              fetchSuperLigMatchesForDate(nextDate).catch(() => []),
            ]);
            const supportedNextMatches = filterSupportedMatches(nextMatches);
            const leagueIds = visibleLeagueIdsFromPayload(supportedNextMatches, nextSuperLigMatches);
            if (leagueIds.length > 0) {
              nextLeagueIds = leagueIds;
              const nextFeaturedMatchId = await selectStableFeaturedMatchId(
                nextDate,
                supportedNextMatches,
                nextSuperLigMatches,
                { freezeSelection: false },
              );
              nextPreview = {
                date: nextDate,
                matches: supportedNextMatches,
                superLigMatches: nextSuperLigMatches,
                featuredMatchId: nextFeaturedMatchId,
                source: 'fresh',
              };
              break;
            }
          }
        }

        const standingsBundle = await buildStandingsMapForLeagueIds([...new Set([...currentLeagueIds, ...nextLeagueIds])]);
        const issues = [...new Set([...upstreamErrors, ...standingsBundle.issues])];
        const sourceSeverity = deriveSourceSeverity(upstreamErrors, standingsBundle.issues);
        const payload = withDerivedPayloadFields({
          date,
          matches: supportedMatches,
          superLigMatches,
          standings: standingsBundle.map,
          featuredMatchId,
          nextPreview,
          issues,
          sourceWarnings: [...new Set([...sourceWarnings, ...standingsBundle.sourceWarnings])],
          sourceSeverity,
          generatedAt: new Date().toISOString(),
        });

        const hasLive = supportedMatches.some(m => isLiveStatus(m.status)) ||
          superLigMatches.some(m => isLiveStatus(m.status));
        const hasVisibleMatches = visibleMatchCountFromPayload(supportedMatches, superLigMatches) > 0;
        if (upstreamErrors.length === 0 || hasVisibleMatches) {
          // If there are upstream errors, cache briefly so a retry can recover
          // without the partial result being stuck for hours (e.g. FD fails but SL succeeds)
          const ttl = upstreamErrors.length > 0
            ? TTL.matchday
            : ttlForMatchDate(date, hasLive);
          await setCache(cacheKey, payload, ttl);
        }
        if (hasVisibleMatches) {
          await setCache(staleKey, payload, HOME_STALE_TTL);
        }

        if (buildHistory) {
          buildHistory.record({
            date,
            generatedAt: payload.generatedAt,
            matchCount: visibleMatchCountFromPayload(supportedMatches, superLigMatches),
            issues: payload.issues,
            sourceWarnings: payload.sourceWarnings,
            sourceSeverity: normalizeSourceSeverity(payload.sourceSeverity),
            stale: false,
            featuredMatchId: payload.featuredMatchId,
            nextPreviewDate: payload.nextPreview?.date,
            nextPreviewFeaturedMatchId: payload.nextPreview?.featuredMatchId,
            nextPreviewSource: normalizeNextPreviewSource(payload.nextPreview?.source),
          });
        }

        scheduleContextWarmup(date, payload);

        return { payload, stale: false };
      });

      return {
        ok: true,
        stale: result.stale || undefined,
        data: result.payload || result,
      };
    } catch (e) {
      logger.error('/home hata:', e.message);
      const stale = await getStaleCache(staleKey);
      if (stale) {
        const normalizedStale = withDerivedPayloadFields(stale);
        if (buildHistory) {
          buildHistory.record({
            date: normalizeHomeDate(rawDate),
            generatedAt: normalizedStale.generatedAt || new Date().toISOString(),
            matchCount: 0,
            issues: normalizedStale.issues || ['upstream_error'],
            sourceWarnings: normalizedStale.sourceWarnings || ['Serving stale data due to upstream error.'],
            sourceSeverity: normalizeSourceSeverity(normalizedStale.sourceSeverity) || 'error',
            stale: true,
            featuredMatchId: normalizedStale.featuredMatchId,
            nextPreviewDate: normalizedStale.nextPreview?.date,
            nextPreviewFeaturedMatchId: normalizedStale.nextPreview?.featuredMatchId,
            nextPreviewSource: normalizeNextPreviewSource(normalizedStale.nextPreview?.source),
          });
        }
        return { ok: true, stale: true, data: normalizedStale };
      }
      throw e;
    }
  }

  return {
    buildHome,
  };
}

module.exports = {
  createHomeService,
};
