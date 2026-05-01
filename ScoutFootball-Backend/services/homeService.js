const HOME_SUPPORTED_LEAGUES = [2021, 2014, 2002, 2019, 2015, 2001];
const HOME_CACHE_VERSION = 'v2';
const HOME_LOOKAHEAD_DAYS = 7;
const HOME_FEATURED_TTL = 36 * 60 * 60 * 1000;
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
        finished: match.status === 'Match Finished' || match.homeScore !== null && match.homeScore !== undefined,
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
    const pair = `${match.home} ${match.away}`.toLowerCase();
    if (/real madrid|barcelona|bayern|psg|paris|arsenal|liverpool|manchester|inter|milan|juventus|galatasaray|fenerbahce|fenerbahçe|besiktas|beşiktaş/.test(pair)) {
      score += 3;
    }
    return score;
  }

  async function selectStableFeaturedMatchId(date, matches, superLigMatches) {
    const candidates = visibleFeaturedCandidates(matches, superLigMatches);
    if (candidates.length === 0) return null;

    const cacheKey = `home_featured_v1_${date}`;
    const cachedId = await getCache(cacheKey);
    if (cachedId && candidates.some(match => match.id === Number(cachedId))) {
      return Number(cachedId);
    }

    const selected = [...candidates].sort((a, b) => {
      const diff = scoreFeaturedCandidate(b) - scoreFeaturedCandidate(a);
      if (diff !== 0) return diff;
      return a.id - b.id;
    })[0];
    await setCache(cacheKey, selected.id, HOME_FEATURED_TTL);
    return selected.id;
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
    const cacheKey = `home_${HOME_CACHE_VERSION}_${date}`;
    const staleKey = `home_last_good_${HOME_CACHE_VERSION}_${date}`;
    const cached = await getCache(cacheKey);
    if (cached) return { ok: true, data: cached };

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
          if (stale) return { payload: stale, stale: true };
        }

        const supportedMatches = filterSupportedMatches(matches);
        const currentLeagueIds = visibleLeagueIdsFromPayload(supportedMatches, superLigMatches);
        const featuredMatchId = await selectStableFeaturedMatchId(date, supportedMatches, superLigMatches);
        let nextPreview = null;
        let nextLeagueIds = [];

        if (visibleMatchCountFromPayload(supportedMatches, superLigMatches) <= 1) {
          for (let offset = 1; offset <= HOME_LOOKAHEAD_DAYS; offset += 1) {
            const nextDate = addDays(date, offset);
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
              );
              nextPreview = {
                date: nextDate,
                matches: supportedNextMatches,
                superLigMatches: nextSuperLigMatches,
                featuredMatchId: nextFeaturedMatchId,
              };
              break;
            }
          }
        }

        const standingsBundle = await buildStandingsMapForLeagueIds([...new Set([...currentLeagueIds, ...nextLeagueIds])]);
        const issues = [...new Set([...upstreamErrors, ...standingsBundle.issues])];
        const payload = {
          date,
          matches: supportedMatches,
          superLigMatches,
          standings: standingsBundle.map,
          featuredMatchId,
          nextPreview,
          issues,
          sourceWarnings: [...new Set([...sourceWarnings, ...standingsBundle.sourceWarnings])],
          generatedAt: new Date().toISOString(),
        };

        const hasLive = supportedMatches.some(m => isLiveStatus(m.status)) ||
          superLigMatches.some(m => isLiveStatus(m.status));
        await setCache(cacheKey, payload, ttlForMatchDate(date, hasLive));
        if (visibleMatchCountFromPayload(supportedMatches, superLigMatches) > 0) {
          await setCache(staleKey, payload, HOME_STALE_TTL);
        }

        if (buildHistory) {
          buildHistory.record({
            date,
            generatedAt: payload.generatedAt,
            matchCount: visibleMatchCountFromPayload(supportedMatches, superLigMatches),
            issues: payload.issues,
            sourceWarnings: payload.sourceWarnings,
            stale: false,
          });
        }

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
        if (buildHistory) {
          buildHistory.record({
            date: normalizeHomeDate(rawDate),
            generatedAt: stale.generatedAt || new Date().toISOString(),
            matchCount: 0,
            issues: stale.issues || ['upstream_error'],
            sourceWarnings: stale.sourceWarnings || ['Serving stale data due to upstream error.'],
            stale: true,
          });
        }
        return { ok: true, stale: true, data: stale };
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
