const express = require('express');

const NON_KNOCKOUT_STAGES = new Set([
  'LEAGUE_PHASE', 'GROUP_STAGE',
  '1ST_QUALIFYING_ROUND', '2ND_QUALIFYING_ROUND', '3RD_QUALIFYING_ROUND',
  'PRELIMINARY_ROUND', 'PRELIMINARY_SEMI_FINALS', 'PRELIMINARY_FINAL',
]);

function normalizeStage(raw) {
  if (raw === 'LAST_16') return 'ROUND_OF_16';
  if (raw === 'ROUND_OF_16') return 'ROUND_OF_16';
  if (raw === 'QUARTER_FINALS') return 'QUARTER_FINALS';
  if (raw === 'SEMI_FINALS') return 'SEMI_FINALS';
  if (raw === 'FINAL') return 'FINAL';
  if (raw.includes('PLAY_OFF') || raw.includes('PLAYOFF')) return 'KNOCKOUT_ROUND_PLAY_OFF';
  return raw;
}

function buildKnockoutStageGroups(matches) {
  const result = {};
  for (const match of matches) {
    const raw = match.stage;
    if (!raw || NON_KNOCKOUT_STAGES.has(raw)) continue;
    const key = normalizeStage(raw);
    if (!result[key]) result[key] = [];
    result[key].push(match);
  }
  return result;
}

function createUclRouter({
  apiStaleOrError,
  config,
  getCache,
  missingConfig,
  setCache,
  TTL,
  upstream,
}) {
  const router = express.Router();
  const {
    CURRENT_FOOTBALL_DATA_SEASON,
    FOOTBALL_DATA_BASE,
    FOOTBALL_DATA_KEY,
  } = config;

  router.get('/ucl/knockouts', async (req, res) => {
    const season = req.query.season || CURRENT_FOOTBALL_DATA_SEASON;
    if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', {});
    const cacheKey = `ucl_knockouts_v5_${season}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    try {
      const data = await upstream.fetchJson(
        `${FOOTBALL_DATA_BASE}/competitions/CL/matches?season=${season}`,
        { headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY } },
        'football-data ucl knockouts'
      );
      const allMatches = data.matches || [];
      const result = buildKnockoutStageGroups(allMatches);
      await setCache(cacheKey, result, TTL.team);
      return res.json(result);
    } catch (e) {
      console.error('/ucl/knockouts hata:', e.message);
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, {});
    }
  });

  return router;
}

module.exports = {
  buildKnockoutStageGroups,
  createUclRouter,
  normalizeStage,
};
