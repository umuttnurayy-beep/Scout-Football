const express = require('express');
const { deriveH2HFromTeamMatches } = require('../utils/footballDataH2H');

function createFootballDataRouter({
  apiError,
  apiStaleOrError,
  config,
  fetchFootballDataH2H,
  fetchFootballDataMatch,
  fetchFootballDataMatchesForDate,
  fetchFootballDataTeamMatches,
  fetchStandingsForLeague,
  footballDataMatchCacheTtl,
  getCache,
  missingConfig,
  setCache,
  TTL,
  upstream,
}) {
  const router = express.Router();
  const { FOOTBALL_DATA_BASE, FOOTBALL_DATA_KEY } = config;
  const hasCompleteContextForm = payload =>
    Array.isArray(payload?.homeForm) &&
    Array.isArray(payload?.awayForm) &&
    payload.homeForm.length > 0 &&
    payload.awayForm.length > 0 &&
    !payload?.issues?.includes('form');

  router.get('/standings/:leagueId', async (req, res) => {
    const { leagueId } = req.params;
    if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
    const cacheKey = `standings_v4_${leagueId}`;
    try {
      return res.json(await fetchStandingsForLeague(leagueId));
    } catch (e) {
      console.error('/standings hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/matches', async (req, res) => {
    const { date } = req.query;
    if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
    const cacheKey = `matches_v2_${date || 'today'}`;
    try {
      return res.json(await fetchFootballDataMatchesForDate(date));
    } catch (e) {
      console.error('/matches hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/match/:matchId/context', async (req, res) => {
    const { matchId } = req.params;
    if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', null);

    const isFinished = req.query.finished === '1';
    const cacheKey = `match_context_v2_${matchId}_${isFinished ? 'finished' : 'active'}`;
    const cached = await getCache(cacheKey);
    if (cached && hasCompleteContextForm(cached)) return res.json({ ok: true, data: cached });

    try {
      const match = await fetchFootballDataMatch(matchId);
      if (!match) return apiError(res, 404, 'not_found', 'match not found', null);

      const matchFinished = isFinished || String(match.status || '').toUpperCase() === 'FINISHED';
      const homeTeamId = match.homeTeam?.id || 0;
      const awayTeamId = match.awayTeam?.id || 0;
      const [homeFormR, awayFormR, h2hR] = await Promise.allSettled([
        homeTeamId ? fetchFootballDataTeamMatches(homeTeamId) : Promise.resolve([]),
        awayTeamId ? fetchFootballDataTeamMatches(awayTeamId) : Promise.resolve([]),
        fetchFootballDataH2H(matchId, matchFinished),
      ]);

      const homeForm = homeFormR.status === 'fulfilled' ? homeFormR.value : [];
      const awayForm = awayFormR.status === 'fulfilled' ? awayFormR.value : [];
      let h2h = h2hR.status === 'fulfilled' ? h2hR.value : [];
      if (h2h.length === 0 && homeForm.length > 0 && awayForm.length > 0) {
        h2h = deriveH2HFromTeamMatches({
          homeForm,
          awayForm,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          currentMatchId: match.id || matchId,
        });
      }

      const issues = [];
      if (homeFormR.status === 'rejected' || awayFormR.status === 'rejected') issues.push('form');
      if (h2hR.status === 'rejected' && h2h.length === 0) issues.push('h2h');

      const payload = {
        match,
        homeForm,
        awayForm,
        h2h,
        issues,
        generatedAt: new Date().toISOString(),
      };

      const contextTtl = hasCompleteContextForm(payload)
        ? footballDataMatchCacheTtl(match)
        : Math.min(60 * 1000, footballDataMatchCacheTtl(match));
      await setCache(cacheKey, payload, contextTtl);
      return res.json({ ok: true, data: payload });
    } catch (e) {
      console.error('/match/:matchId/context hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
    }
  });

  router.get('/match/:matchId', async (req, res) => {
    const { matchId } = req.params;
    if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', null);
    const cacheKey = `match_${matchId}`;
    try {
      return res.json(await fetchFootballDataMatch(matchId));
    } catch (e) {
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
    }
  });

  router.get('/h2h/:matchId', async (req, res) => {
    const { matchId } = req.params;
    if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
    const isFinished = req.query.finished === '1';
    const cacheKey = `h2h_${matchId}`;
    try {
      const h2h = await fetchFootballDataH2H(matchId, isFinished);
      if (Array.isArray(h2h) && h2h.length > 0) return res.json(h2h);

      const match = await fetchFootballDataMatch(matchId);
      if (!match) return res.json([]);
      const homeTeamId = match.homeTeam?.id || 0;
      const awayTeamId = match.awayTeam?.id || 0;
      const [homeFormR, awayFormR] = await Promise.allSettled([
        homeTeamId ? fetchFootballDataTeamMatches(homeTeamId) : Promise.resolve([]),
        awayTeamId ? fetchFootballDataTeamMatches(awayTeamId) : Promise.resolve([]),
      ]);
      const fallback = deriveH2HFromTeamMatches({
        homeForm: homeFormR.status === 'fulfilled' ? homeFormR.value : [],
        awayForm: awayFormR.status === 'fulfilled' ? awayFormR.value : [],
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        currentMatchId: match.id || matchId,
      });
      return res.json(fallback);
    } catch (e) {
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/team/:teamId', async (req, res) => {
    const { teamId } = req.params;
    if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', null);
    const cacheKey = `team_${teamId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    try {
      const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/teams/${teamId}`, {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
      }, 'football-data team');
      await setCache(cacheKey, data, TTL.team);
      return res.json(data);
    } catch (e) {
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
    }
  });

  router.get('/team/:teamId/matches', async (req, res) => {
    const { teamId } = req.params;
    if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
    const cacheKey = `team_matches_season_v2_${teamId}`;
    try {
      return res.json(await fetchFootballDataTeamMatches(teamId));
    } catch (e) {
      console.error('/team/:teamId/matches hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/scorers/:leagueId', async (req, res) => {
    const { leagueId } = req.params;
    if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
    const cacheKey = `scorers_${leagueId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    try {
      const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/competitions/${leagueId}/scorers?limit=100`, {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
      }, 'football-data scorers');
      await setCache(cacheKey, data.scorers || [], TTL.standings);
      return res.json(data.scorers || []);
    } catch (e) {
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  return router;
}

module.exports = createFootballDataRouter;
