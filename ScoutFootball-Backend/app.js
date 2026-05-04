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
const { createBuildHistory } = require('./utils/buildHistory');
const { createUpstreamJsonClient } = require('./utils/upstream');
const {
  TTL,
  createCache,
  getCachePolicy,
  isLiveStatus,
  ttlForMatchDate,
} = require('./utils/cache');
const { deriveH2HFromTeamMatches } = require('./utils/footballDataH2H');
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

const app = express();
const upstream = createUpstreamJsonClient({ fetchImpl: fetch });
const buildHistory = createBuildHistory({ maxEntries: 20 });

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

let mongoConnected = false;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => { mongoConnected = true; console.log('MongoDB baglandi'); })
    .catch(e => console.error('MongoDB baglanti hatasi:', e.message));
}

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

async function warmFootballDataMatchContext(match) {
  const matchId = Number(match?.id) || 0;
  if (!matchId) return;
  const isFinished = String(match.status || '').toUpperCase() === 'FINISHED';
  const cacheKey = `match_context_v2_${matchId}_${isFinished ? 'finished' : 'active'}`;
  if (await getCache(cacheKey)) return;

  const detail = await fdService.fetchMatch(matchId);
  if (!detail) return;

  const matchFinished = isFinished || String(detail.status || '').toUpperCase() === 'FINISHED';
  const homeTeamId = detail.homeTeam?.id || match.homeTeam?.id || 0;
  const awayTeamId = detail.awayTeam?.id || match.awayTeam?.id || 0;
  const [homeFormR, awayFormR, h2hR] = await Promise.allSettled([
    homeTeamId ? fdService.fetchTeamMatches(homeTeamId) : Promise.resolve([]),
    awayTeamId ? fdService.fetchTeamMatches(awayTeamId) : Promise.resolve([]),
    fdService.fetchH2H(matchId, matchFinished),
  ]);
  const homeForm = homeFormR.status === 'fulfilled' ? homeFormR.value : [];
  const awayForm = awayFormR.status === 'fulfilled' ? awayFormR.value : [];
  let h2h = h2hR.status === 'fulfilled' ? h2hR.value : [];
  if (h2h.length === 0 && homeForm.length > 0 && awayForm.length > 0) {
    h2h = deriveH2HFromTeamMatches({
      homeForm,
      awayForm,
      homeTeam: detail.homeTeam || match.homeTeam,
      awayTeam: detail.awayTeam || match.awayTeam,
      currentMatchId: matchId,
    });
  }

  const payload = {
    match: detail,
    homeForm,
    awayForm,
    h2h,
    issues: [
      ...(homeFormR.status === 'rejected' || awayFormR.status === 'rejected' ? ['form'] : []),
      ...(h2hR.status === 'rejected' && h2h.length === 0 ? ['h2h'] : []),
    ],
    generatedAt: new Date().toISOString(),
  };
  await setCache(cacheKey, payload, fdService.footballDataMatchCacheTtl(detail));
}

async function warmSuperLigMatchContext(match) {
  const eventId = String(match?.id || '');
  if (!eventId) return;
  const homeTeamId = Number(match.homeTeamId) || 0;
  const awayTeamId = Number(match.awayTeamId) || 0;
  const home = match.home || '';
  const away = match.away || '';
  const cacheKey = `superlig_match_context_v3_${eventId}_${homeTeamId}_${awayTeamId}_${home}_${away}`;
  if (await getCache(cacheKey)) return;

  const event = await slService.fetchMatch(eventId);
  if (!event) return;

  const resolvedHomeId = homeTeamId || parseInt(event.idHomeTeam) || 0;
  const resolvedAwayId = awayTeamId || parseInt(event.idAwayTeam) || 0;
  const resolvedHome = home || event.strHomeTeam || '';
  const resolvedAway = away || event.strAwayTeam || '';
  const [homeContextR, awayContextR, h2hR] = await Promise.allSettled([
    resolvedHomeId ? slService.fetchTeamContext(resolvedHomeId) : Promise.resolve(null),
    resolvedAwayId ? slService.fetchTeamContext(resolvedAwayId) : Promise.resolve(null),
    resolvedHome && resolvedAway ? fetchAllSportsH2HMatches(resolvedHome, resolvedAway) : Promise.resolve([]),
  ]);

  const isFinished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event.strStatus || '');
  const matchDate = event.dateEvent || new Date().toISOString().split('T')[0];
  const payload = {
    event,
    homeContext: homeContextR.status === 'fulfilled' ? homeContextR.value : null,
    awayContext: awayContextR.status === 'fulfilled' ? awayContextR.value : null,
    h2h: h2hR.status === 'fulfilled' ? h2hR.value : [],
    issues: [
      ...(homeContextR.status === 'rejected' || awayContextR.status === 'rejected' ? ['form'] : []),
      ...(h2hR.status === 'rejected' ? ['h2h'] : []),
    ],
    generatedAt: new Date().toISOString(),
  };
  await setCache(cacheKey, payload, isFinished ? TTL.historical : ttlForMatchDate(matchDate, isLiveStatus(event.strStatus)));
}

async function warmHomeMatchContexts({ footballDataMatches = [], superLigMatches = [] }) {
  const tasks = [
    ...footballDataMatches.map(match => warmFootballDataMatchContext(match)),
    ...superLigMatches.map(match => warmSuperLigMatchContext(match)),
  ].slice(0, 4);
  await Promise.allSettled(tasks);
}

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
  buildHistory,
  warmMatchContexts: warmHomeMatchContexts,
});

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
  buildHistory,
  getCachePolicy,
  getCacheStats,
  getFallbackMetrics,
  getMongoConnected: () => mongoConnected,
  PushToken,
  requireDiagnosticsSecret,
  upstream,
}));

// Notification scheduling is handled locally in the mobile app.

module.exports = app;
