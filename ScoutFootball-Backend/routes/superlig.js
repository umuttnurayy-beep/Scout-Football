const express = require('express');

function createSuperLigRouter({
  apiError,
  apiStaleOrError,
  config,
  fetchAllSportsH2HMatches,
  fetchSuperLigMatch,
  fetchSuperLigMatchesForDate,
  fetchSuperLigStandingsCached,
  fetchSuperLigTeamContext,
  fetchSuperLigTeamFormMatches,
  getCache,
  isLiveStatus,
  setCache,
  TTL,
  ttlForMatchDate,
  upstream,
}) {
  const router = express.Router();
  const { CURRENT_SPORTSDB_SEASON, SL_LEAGUE_ID, SPORTSDB_BASE } = config;

  router.get('/superlig/standings', async (req, res) => {
    const cacheKey = 'superlig_standings_v3';
    try {
      return res.json(await fetchSuperLigStandingsCached());
    } catch (e) {
      console.error('/superlig/standings hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/superlig/matches', async (req, res) => {
    const { date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    const cacheKey = `superlig_matches_v2_${d}`;
    try {
      return res.json(await fetchSuperLigMatchesForDate(date));
    } catch (e) {
      console.error('/superlig/matches hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/superlig/team-form/:teamId', async (req, res) => {
    const { teamId } = req.params;
    const tid = parseInt(teamId);
    if (!tid) return apiError(res, 400, 'bad_request', 'invalid teamId', []);
    const cacheKey = `superlig_form_season_v3_${tid}`;

    try {
      return res.json(await fetchSuperLigTeamFormMatches(tid));
    } catch (e) {
      console.error('/superlig/team-form hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/superlig/team-context/:teamId', async (req, res) => {
    const { teamId } = req.params;
    const tid = parseInt(teamId);
    if (!tid) return apiError(res, 400, 'bad_request', 'invalid teamId', null);
    const cacheKey = `superlig_team_context_v1_${tid}`;

    try {
      return res.json(await fetchSuperLigTeamContext(tid));
    } catch (e) {
      console.error('/superlig/team-context hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
    }
  });

  router.get('/superlig/players/:teamId', async (req, res) => {
    const { teamId } = req.params;
    const cacheKey = `superlig_players_v1_${teamId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    try {
      const data = await upstream.fetchJson(`${SPORTSDB_BASE}/lookup_all_players.php?id=${teamId}`, {}, 'sportsdb superlig players');
      const players = data.player || [];
      const result = players.map(p => ({
        id:          p.idPlayer,
        name:        p.strPlayer,
        position:    p.strPosition,
        nationality: p.strNationality,
      }));
      if (result.length > 0) await setCache(cacheKey, result, TTL.team);
      return res.json(result);
    } catch (e) {
      console.error('/superlig/players hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/superlig/scorers', async (req, res) => {
    const cacheKey = 'superlig_scorers_v2';
    const cached = await getCache(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) return res.json(cached);
    try {
      const data = await upstream.fetchJson(`${SPORTSDB_BASE}/eventspastleague.php?l=${SL_LEAGUE_ID}&s=${CURRENT_SPORTSDB_SEASON}`, {}, 'sportsdb superlig scorers');
      const events = data.events || [];
      const scorerMap = {};

      function parseGoalDetails(details, teamName) {
        if (!details) return;
        const parts = details.split(';');
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const match = trimmed.match(/^\d+['+]?[:\s](.+)/);
          if (!match) continue;
          const playerName = match[1].trim();
          if (!playerName) continue;
          const lower = playerName.toLowerCase();
          if (lower.includes('og') || lower.includes('own goal') || lower.includes('kendi')) continue;
          if (!scorerMap[playerName]) {
            scorerMap[playerName] = { name: playerName, goals: 0, team: teamName };
          }
          scorerMap[playerName].goals++;
        }
      }

      for (const e of events) {
        parseGoalDetails(e.strHomeGoalDetails, e.strHomeTeam);
        parseGoalDetails(e.strAwayGoalDetails, e.strAwayTeam);
      }

      const result = Object.values(scorerMap)
        .filter(s => s.goals > 0)
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 50);

      if (result.length > 0) await setCache(cacheKey, result, TTL.topscorers);
      return res.json(result);
    } catch (e) {
      console.error('/superlig/scorers hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/superlig/match/:eventId/context', async (req, res) => {
    const { eventId } = req.params;
    const homeTeamId = parseInt(req.query.homeTeamId);
    const awayTeamId = parseInt(req.query.awayTeamId);
    const home = String(req.query.home || '');
    const away = String(req.query.away || '');
    const cacheKey = `superlig_match_context_v1_${eventId}_${homeTeamId || 0}_${awayTeamId || 0}_${home}_${away}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ ok: true, data: cached });

    try {
      const event = await fetchSuperLigMatch(eventId);
      if (!event) return apiError(res, 404, 'not_found', 'match not found', null);

      const resolvedHomeId = homeTeamId || parseInt(event.idHomeTeam) || 0;
      const resolvedAwayId = awayTeamId || parseInt(event.idAwayTeam) || 0;
      const resolvedHome = home || event.strHomeTeam || '';
      const resolvedAway = away || event.strAwayTeam || '';

      const [homeContextR, awayContextR, h2hR] = await Promise.allSettled([
        resolvedHomeId ? fetchSuperLigTeamContext(resolvedHomeId) : Promise.resolve(null),
        resolvedAwayId ? fetchSuperLigTeamContext(resolvedAwayId) : Promise.resolve(null),
        resolvedHome && resolvedAway ? fetchAllSportsH2HMatches(resolvedHome, resolvedAway) : Promise.resolve([]),
      ]);

      const issues = [];
      if (homeContextR.status === 'rejected' || awayContextR.status === 'rejected') issues.push('form');
      if (h2hR.status === 'rejected') issues.push('h2h');

      const isFinished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event.strStatus || '');
      const matchDate = event.dateEvent || new Date().toISOString().split('T')[0];
      const payload = {
        event,
        homeContext: homeContextR.status === 'fulfilled' ? homeContextR.value : null,
        awayContext: awayContextR.status === 'fulfilled' ? awayContextR.value : null,
        h2h: h2hR.status === 'fulfilled' ? h2hR.value : [],
        issues,
        generatedAt: new Date().toISOString(),
      };

      await setCache(cacheKey, payload, isFinished ? TTL.historical : ttlForMatchDate(matchDate, isLiveStatus(event.strStatus)));
      return res.json({ ok: true, data: payload });
    } catch (e) {
      console.error('/superlig/match/:eventId/context hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
    }
  });

  router.get('/superlig/match/:eventId', async (req, res) => {
    const { eventId } = req.params;
    const cacheKey = `superlig_match_v1_${eventId}`;
    try {
      const event = await fetchSuperLigMatch(eventId);
      if (!event) return apiError(res, 404, 'not_found', 'match not found', null);
      return res.json(event);
    } catch (e) {
      console.error('/superlig/match/:eventId hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
    }
  });

  return router;
}

module.exports = createSuperLigRouter;
