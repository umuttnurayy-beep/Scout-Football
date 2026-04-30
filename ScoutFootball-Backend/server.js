const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const mongoose = require('mongoose');

const CacheModel = require('./models/cache');
const PushToken = require('./models/pushToken');

const createAllSportsRouter = require('./routes/allsports');
const createDiagnosticsRouter = require('./routes/diagnostics');
const createFootballDataRouter = require('./routes/footballData');
const createHealthRouter = require('./routes/health');
const createHomeRouter = require('./routes/home');
const { createPushRouter } = require('./routes/push');
const createSuperLigRouter = require('./routes/superlig');
const { createUclRouter } = require('./routes/ucl');
const createWeatherOddsRouter = require('./routes/weatherOdds');

const { createAllSportsH2HService } = require('./services/allSportsH2HService');
const { createEspnClient, hasMatchTeamNames } = require('./services/espnClient');
const { createFootballDataService } = require('./services/footballDataService');
const { createHomeService } = require('./services/homeService');
const { createSuperLigService } = require('./services/superLigService');

const { createApiResponder } = require('./utils/apiResponses');
const { createUpstreamJsonClient } = require('./utils/upstream');
const {
  TTL,
  createCache,
  getCachePolicy,
  isLiveStatus,
  ttlForMatchDate,
} = require('./utils/cache');
const {
  FOOTBALL_DATA_KEY,
  WEATHER_API_KEY,
  ODDS_API_KEY,
  ALLSPORTS_KEY,
  MONGODB_URI,
  PUSH_TEST_SECRET,
  DIAGNOSTICS_SECRET,
  CORS_ORIGINS,
  CURRENT_FOOTBALL_DATA_SEASON,
  DISPLAY_FOOTBALL_SEASON,
  FOOTBALL_DATA_BASE,
  WEATHER_BASE,
  ODDS_BASE,
  ALLSPORTS_BASE,
  SPORTSDB_BASE,
  SL_LEAGUE_ID,
  CURRENT_SPORTSDB_SEASON,
} = require('./config');

// ─────────────────────────────────────────────────────────────────────────────
// Express setup
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const upstream = createUpstreamJsonClient({ fetchImpl: fetch });

const allowedOrigins = CORS_ORIGINS
  ? CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : [];

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '64kb' }));

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(publicLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// MongoDB
// ─────────────────────────────────────────────────────────────────────────────

let mongoConnected = false;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => { mongoConnected = true; console.log('MongoDB bağlandı'); })
    .catch(e => console.error('MongoDB bağlantı hatası:', e.message));
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache + API responder
// ─────────────────────────────────────────────────────────────────────────────

const {
  dedupe,
  getCache,
  getStaleCache,
  getStats: getCacheStats,
  setCache,
} = createCache({
  CacheModel,
  isMongoConnected: () => mongoConnected,
});

const {
  apiError,
  apiStaleOrError,
  getFallbackMetrics,
  missingConfig,
  requireDiagnosticsSecret,
} = createApiResponder({
  getStaleCache,
  diagnosticsSecret: DIAGNOSTICS_SECRET,
});

// ─────────────────────────────────────────────────────────────────────────────
// Services
// ─────────────────────────────────────────────────────────────────────────────

const espnClient = createEspnClient({ upstream, currentSeason: CURRENT_FOOTBALL_DATA_SEASON });

const fdService = createFootballDataService({
  upstream,
  espnClient,
  getCache,
  setCache,
  dedupe,
  TTL,
  ttlForMatchDate,
  isLiveStatus,
  footballDataBase: FOOTBALL_DATA_BASE,
  footballDataKey: FOOTBALL_DATA_KEY,
  currentSeason: CURRENT_FOOTBALL_DATA_SEASON,
});

const slService = createSuperLigService({
  upstream,
  getCache,
  setCache,
  dedupe,
  TTL,
  ttlForMatchDate,
  isLiveStatus,
  sportsDbBase: SPORTSDB_BASE,
  slLeagueId: SL_LEAGUE_ID,
  currentSportsDbSeason: CURRENT_SPORTSDB_SEASON,
  allSportsBase: ALLSPORTS_BASE,
  allSportsKey: ALLSPORTS_KEY,
});

