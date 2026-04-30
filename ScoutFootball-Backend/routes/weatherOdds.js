const express = require('express');

function createWeatherOddsRouter({
  apiError,
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
    ODDS_API_KEY,
    ODDS_BASE,
    WEATHER_API_KEY,
    WEATHER_BASE,
  } = config;

  router.get('/weather', async (req, res) => {
    const { city } = req.query;
    if (!city) return apiError(res, 400, 'bad_request', 'city is required', null);
    if (!WEATHER_API_KEY) return missingConfig(res, 'WEATHER_API_KEY', null);
    const cacheKey = `weather_${city}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    try {
      const data = await upstream.fetchJson(
        `${WEATHER_BASE}/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(city)}&lang=tr`,
        {},
        'weather'
      );
      const result = {
        temp:      data.current.temp_c,
        condition: data.current.condition.text,
        wind:      data.current.wind_kph,
        humidity:  data.current.humidity,
        city:      data.location.name,
      };
      await setCache(cacheKey, result, TTL.weather);
      return res.json(result);
    } catch (e) {
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
    }
  });

  router.get('/odds', async (req, res) => {
    const { sport } = req.query;
    if (!sport) return apiError(res, 400, 'bad_request', 'sport is required', []);
    if (!ODDS_API_KEY) return missingConfig(res, 'ODDS_API_KEY', []);
    const cacheKey = `odds_${sport}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    try {
      const data = await upstream.fetchJson(
        `${ODDS_BASE}/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`,
        {},
        'odds'
      );
      await setCache(cacheKey, data, TTL.odds);
      return res.json(data);
    } catch (e) {
      return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
    }
  });

  return router;
}

module.exports = createWeatherOddsRouter;
