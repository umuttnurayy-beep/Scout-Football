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
  ALLSPORTS_KEY: readEnv('ALLSPORTS_KEY', { optional: true }),
  MONGODB_URI: readEnv('MONGODB_URI', { optional: true }),
  PUSH_TEST_SECRET: readEnv('PUSH_TEST_SECRET', { optional: true }),
  DIAGNOSTICS_SECRET: readEnv('DIAGNOSTICS_SECRET', { optional: true }),
  CORS_ORIGINS: readEnv('CORS_ORIGINS', { optional: true }),
  CURRENT_FOOTBALL_DATA_SEASON:
    process.env.CURRENT_FOOTBALL_DATA_SEASON ||
    process.env.CURRENT_FOOTBALL_SEASON ||
    '2025',
  DISPLAY_FOOTBALL_SEASON:
    process.env.DISPLAY_FOOTBALL_SEASON ||
    '2025/26',

  FOOTBALL_DATA_BASE: 'https://api.football-data.org/v4',
  WEATHER_BASE: 'https://api.weatherapi.com/v1',
  ODDS_BASE: 'https://api.the-odds-api.com/v4',
  ALLSPORTS_BASE: 'https://apiv2.allsportsapi.com/football/',
  SPORTSDB_BASE: 'https://www.thesportsdb.com/api/v1/json/123',
  SL_LEAGUE_ID: '4339',
  CURRENT_SPORTSDB_SEASON:
    process.env.CURRENT_SPORTSDB_SEASON ||
    process.env.SL_SEASON ||
    '2025-2026',
};