const { fetchAllSportsH2HMatches } = createAllSportsH2HService({
  allSportsBase: ALLSPORTS_BASE,
  allSportsKey: ALLSPORTS_KEY,
  dedupe,
  getCache,
  setCache,
  TTL,
  upstream,
});

const homeService = createHomeService({
  dedupe,
  getCache,
  getStaleCache,
  setCache,
  fetchFootballDataMatchesForDate: fdService.fetchMatchesForDate,
  fetchSuperLigMatchesForDate: slService.fetchMatchesForDate,
  fetchSuperLigStandingsCached: slService.fetchStandings,
  fetchStandingsForLeague: fdService.fetchStandingsForLeague,
  hasMatchTeamNames,
  isLiveStatus,
  ttlForMatchDate,
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

app.use(createFootballDataRouter({
  apiError,
  apiStaleOrError,
  config: {
    FOOTBALL_DATA_BASE,
    FOOTBALL_DATA_KEY,
  },
  fetchFootballDataH2H: fdService.fetchH2H,
  fetchFootballDataMatch: fdService.fetchMatch,
  fetchFootballDataMatchesForDate: fdService.fetchMatchesForDate,
  fetchFootballDataTeamMatches: fdService.fetchTeamMatches,
  fetchStandingsForLeague: fdService.fetchStandingsForLeague,
  footballDataMatchCacheTtl: fdService.footballDataMatchCacheTtl,
  getCache,
  missingConfig,
  setCache,
  TTL,
  upstream,
}));

app.use(createWeatherOddsRouter({
  apiError,
  apiStaleOrError,
  config: {
    ODDS_API_KEY,
    ODDS_BASE,
    WEATHER_API_KEY,
    WEATHER_BASE,
  },
  getCache,
  missingConfig,
  setCache,
  TTL,
  upstream,
}));

app.use(createHealthRouter(() => mongoConnected, () => ({
  seasons: {
    footballData: CURRENT_FOOTBALL_DATA_SEASON,
    sportsDb: CURRENT_SPORTSDB_SEASON,
    display: DISPLAY_FOOTBALL_SEASON,
  },
})));

app.use(createSuperLigRouter({
  apiError,
  apiStaleOrError,
  config: {
    CURRENT_SPORTSDB_SEASON,
    SL_LEAGUE_ID,
    SPORTSDB_BASE,
  },
  fetchAllSportsH2HMatches,
  fetchSuperLigMatch: slService.fetchMatch,
  fetchSuperLigMatchesForDate: slService.fetchMatchesForDate,
  fetchSuperLigStandingsCached: slService.fetchStandings,
  fetchSuperLigTeamContext: slService.fetchTeamContext,
  fetchSuperLigTeamFormMatches: slService.fetchTeamFormMatches,
  getCache,
  isLiveStatus,
  setCache,
  TTL,
  ttlForMatchDate,
  upstream,
}));

app.use(createHomeRouter({ apiError, homeService }));

app.use(createUclRouter({
  apiStaleOrError,
  config: {
    CURRENT_FOOTBALL_DATA_SEASON,
    FOOTBALL_DATA_BASE,
    FOOTBALL_DATA_KEY,
  },
  getCache,
  missingConfig,
  setCache,
  TTL,
  upstream,
}));

app.use(createAllSportsRouter({
  apiError,
  apiStaleOrError,
  config: {
    ALLSPORTS_BASE,
    ALLSPORTS_KEY,
  },
  fetchAllSportsH2HMatches,
  getCache,
  missingConfig,
  setCache,
  TTL,
  upstream,
}));

app.use(createPushRouter({
  fetchImpl: fetch,
  getMongoConnected: () => mongoConnected,
  PushToken,
  pushTestSecret: PUSH_TEST_SECRET,
  writeLimiter,
}));

app.use(createDiagnosticsRouter({
  getCachePolicy,
  getCacheStats,
  getFallbackMetrics,
  getMongoConnected: () => mongoConnected,
  PushToken,
  requireDiagnosticsSecret,
  upstream,
}));

// Notification scheduling is handled locally in the mobile app.

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`ScoutFootball Backend çalışıyor: port ${PORT}`));
}

module.exports = app;
