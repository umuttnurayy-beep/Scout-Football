const express = require('express');

function createHomeRouter({ apiError, homeService }) {
  const router = express.Router();

  router.get('/home', async (req, res) => {
    try {
      return res.json(await homeService.buildHome(req.query.date));
    } catch (e) {
      return apiError(res, 502, 'upstream_error', e.message, null);
    }
  });

  return router;
}

module.exports = createHomeRouter;
