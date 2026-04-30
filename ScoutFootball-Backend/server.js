const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const createDiagnosticsRouter = require('./routes/diagnostics');
const createHealthRouter = require('./routes/health');
const { createPushRouter } = require('./routes/push');
const createWeatherOddsRouter = require('./routes/weatherOdds');
const { createHomeService } = require('./services/homeService');
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

// --- MongoDB Persistent Cache ---
const cacheSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true },
  data:      mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, required: true },
});
const CacheModel = mongoose.model('Cache', cacheSchema);

let mongoConnected = false;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => { mongoConnected = true; console.log('MongoDB bağlandı'); })
    .catch(e => console.error('MongoDB bağlantı hatası:', e.message));
}

// --- Cache Helpers (MongoDB önce, RAM fallback) ---
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

// =====================
// FOOTBALL-DATA.ORG
// =====================

// ESPN fallback for leagues not covered by football-data.org free tier
const FD_TO_ESPN_SLUG = {
  '2019': 'ita.1',          // Serie A
  '2015': 'fra.1',          // Ligue 1
  '2001': 'uefa.champions', // UCL
};

async function fetchEspnStandings(slug) {
  const data = await upstream.fetchJson(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`, {}, 'espn standings');
  const entries = data.children?.[0]?.standings?.entries || [];
  if (entries.length === 0) return [];
  return entries.map((entry, idx) => {
    const sm = {};
    for (const s of (entry.stats || [])) sm[s.name] = s.value;
    return {
      pos:    idx + 1,
      team:   entry.team?.displayName || entry.team?.name || '?',
      teamId: 0,
      played: sm.gamesPlayed   || 0,
      win:    sm.wins          || 0,
      draw:   sm.ties          || 0,
      loss:   sm.losses        || 0,
      gf:     sm.pointsFor     || 0,
      ga:     sm.pointsAgainst || 0,
      pts:    sm.points        || 0,
    };
  });
}

function hasMatchTeamNames(match) {
  return Boolean(
    (match.homeTeam?.shortName || match.homeTeam?.name) &&
    (match.awayTeam?.shortName || match.awayTeam?.name)
  );
}

function formatDateForEspn(date) {
  return date.replace(/-/g, '');
}

function minutesBetweenDates(a, b) {
  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) return Number.POSITIVE_INFINITY;
  return Math.abs(aTime - bTime) / 60000;
}

function mapEspnStatusToFootballData(event) {
  const state = event.status?.type?.state;
  const completed = event.status?.type?.completed;
  if (completed) return 'FINISHED';
  if (state === 'in') return 'IN_PLAY';
  return 'TIMED';
}

function mapEspnTeam(competitor, fallback) {
  const team = competitor?.team || {};
  const name = team.displayName || team.name || team.shortDisplayName || fallback;
  return {
    id: parseInt(team.id) || 0,
    name,
    shortName: team.shortDisplayName || team.name || name,
    tla: team.abbreviation || '',
    crest: team.logo || team.logos?.[0]?.href || null,
  };
}

function mapEspnEventToFootballDataMatch(event, date) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home');
  const away = competitors.find(c => c.homeAway === 'away');
  const homeScore = home?.score !== undefined ? parseInt(home.score) : null;
  const awayScore = away?.score !== undefined ? parseInt(away.score) : null;
  const status = mapEspnStatusToFootballData(event);

  return {
    area: { id: 2077, name: 'Europe', code: 'EUR', flag: 'https://crests.football-data.org/EUR.svg' },
    competition: { id: 2001, name: 'UEFA Champions League', code: 'CL', type: 'CUP', emblem: 'https://crests.football-data.org/CL.png' },
    season: { startDate: `${CURRENT_FOOTBALL_DATA_SEASON}-07-01`, endDate: `${Number(CURRENT_FOOTBALL_DATA_SEASON) + 1}-06-30`, winner: null },
    id: parseInt(event.id) || 0,
    utcDate: event.date || competition.date || `${date}T00:00:00Z`,
    status,
    matchday: event.season?.type || null,
    stage: event.season?.slug?.toUpperCase()?.replace(/-/g, '_') || null,
    group: null,
    lastUpdated: new Date().toISOString(),
    homeTeam: mapEspnTeam(home, 'Home'),
    awayTeam: mapEspnTeam(away, 'Away'),
    score: {
      winner: null,
      duration: 'REGULAR',
      fullTime: {
        home: status === 'FINISHED' ? homeScore : null,
        away: status === 'FINISHED' ? awayScore : null,
      },
      halfTime: { home: null, away: null },
    },
    odds: {},
    referees: [],
  };
}

async function fetchEspnScoreboardMatches(slug, date) {
  const data = await upstream.fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${formatDateForEspn(date)}`, {}, 'espn scoreboard');
  const events = Array.isArray(data.events) ? data.events : [];
  return events.map(event => mapEspnEventToFootballDataMatch(event, date));
}

function isSameMatchTime(a, b) {
  return minutesBetweenDates(a, b) <= 120;
}

