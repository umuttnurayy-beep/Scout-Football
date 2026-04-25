const express = require('express');

function createHealthRouter(getMongoConnected) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', mongo: getMongoConnected() });
  });

  return router;
}

module.exports = createHealthRouter;
