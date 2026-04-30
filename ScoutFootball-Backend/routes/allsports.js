const express = require('express');

function createAllSportsRouter({
  apiError,
  apiStaleOrError,
  config,
  fetchAllSportsH2HMatches,
  getCache,
  missingConfig,
  setCache,
  TTL,
  upstream,
}) {
  const router = express.Router();
  const { ALLSPORTS_BASE, ALLSPORTS_KEY } = config;

  router.get('/allsports/team-stats/:teamName', async (req, res) => {
    const teamName = decodeURIComponent(req.params.teamName);
    const cacheKey = `allsports_v1_${teamName}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    if (!ALLSPORTS_KEY) return missingConfig(res, 'ALLSPORTS_KEY', null);
    try {
      const teamData = await upstream.fetchJson(`${ALLSPORTS_BASE}?met=Teams&APIkey=${ALLSPORTS_KEY}&teamName=${encodeURIComponent(teamName)}`, {}, 'allsports team search');
      const teams = teamData.result || [];
      if (teams.length === 0) return res.json(null);

      const team = teams.find(t => {
        const n = (t.team_name || '').toLowerCase();
        const q = teamName.toLowerCase();
        return n.includes(q) || q.includes(n);
      }) || teams[0];

      const teamId = team.team_key;
      const today = new Date().toISOString().split('T')[0];
      const ago = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const fixData = await upstream.fetchJson(`${ALLSPORTS_BASE}?met=Fixtures&APIkey=${ALLSPORTS_KEY}&teamId=${teamId}&from=${ago}&to=${today}`, {}, 'allsports fixtures');
      const fixtures = (fixData.result || []).filter(f => f.event_final_result && f.event_final_result !== '?');
      if (fixtures.length === 0) return res.json(null);

      let totalCorners = 0;
      let totalOppCorners = 0;
      let cornerMatches = 0;
      let totalPoss = 0;
      let possMatches = 0;

      for (const f of fixtures) {
        const stats = f.statistics;
        if (!Array.isArray(stats)) continue;
        const isHome = String(f.home_team_key) === String(teamId);

        const cs = stats.find(s => s.type === 'Corners' || s.type === 'Corner Kicks');
        if (cs) {
          const my = parseInt(isHome ? cs.home : cs.away) || 0;
          const opp = parseInt(isHome ? cs.away : cs.home) || 0;
          totalCorners += my;
          totalOppCorners += opp;
          cornerMatches++;
        }
        const ps = stats.find(s => s.type === 'Ball Possession' || s.type === 'Possession');
        if (ps) {
          const pct = parseFloat((isHome ? ps.home : ps.away) || '0');
          if (pct > 0) {
            totalPoss += pct;
            possMatches++;
          }
        }
      }

      if (cornerMatches === 0 && possMatches === 0) return res.json(null);

      const result = {
        avgCorners:    cornerMatches > 0 ? (totalCorners / cornerMatches).toFixed(1) : null,
        avgOppCorners: cornerMatches > 0 ? (totalOppCorners / cornerMatches).toFixed(1) : null,
        avgPossession: possMatches > 0 ? Math.round(totalPoss / possMatches) : null,
        matchesAnalyzed: Math.max(cornerMatches, possMatches),
      };
      await setCache(cacheKey, result, TTL.teamStats);
      return res.json(result);
    } catch (e) {
      console.error('/allsports/team-stats hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
    }
  });

  router.get('/allsports/h2h', async (req, res) => {
    const { home, away } = req.query;
    if (!home || !away) return apiError(res, 400, 'bad_request', 'home ve away parametreleri gerekli', []);
    if (!ALLSPORTS_KEY) return missingConfig(res, 'ALLSPORTS_KEY', []);

    const cacheKey = `allsports_h2h_v1_${home}_${away}`;
    try {
      return res.json(await fetchAllSportsH2HMatches(home, away));
    } catch (e) {
      console.error('/allsports/h2h hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  return router;
}

module.exports = createAllSportsRouter;