function mergeByMatchTime(matches, fallbackMatches) {
  const result = [...matches];
  for (const fallback of fallbackMatches) {
    const existingIndex = result.findIndex(match =>
      match.competition?.id === fallback.competition?.id &&
      isSameMatchTime(match.utcDate, fallback.utcDate)
    );

    if (existingIndex === -1) {
      result.push(fallback);
      continue;
    }

    if (!hasMatchTeamNames(result[existingIndex]) && hasMatchTeamNames(fallback)) {
      result[existingIndex] = {
        ...result[existingIndex],
        homeTeam: { ...fallback.homeTeam, id: result[existingIndex].homeTeam?.id || fallback.homeTeam.id },
        awayTeam: { ...fallback.awayTeam, id: result[existingIndex].awayTeam?.id || fallback.awayTeam.id },
      };
    }
  }
  return result;
}

async function repairFootballDataMatches(matches, date) {
  const uclMatches = matches.filter(m => m.competition?.id === 2001);
  const needsUclRepair = uclMatches.length === 0 || uclMatches.some(m => !hasMatchTeamNames(m));
  if (!needsUclRepair) return matches;

  try {
    const espnMatches = await fetchEspnScoreboardMatches('uefa.champions', date);
    if (espnMatches.length === 0) return matches;
    return mergeByMatchTime(matches, espnMatches.filter(hasMatchTeamNames));
  } catch (e) {
    console.error('[matches] UCL ESPN repair failed:', e.message);
    return matches;
  }
}

async function fetchStandingsForLeague(leagueId) {
  if (!FOOTBALL_DATA_KEY) return [];
  const cacheKey = `standings_v3_${leagueId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;

    const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/competitions/${leagueId}/standings`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    }, 'football-data standings');
    const table = data.standings?.[0]?.table || [];
    const result = table.map(item => ({
      pos:    item.position,
      team:   item.team.name,
      teamId: item.team.id,
      crest:  item.team.crest,
      played: item.playedGames,
      win:    item.won,
      draw:   item.draw,
      loss:   item.lost,
      gf:     item.goalsFor,
      ga:     item.goalsAgainst,
      pts:    item.points,
    }));

    if (result.length > 0) {
      await setCache(cacheKey, result, TTL.standings);
      return result;
    }

    const espnSlug = FD_TO_ESPN_SLUG[leagueId];
    if (espnSlug) {
      console.log(`[standings] football-data.org empty for ${leagueId}, trying ESPN (${espnSlug})`);
      const espnResult = await fetchEspnStandings(espnSlug);
      if (espnResult.length > 0) {
        await setCache(cacheKey, espnResult, TTL.standings);
        return espnResult;
      }
    }

    return [];
  });
}

async function fetchFootballDataMatchesForDate(date) {
  if (!FOOTBALL_DATA_KEY) return [];
  const cacheKey = `matches_v2_${date || 'today'}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;

    const today = date || new Date().toISOString().split('T')[0];
    const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/matches?date=${today}`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    }, 'football-data matches');
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const repairedMatches = await repairFootballDataMatches(matches, today);
    const renderableMatches = repairedMatches.filter(hasMatchTeamNames);
    await setCache(cacheKey, renderableMatches, ttlForMatchDate(today, renderableMatches.some(m => isLiveStatus(m.status))));
    return renderableMatches;
  });
}

function footballDataMatchCacheTtl(match) {
  const status = String(match?.status || '').toUpperCase();
  if (status === 'FINISHED') return TTL.historical;
  const matchDate = String(match?.utcDate || '').split('T')[0];
  return ttlForMatchDate(matchDate, isLiveStatus(status));
}

async function fetchFootballDataMatch(matchId) {
  const cacheKey = `match_${matchId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;
    const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/matches/${matchId}`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    }, 'football-data match');
    await setCache(cacheKey, data, footballDataMatchCacheTtl(data));
    return data;
  });
}

async function fetchFootballDataH2H(matchId, isFinished) {
  const cacheKey = `h2h_${matchId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;
    const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/matches/${matchId}/head2head?limit=10`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    }, 'football-data h2h');
    const matches = data.matches || [];
    const ttl = isFinished ? TTL.historical : TTL.h2h;
    await setCache(cacheKey, matches, ttl);
    return matches;
  });
}

async function fetchFootballDataTeamMatches(teamId) {
  const cacheKey = `team_matches_season_v2_${teamId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;
    const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/teams/${teamId}/matches?status=FINISHED&limit=50&season=${CURRENT_FOOTBALL_DATA_SEASON}`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    }, 'football-data team matches');
    const matches = Array.isArray(data.matches) && data.matches.length > 0 ? data.matches : [];
    if (matches.length > 0) await setCache(cacheKey, matches, TTL.teamStats);
    return matches;
  });
}

