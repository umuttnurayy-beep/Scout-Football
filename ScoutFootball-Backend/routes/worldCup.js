const express = require('express');

function createWorldCupRouter({ apiStaleOrError, fetchWCSeasonFixtures, fetchWCMatchesForDate, fetchWCMatch }) {
  const router = express.Router();

  router.get('/worldcup/season', async (req, res) => {
    try {
      return res.json(await fetchWCSeasonFixtures());
    } catch (e) {
      return apiStaleOrError(res, 'wc_season_v1_2026', 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/worldcup/matches', async (req, res) => {
    const { date } = req.query;
    try {
      return res.json(await fetchWCMatchesForDate(date));
    } catch (e) {
      return apiStaleOrError(res, `wc_matches_v1_${date}`, 502, 'upstream_error', e.message, []);
    }
  });

  router.get('/worldcup/match/:eventId', async (req, res) => {
    const { eventId } = req.params;
    try {
      const match = await fetchWCMatch(eventId);
      if (!match) return res.status(404).json({ error: 'not_found' });
      return res.json(match);
    } catch (e) {
      return apiStaleOrError(res, `wc_match_v1_${eventId}`, 502, 'upstream_error', e.message, null);
    }
  });

  return router;
}

module.exports = { createWorldCupRouter };
