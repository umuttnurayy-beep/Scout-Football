const express = require('express');

function createHealthRouter(getMongoConnected, getExtra = () => ({})) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', mongo: getMongoConnected(), ...getExtra() });
  });

  return router;
}

module.exports = createHealthRouter;