app.get('/standings/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const cacheKey = `standings_v3_${leagueId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/competitions/${leagueId}/standings`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    }, 'football-data standings');
    const table = data.standings?.[0]?.table || [];
    const result = table.map(item => ({
      pos:    item.position,
      team:   item.team.name,
      teamId: item.team.id,
      crest:  item.team.crest,
      played: item.playedGames,
      win:    item.won,
      draw:   item.draw,
      loss:   item.lost,
      gf:     item.goalsFor,
      ga:     item.goalsAgainst,
      pts:    item.points,
    }));

    if (result.length > 0) {
      await setCache(cacheKey, result, TTL.standings);
      return res.json(result);
    }

    // Football-data.org returned empty — try ESPN free API as fallback
    const espnSlug = FD_TO_ESPN_SLUG[leagueId];
    if (espnSlug) {
      console.log(`[standings] football-data.org empty for ${leagueId}, trying ESPN (${espnSlug})`);
      const espnResult = await fetchEspnStandings(espnSlug);
      if (espnResult.length > 0) {
        await setCache(cacheKey, espnResult, TTL.standings);
        return res.json(espnResult);
      }
    }

    res.json([]);
  } catch (e) {
    console.error('/standings hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

app.get('/matches', async (req, res) => {
  const { date } = req.query;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const cacheKey = `matches_v2_${date || 'today'}`;
  try {
    res.json(await fetchFootballDataMatchesForDate(date));
  } catch (e) {
    console.error('/matches hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

app.get('/match/:matchId/context', async (req, res) => {
  const { matchId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', null);

  const isFinished = req.query.finished === '1';
  const cacheKey = `match_context_v1_${matchId}_${isFinished ? 'finished' : 'active'}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ ok: true, data: cached });

  try {
    const match = await fetchFootballDataMatch(matchId);
    if (!match) return apiError(res, 404, 'not_found', 'match not found', null);

    const matchFinished = isFinished || String(match.status || '').toUpperCase() === 'FINISHED';
    const homeTeamId = match.homeTeam?.id || 0;
    const awayTeamId = match.awayTeam?.id || 0;
    const [homeFormR, awayFormR, h2hR] = await Promise.allSettled([
      homeTeamId ? fetchFootballDataTeamMatches(homeTeamId) : Promise.resolve([]),
      awayTeamId ? fetchFootballDataTeamMatches(awayTeamId) : Promise.resolve([]),
      fetchFootballDataH2H(matchId, matchFinished),
    ]);

    const issues = [];
    if (homeFormR.status === 'rejected' || awayFormR.status === 'rejected') issues.push('form');
    if (h2hR.status === 'rejected') issues.push('h2h');

    const payload = {
      match,
      homeForm: homeFormR.status === 'fulfilled' ? homeFormR.value : [],
      awayForm: awayFormR.status === 'fulfilled' ? awayFormR.value : [],
      h2h: h2hR.status === 'fulfilled' ? h2hR.value : [],
      issues,
      generatedAt: new Date().toISOString(),
    };

    await setCache(cacheKey, payload, footballDataMatchCacheTtl(match));
    return res.json({ ok: true, data: payload });
  } catch (e) {
    console.error('/match/:matchId/context hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
  }
});

app.get('/match/:matchId', async (req, res) => {
  const { matchId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', null);
  const cacheKey = `match_${matchId}`;
  try {
    res.json(await fetchFootballDataMatch(matchId));
  } catch (e) {
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
  }
});

app.get('/h2h/:matchId', async (req, res) => {
  const { matchId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const isFinished = req.query.finished === '1';
  const cacheKey = `h2h_${matchId}`;
  try {
    res.json(await fetchFootballDataH2H(matchId, isFinished));
  } catch (e) {
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

app.get('/team/:teamId', async (req, res) => {
  const { teamId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', null);
  const cacheKey = `team_${teamId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/teams/${teamId}`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    }, 'football-data team');
    await setCache(cacheKey, data, TTL.team);
    res.json(data);
  } catch (e) {
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
  }
});

app.get('/team/:teamId/matches', async (req, res) => {
  const { teamId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const cacheKey = `team_matches_season_v2_${teamId}`;
  try {
    res.json(await fetchFootballDataTeamMatches(teamId));
  } catch (e) {
    console.error('/team/:teamId/matches hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

app.get('/scorers/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const cacheKey = `scorers_${leagueId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await upstream.fetchJson(`${FOOTBALL_DATA_BASE}/competitions/${leagueId}/scorers?limit=100`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    }, 'football-data scorers');
    await setCache(cacheKey, data.scorers || [], TTL.standings);
    res.json(data.scorers || []);
  } catch (e) {
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

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

// =====================
// HEALTH
// =====================

app.use(createHealthRouter(() => mongoConnected, () => ({
  seasons: {
    footballData: CURRENT_FOOTBALL_DATA_SEASON,
    sportsDb: CURRENT_SPORTSDB_SEASON,
    display: DISPLAY_FOOTBALL_SEASON,
  },
})));

// =====================
// SÜPER LİG (TheSportsDB)
// =====================

// ESPN team name → TheSportsDB team ID mapping for Süper Lig
const SL_ESPN_TO_SPORTSDB = {
  'Galatasaray':       133804,
  'Fenerbahce':        133807,
  'Trabzonspor':       133796,
  'Besiktas':          133794,
  'Istanbul Basaksehir': 134589,
  'Goztepe':           135891,
  'Samsunspor':        133797,
  'Caykur Rizespor':   133885,
  'Konyaspor':         133835,
  'Gaziantep FK':      138092,
  'Kocaelispor':       133870,
  'Alanyaspor':        135676,
  'Antalyaspor':       133799,
  'Genclerbirligi':    133798,
  'Eyupspor':          138977,
  'Kayserispor':       133802,
  'Fatih Karagumruk':  138983,
};

function mapSuperLigEvent(e) {
  return {
    id:         e.idEvent,
    home:       e.strHomeTeam,
    away:       e.strAwayTeam,
    homeScore:  (e.intHomeScore !== null && e.intHomeScore !== '') ? parseInt(e.intHomeScore) : null,
    awayScore:  (e.intAwayScore !== null && e.intAwayScore !== '') ? parseInt(e.intAwayScore) : null,
    date:       e.dateEvent,
    time:       e.strTime,
    status:     e.strStatus,
    round:      e.intRound || e.strRound || null,
    venue:      e.strVenue || null,
    homeTeamId: parseInt(e.idHomeTeam) || 0,
    awayTeamId: parseInt(e.idAwayTeam) || 0,
  };
}

function sportsDbTeamIdForName(name) {
  if (!name) return 0;
  if (SL_ESPN_TO_SPORTSDB[name]) return SL_ESPN_TO_SPORTSDB[name];

  const normalize = value => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const target = normalize(name);
  const match = Object.keys(SL_ESPN_TO_SPORTSDB).find(key => normalize(key) === target);
  return match ? SL_ESPN_TO_SPORTSDB[match] : 0;
}

async function fetchSuperLigSeasonEvents() {
  const cacheKey = `superlig_season_events_${CURRENT_SPORTSDB_SEASON}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;

    const data = await upstream.fetchJson(`${SPORTSDB_BASE}/eventsseason.php?id=${SL_LEAGUE_ID}&s=${CURRENT_SPORTSDB_SEASON}`, {}, 'sportsdb superlig season events');
    const events = Array.isArray(data.events) ? data.events : [];
    if (events.length > 0) await setCache(cacheKey, events, TTL.seasonFixtures);
    return events;
  });
}

function timeFromIso(isoDate) {
  const time = (isoDate || '').split('T')[1] || '';
  return time.replace('Z', '').split('.')[0] || null;
}

function mapEspnSuperLigEvent(event, fallbackDate) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home') || {};
  const away = competitors.find(c => c.homeAway === 'away') || {};
  const homeName = home.team?.displayName || home.team?.name || home.team?.shortDisplayName || '';
  const awayName = away.team?.displayName || away.team?.name || away.team?.shortDisplayName || '';
  const completed = event.status?.type?.completed || competition.status?.type?.completed || false;
  const status = completed ? 'Match Finished' : (event.status?.type?.description || 'Scheduled');

  return {
    id:         event.id,
    home:       homeName,
    away:       awayName,
    homeScore:  completed && home.score !== undefined ? parseInt(home.score) : null,
    awayScore:  completed && away.score !== undefined ? parseInt(away.score) : null,
    date:       (event.date || competition.date || '').split('T')[0] || fallbackDate,
    time:       timeFromIso(event.date || competition.date),
    status,
    round:      null,
    venue:      competition.venue?.fullName || event.venue?.displayName || null,
    homeTeamId: sportsDbTeamIdForName(homeName),
    awayTeamId: sportsDbTeamIdForName(awayName),
  };
}

async function fetchEspnSuperLigMatches(date) {
  const data = await upstream.fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=${formatDateForEspn(date)}`, {}, 'espn superlig scoreboard');
  const events = Array.isArray(data.events) ? data.events : [];
  return events.map(event => mapEspnSuperLigEvent(event, date));
}

async function fetchSuperLigStandingsCached() {
  const cacheKey = 'superlig_standings_v3';
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;

    const data = await upstream.fetchJson('https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings', {}, 'espn superlig standings');
    const entries = data?.children?.[0]?.standings?.entries || [];
    if (entries.length === 0) return [];
    const result = entries.map(e => {
      const stats = {};
      for (const s of (e.stats || [])) {
        if ('value' in s) stats[s.name] = s.value;
      }
      const espnName = e.team?.displayName || '';
      const teamId = SL_ESPN_TO_SPORTSDB[espnName] || 0;
      return {
        pos:    Math.round(stats.rank    || 0),
        team:   espnName,
        teamId,
        played: Math.round(stats.gamesPlayed || 0),
        win:    Math.round(stats.wins    || 0),
        draw:   Math.round(stats.ties    || 0),
        loss:   Math.round(stats.losses  || 0),
        gf:     Math.round(stats.pointsFor  || 0),
        ga:     Math.round(stats.pointsAgainst || 0),
        pts:    Math.round(stats.points  || 0),
      };
    }).sort((a, b) => a.pos - b.pos);
    await setCache(cacheKey, result, TTL.standings);
    return result;
  });
}

async function fetchSuperLigMatchesForDate(date) {
  const d = date || new Date().toISOString().split('T')[0];
  const cacheKey = `superlig_matches_v2_${d}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;

    const data = await upstream.fetchJson(`${SPORTSDB_BASE}/eventsday.php?d=${d}&l=${SL_LEAGUE_ID}`, {}, 'sportsdb superlig matches');
    let events = data.events || [];
    if (events.length === 0) {
      const seasonEvents = await fetchSuperLigSeasonEvents();
      events = seasonEvents.filter(e => e.dateEvent === d || e.dateEventLocal === d);
    }
    let result = events.map(mapSuperLigEvent);
    if (result.length === 0) {
      result = await fetchEspnSuperLigMatches(d);
    }
    if (result.length > 0) await setCache(cacheKey, result, ttlForMatchDate(d, result.some(m => isLiveStatus(m.status))));
    return result;
  });
}

async function fetchSuperLigTeamFormMatches(teamId) {
  const tid = parseInt(teamId);
  if (!tid) return [];

  const cacheKey = `superlig_form_season_v3_${tid}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;

    const allEvents = await fetchSuperLigSeasonEvents();
    const teamMatches = allEvents
      .filter(e =>
        (parseInt(e.idHomeTeam) === tid || parseInt(e.idAwayTeam) === tid) &&
        e.intHomeScore !== null && e.intHomeScore !== '' && e.intHomeScore !== undefined
      )
      .sort((a, b) => new Date(a.dateEvent) - new Date(b.dateEvent))
      .map(e => ({
        homeTeamId: parseInt(e.idHomeTeam),
        awayTeamId: parseInt(e.idAwayTeam),
        homeScore:  parseInt(e.intHomeScore),
        awayScore:  parseInt(e.intAwayScore),
        date:       e.dateEvent,
        home:       e.strHomeTeam,
        away:       e.strAwayTeam,
      }));

    if (teamMatches.length > 0) await setCache(cacheKey, teamMatches, TTL.teamStats);
    return teamMatches;
  });
}

async function fetchSuperLigTeamContext(teamId) {
  const tid = parseInt(teamId);
  if (!tid) return null;

  const cacheKey = `superlig_team_context_v1_${tid}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;

    const [recentMatches, standings] = await Promise.all([
      fetchSuperLigTeamFormMatches(tid),
      fetchSuperLigStandingsCached(),
    ]);
    const standingsRow = standings.find(row => row.teamId === tid) || null;
    const formMatchesCount = recentMatches.length;
    const isLimited = formMatchesCount < 5;
    const result = {
      teamId: tid,
      source: isLimited && standingsRow ? 'mixed' : 'sportsdb',
      isLimited,
      fallbackReason: isLimited
        ? 'TheSportsDB sezon maç listesi bu takım için sınırlı maç bazlı form verisi döndürüyor.'
        : null,
      formMatchesCount,
      recentMatches,
      standingsStats: standingsRow,
    };

    await setCache(cacheKey, result, TTL.teamStats);
    return result;
  });
}

async function fetchSuperLigMatch(eventId) {
  const cacheKey = `superlig_match_v1_${eventId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;
    const data = await upstream.fetchJson(`${SPORTSDB_BASE}/lookupevent.php?id=${eventId}`, {}, 'sportsdb superlig match');
    const event = data?.events?.[0] || null;
    if (!event) return null;
    const isFinished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event.strStatus || '');
    const matchDate = event.dateEvent || new Date().toISOString().split('T')[0];
    await setCache(cacheKey, event, isFinished ? TTL.historical : ttlForMatchDate(matchDate, isLiveStatus(event.strStatus)));
    return event;
  });
}

function normalizeTeamLookupName(value) {
  return (value || '')
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const ALLSPORTS_TEAM_ALIASES = {
  besiktas: ['Besiktas', 'Besiktas JK'],
  gaziantep: ['Gaziantep FK', 'Gaziantep'],
  gaziantepfk: ['Gaziantep FK', 'Gaziantep'],
  caykurrizespor: ['Rizespor', 'Caykur Rizespor', 'Rize'],
  rizespor: ['Rizespor', 'Caykur Rizespor', 'Rize'],
};

function allSportsTeamQueries(name) {
  const aliases = ALLSPORTS_TEAM_ALIASES[normalizeTeamLookupName(name)] || [];
  return [...new Set([name, ...aliases].filter(Boolean))];
}

async function findAllSportsTeam(name) {
  const queries = allSportsTeamQueries(name);
  for (const query of queries) {
    const data = await upstream.fetchJson(`${ALLSPORTS_BASE}?met=Teams&APIkey=${ALLSPORTS_KEY}&teamName=${encodeURIComponent(query)}`, {}, 'allsports team search');
    const team = (data.result || [])[0];
    if (team) return team;
  }
  return null;
}

async function fetchAllSportsH2HMatches(home, away) {
  if (!ALLSPORTS_KEY) throw new Error('ALLSPORTS_KEY missing');
  const cacheKey = `allsports_h2h_v1_${home}_${away}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  return dedupe(cacheKey, async () => {
    const fresh = await getCache(cacheKey);
    if (fresh) return fresh;
    const [homeTeam, awayTeam] = await Promise.all([
      findAllSportsTeam(home),
      findAllSportsTeam(away),
    ]);
    if (!homeTeam || !awayTeam) return [];

    const h2hData = await upstream.fetchJson(`${ALLSPORTS_BASE}?met=H2H&APIkey=${ALLSPORTS_KEY}&firstTeamId=${homeTeam.team_key}&secondTeamId=${awayTeam.team_key}`, {}, 'allsports h2h');

    const matches = (h2hData.result?.H2H || [])
      .filter(m => m.event_status === 'Finished' && m.event_final_result)
      .map(m => {
        const parts = (m.event_final_result || '').split(' - ');
        return {
          date: m.event_date,
          home: m.event_home_team,
          away: m.event_away_team,
          homeScore: parseInt(parts[0]) || 0,
          awayScore: parseInt(parts[1]) || 0,
          league: m.league_name,
          team1Home: m.home_team_key === homeTeam.team_key,
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);

    if (matches.length > 0) await setCache(cacheKey, matches, TTL.historical);
    return matches;
  });
}

app.get('/superlig/standings', async (req, res) => {
  const cacheKey = 'superlig_standings_v3';
  try {
    res.json(await fetchSuperLigStandingsCached());
  } catch (e) {
    console.error('/superlig/standings hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

app.get('/superlig/matches', async (req, res) => {
  const { date } = req.query;
  const d = date || new Date().toISOString().split('T')[0];
  const cacheKey = `superlig_matches_v2_${d}`;
  try {
    res.json(await fetchSuperLigMatchesForDate(date));
  } catch (e) {
    console.error('/superlig/matches hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

const homeService = createHomeService({
  dedupe,
  getCache,
  getStaleCache,
  setCache,
  fetchFootballDataMatchesForDate,
  fetchSuperLigMatchesForDate,
  fetchSuperLigStandingsCached,
  fetchStandingsForLeague,
  hasMatchTeamNames,
  isLiveStatus,
  ttlForMatchDate,
});

app.get('/home', async (req, res) => {
  try {
    res.json(await homeService.buildHome(req.query.date));
  } catch (e) {
    apiError(res, 502, 'upstream_error', e.message, null);
  }
});

app.get('/superlig/team-form/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const tid = parseInt(teamId);
  if (!tid) return apiError(res, 400, 'bad_request', 'invalid teamId', []);
  const cacheKey = `superlig_form_season_v3_${tid}`;

  try {
    res.json(await fetchSuperLigTeamFormMatches(tid));
  } catch (e) {
    console.error('/superlig/team-form hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

app.get('/superlig/team-context/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const tid = parseInt(teamId);
  if (!tid) return apiError(res, 400, 'bad_request', 'invalid teamId', null);
  const cacheKey = `superlig_team_context_v1_${tid}`;

  try {
    res.json(await fetchSuperLigTeamContext(tid));
  } catch (e) {
    console.error('/superlig/team-context hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
  }
});

app.get('/superlig/players/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const cacheKey = `superlig_players_v1_${teamId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await upstream.fetchJson(`${SPORTSDB_BASE}/lookup_all_players.php?id=${teamId}`, {}, 'sportsdb superlig players');
    const players = data.player || [];
    const result = players.map(p => ({
      id:          p.idPlayer,
      name:        p.strPlayer,
      position:    p.strPosition,
      nationality: p.strNationality,
    }));
    if (result.length > 0) await setCache(cacheKey, result, TTL.team);
    res.json(result);
  } catch (e) {
    console.error('/superlig/players hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

app.get('/superlig/scorers', async (req, res) => {
  const cacheKey = 'superlig_scorers_v2';
  const cached = await getCache(cacheKey);
  if (Array.isArray(cached) && cached.length > 0) return res.json(cached);
  try {
    const data = await upstream.fetchJson(`${SPORTSDB_BASE}/eventspastleague.php?l=${SL_LEAGUE_ID}&s=${CURRENT_SPORTSDB_SEASON}`, {}, 'sportsdb superlig scorers');
    const events = data.events || [];

    const scorerMap = {};

    function parseGoalDetails(details, teamName) {
      if (!details) return;
      const parts = details.split(';');
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        // Format: "45':PlayerName" or "45' PlayerName"
        const match = trimmed.match(/^\d+['+]?[:\s](.+)/);
        if (!match) continue;
        const playerName = match[1].trim();
        if (!playerName) continue;
        // Skip own goals
        const lower = playerName.toLowerCase();
        if (lower.includes('og') || lower.includes('own goal') || lower.includes('kendi')) continue;
        if (!scorerMap[playerName]) {
          scorerMap[playerName] = { name: playerName, goals: 0, team: teamName };
        }
        scorerMap[playerName].goals++;
      }
    }

    for (const e of events) {
      parseGoalDetails(e.strHomeGoalDetails, e.strHomeTeam);
      parseGoalDetails(e.strAwayGoalDetails, e.strAwayTeam);
    }

    const result = Object.values(scorerMap)
      .filter(s => s.goals > 0)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 50);

    if (result.length > 0) await setCache(cacheKey, result, TTL.topscorers);
    res.json(result);
  } catch (e) {
    console.error('/superlig/scorers hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

app.get('/superlig/match/:eventId/context', async (req, res) => {
  const { eventId } = req.params;
  const homeTeamId = parseInt(req.query.homeTeamId);
  const awayTeamId = parseInt(req.query.awayTeamId);
  const home = String(req.query.home || '');
  const away = String(req.query.away || '');
  const cacheKey = `superlig_match_context_v1_${eventId}_${homeTeamId || 0}_${awayTeamId || 0}_${home}_${away}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ ok: true, data: cached });

  try {
    const event = await fetchSuperLigMatch(eventId);
    if (!event) return apiError(res, 404, 'not_found', 'match not found', null);

    const resolvedHomeId = homeTeamId || parseInt(event.idHomeTeam) || 0;
    const resolvedAwayId = awayTeamId || parseInt(event.idAwayTeam) || 0;
    const resolvedHome = home || event.strHomeTeam || '';
    const resolvedAway = away || event.strAwayTeam || '';

    const [homeContextR, awayContextR, h2hR] = await Promise.allSettled([
      resolvedHomeId ? fetchSuperLigTeamContext(resolvedHomeId) : Promise.resolve(null),
      resolvedAwayId ? fetchSuperLigTeamContext(resolvedAwayId) : Promise.resolve(null),
      resolvedHome && resolvedAway ? fetchAllSportsH2HMatches(resolvedHome, resolvedAway) : Promise.resolve([]),
    ]);

    const issues = [];
    if (homeContextR.status === 'rejected' || awayContextR.status === 'rejected') issues.push('form');
    if (h2hR.status === 'rejected') issues.push('h2h');

    const isFinished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event.strStatus || '');
    const matchDate = event.dateEvent || new Date().toISOString().split('T')[0];
    const payload = {
      event,
      homeContext: homeContextR.status === 'fulfilled' ? homeContextR.value : null,
      awayContext: awayContextR.status === 'fulfilled' ? awayContextR.value : null,
      h2h: h2hR.status === 'fulfilled' ? h2hR.value : [],
      issues,
      generatedAt: new Date().toISOString(),
    };

    await setCache(cacheKey, payload, isFinished ? TTL.historical : ttlForMatchDate(matchDate, isLiveStatus(event.strStatus)));
    return res.json({ ok: true, data: payload });
  } catch (e) {
    console.error('/superlig/match/:eventId/context hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
  }
});

app.get('/superlig/match/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const cacheKey = `superlig_match_v1_${eventId}`;
  try {
    const event = await fetchSuperLigMatch(eventId);
    if (!event) return apiError(res, 404, 'not_found', 'match not found', null);
    res.json(event);
  } catch (e) {
    console.error('/superlig/match/:eventId hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
  }
});

// =====================
// UCL KNOCKOUT BRACKET
// =====================

// Lig aşaması / eleme stage'leri — bunlar dışındaki her şey knockout sayılır
const NON_KNOCKOUT_STAGES = new Set([
  'LEAGUE_PHASE', 'GROUP_STAGE',
  '1ST_QUALIFYING_ROUND', '2ND_QUALIFYING_ROUND', '3RD_QUALIFYING_ROUND',
  'PRELIMINARY_ROUND', 'PRELIMINARY_SEMI_FINALS', 'PRELIMINARY_FINAL',
]);

// Bilinen play-off varyantlarını tek bir key'e normalize et
function normalizeStage(raw) {
  if (raw === 'LAST_16')                return 'ROUND_OF_16';
  if (raw === 'ROUND_OF_16')            return 'ROUND_OF_16';
  if (raw === 'QUARTER_FINALS')         return 'QUARTER_FINALS';
  if (raw === 'SEMI_FINALS')            return 'SEMI_FINALS';
  if (raw === 'FINAL')                  return 'FINAL';
  // Play-off adı her sezonda değişebilir — hepsini tek key'e topla
  if (raw.includes('PLAY_OFF') || raw.includes('PLAYOFF')) return 'KNOCKOUT_ROUND_PLAY_OFF';
  return raw; // bilinmeyen ama non-knockout değil → olduğu gibi koy
}

app.get('/ucl/knockouts', async (req, res) => {
  const season = req.query.season || CURRENT_FOOTBALL_DATA_SEASON;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', {});
  const cacheKey = `ucl_knockouts_v5_${season}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await upstream.fetchJson(
      `${FOOTBALL_DATA_BASE}/competitions/CL/matches?season=${season}`,
      { headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY } },
      'football-data ucl knockouts'
    );
    const allMatches = data.matches || [];

    const uniqueStages = [...new Set(allMatches.map(m => m.stage))];
    console.log(`[UCL ${season}] Tüm stage'ler:`, uniqueStages);

    const result = {};
    for (const match of allMatches) {
      const raw = match.stage;
      if (!raw || NON_KNOCKOUT_STAGES.has(raw)) continue;
      const key = normalizeStage(raw);
      if (!result[key]) result[key] = [];
      result[key].push(match);
    }

    console.log(`[UCL ${season}] Sonuç key'leri:`, Object.keys(result));
    await setCache(cacheKey, result, TTL.team);
    res.json(result);
  } catch (e) {
    console.error('/ucl/knockouts hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, {});
  }
});

// =====================
// ALLSPORTS — Korner & Possession
// =====================

app.get('/allsports/team-stats/:teamName', async (req, res) => {
  const teamName = decodeURIComponent(req.params.teamName);
  const cacheKey = `allsports_v1_${teamName}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  if (!ALLSPORTS_KEY) return missingConfig(res, 'ALLSPORTS_KEY', null);
  try {
    // Takım adıyla arama
    const teamData = await upstream.fetchJson(`${ALLSPORTS_BASE}?met=Teams&APIkey=${ALLSPORTS_KEY}&teamName=${encodeURIComponent(teamName)}`, {}, 'allsports team search');
    const teams = teamData.result || [];
    if (teams.length === 0) return res.json(null);

    const team = teams.find(t => {
      const n = (t.team_name || '').toLowerCase();
      const q = teamName.toLowerCase();
      return n.includes(q) || q.includes(n);
    }) || teams[0];

    const teamId = team.team_key;

    // Son 3 ayın maçları
    const today = new Date().toISOString().split('T')[0];
    const ago = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fixData = await upstream.fetchJson(`${ALLSPORTS_BASE}?met=Fixtures&APIkey=${ALLSPORTS_KEY}&teamId=${teamId}&from=${ago}&to=${today}`, {}, 'allsports fixtures');
    const fixtures = (fixData.result || []).filter(f => f.event_final_result && f.event_final_result !== '?');
    if (fixtures.length === 0) return res.json(null);

    let totalCorners = 0, totalOppCorners = 0, cornerMatches = 0;
    let totalPoss = 0, possMatches = 0;

    for (const f of fixtures) {
      const stats = f.statistics;
      if (!Array.isArray(stats)) continue;
      const isHome = String(f.home_team_key) === String(teamId);

      const cs = stats.find(s => s.type === 'Corners' || s.type === 'Corner Kicks');
      if (cs) {
        const my = parseInt(isHome ? cs.home : cs.away) || 0;
        const opp = parseInt(isHome ? cs.away : cs.home) || 0;
        totalCorners += my; totalOppCorners += opp; cornerMatches++;
      }
      const ps = stats.find(s => s.type === 'Ball Possession' || s.type === 'Possession');
      if (ps) {
        const pct = parseFloat((isHome ? ps.home : ps.away) || '0');
        if (pct > 0) { totalPoss += pct; possMatches++; }
      }
    }

    if (cornerMatches === 0 && possMatches === 0) return res.json(null);

    const result = {
      avgCorners:    cornerMatches > 0 ? (totalCorners / cornerMatches).toFixed(1) : null,
      avgOppCorners: cornerMatches > 0 ? (totalOppCorners / cornerMatches).toFixed(1) : null,
      avgPossession: possMatches > 0 ? Math.round(totalPoss / possMatches) : null,
      matchesAnalyzed: Math.max(cornerMatches, possMatches),
    };
    await setCache(cacheKey, result, TTL.teamStats);
    res.json(result);
  } catch (e) {
    console.error('/allsports/team-stats hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, null);
  }
});

// ─── AllSports H2H ────────────────────────────────────────────────────────────
app.get('/allsports/h2h', async (req, res) => {
  const { home, away } = req.query;
  if (!home || !away) return apiError(res, 400, 'bad_request', 'home ve away parametreleri gerekli', []);
  if (!ALLSPORTS_KEY) return missingConfig(res, 'ALLSPORTS_KEY', []);

  const cacheKey = `allsports_h2h_v1_${home}_${away}`;
  try {
    res.json(await fetchAllSportsH2HMatches(home, away));
  } catch (e) {
    console.error('/allsports/h2h hata:', e.message);
    return apiStaleOrError(res, cacheKey, 502, 'upstream_error', e.message, []);
  }
});

// ─── Push Notifications ───────────────────────────────────────────────────────

const pushTokenSchema = new mongoose.Schema({
  token:        { type: String, required: true, unique: true },
  prefs:        { daily: Boolean, favTeam: Boolean, featured: Boolean },
  watchedTeams: [String],
  updatedAt:    { type: Date, default: Date.now },
});
const PushToken = mongoose.model('PushToken', pushTokenSchema);

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

// Notification scheduling is handled locally in the mobile app. The backend
// keeps token registration/status/test endpoints for diagnostics and future
// server-side campaigns, but does not run automatic push cron jobs.

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`ScoutFootball Backend çalışıyor: port ${PORT}`));
}

module.exports = app;
