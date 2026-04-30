const express = require('express');

function createDiagnosticsRouter({
  getCachePolicy,
  getCacheStats,
  getFallbackMetrics,
  getMongoConnected,
  PushToken,
  requireDiagnosticsSecret,
  upstream,
}) {
  const router = express.Router();

  router.get('/push/status', async (req, res) => {
    if (!requireDiagnosticsSecret(req, res)) return;
    if (!getMongoConnected()) return res.json({ ok: false, mongo: false, tokenCount: 0 });
    try {
      const tokenCount = await PushToken.countDocuments();
      const dailyCount = await PushToken.countDocuments({ 'prefs.daily': true });
      const favTeamCount = await PushToken.countDocuments({ 'prefs.favTeam': true });
      const featuredCount = await PushToken.countDocuments({ 'prefs.featured': true });
      return res.json({ ok: true, mongo: true, tokenCount, dailyCount, favTeamCount, featuredCount });
    } catch (e) {
      return res.status(500).json({ ok: false, mongo: true, error: e.message });
    }
  });

  router.get('/diagnostics/upstream', async (req, res) => {
    if (!requireDiagnosticsSecret(req, res)) return;
    return res.json({
      ok: true,
      upstream: upstream.getStats(),
      cache: getCacheStats(),
      cachePolicy: getCachePolicy(),
      fallbacks: getFallbackMetrics(),
    });
  });

  return router;
}

module.exports = createDiagnosticsRouter;
