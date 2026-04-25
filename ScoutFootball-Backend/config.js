function readEnv(name, { optional = false } = {}) {
  const value = process.env[name] || '';
  if (!value && !optional) {
    console.warn(`[config] ${name} is not set. Related endpoints will return empty data.`);
  }
  return value;
}

module.exports = {
  FOOTBALL_DATA_KEY: readEnv('FOOTBALL_DATA_KEY'),
  WEATHER_API_KEY: readEnv('WEATHER_API_KEY', { optional: true }) || readEnv('WEATHER_KEY'),
  ODDS_API_KEY: readEnv('ODDS_API_KEY'),
  RAPID_API_KEY: readEnv('RAPID_API_KEY', { optional: true }),
  ALLSPORTS_KEY: readEnv('ALLSPORTS_KEY', { optional: true }),
  MONGODB_URI: readEnv('MONGODB_URI', { optional: true }),
  PUSH_TEST_SECRET: readEnv('PUSH_TEST_SECRET', { optional: true }),

  FOOTBALL_DATA_BASE: 'https://api.football-data.org/v4',
  WEATHER_BASE: 'https://api.weatherapi.com/v1',
  ODDS_BASE: 'https://api.the-odds-api.com/v4',
  API_FOOTBALL_BASE: 'https://v3.football.api-sports.io',
  ALLSPORTS_BASE: 'https://apiv2.allsportsapi.com/football/',
  SPORTSDB_BASE: 'https://www.thesportsdb.com/api/v1/json/123',
  SL_LEAGUE_ID: '4339',
  SL_SEASON: '2025-2026',
};
