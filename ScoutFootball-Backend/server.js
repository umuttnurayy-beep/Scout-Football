const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const createHealthRouter = require('./routes/health');
const {
  FOOTBALL_DATA_KEY,
  WEATHER_API_KEY,
  ODDS_API_KEY,
  ALLSPORTS_KEY,
  MONGODB_URI,
  PUSH_TEST_SECRET,
  DIAGNOSTICS_SECRET,
  CURRENT_FOOTBALL_SEASON,
  FOOTBALL_DATA_BASE,
  WEATHER_BASE,
  ODDS_BASE,
  ALLSPORTS_BASE,
  SPORTSDB_BASE,
  SL_LEAGUE_ID,
  SL_SEASON,
} = require('./config');

const app = express();
app.use(cors());
app.use(express.json());

function apiError(res, status, code, message, data) {
  return res.status(status).json({
    ok: false,
    error: { code, message },
    data,
  });
}

function missingConfig(res, name, data) {
  return apiError(res, 503, 'missing_config', `${name} is not configured`, data);
}

function requireDiagnosticsSecret(req, res) {
  if (!DIAGNOSTICS_SECRET) {
    apiError(res, 404, 'not_found', 'diagnostics disabled', null);
    return false;
  }
  if (req.headers['x-diagnostics-secret'] !== DIAGNOSTICS_SECRET) {
    apiError(res, 403, 'forbidden', 'forbidden', null);
    return false;
  }
  return true;
}

// --- MongoDB Persistent Cache ---
const cacheSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true },
  data:      mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, required: true },
});
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const CacheModel = mongoose.model('Cache', cacheSchema);

let mongoConnected = false;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => { mongoConnected = true; console.log('MongoDB bağlandı'); })
    .catch(e => console.error('MongoDB bağlantı hatası:', e.message));
}

// --- Cache Helpers (MongoDB önce, RAM fallback) ---
const memCache = {};

async function getCache(key) {
  if (mongoConnected) {
    try {
      const doc = await CacheModel.findOne({ key, expiresAt: { $gt: new Date() } });
      if (doc) return doc.data;
    } catch {}
  }
  const item = memCache[key];
  if (!item) return null;
  if (Date.now() > item.expiresAt) { delete memCache[key]; return null; }
  return item.data;
}

async function setCache(key, data, ttlMs) {
  const expiresAt = new Date(Date.now() + ttlMs);
  if (mongoConnected) {
    try {
      await CacheModel.findOneAndUpdate({ key }, { data, expiresAt }, { upsert: true, new: true });
      return;
    } catch {}
  }
  memCache[key] = { data, expiresAt: Date.now() + ttlMs };
}

const TTL = {
  live:        30  * 1000,
  matches:     60  * 1000,
  standings:   60  * 60  * 1000,
  h2h:         60  * 60  * 1000,
  weather:     10  * 60  * 1000,
  odds:        5   * 60  * 1000,
  team:        24  * 60  * 60  * 1000,
  teamStats:   6   * 60  * 60  * 1000,
  seasonFixtures: 6 * 60  * 60  * 1000,
  topscorers:  60  * 60  * 1000,
};

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
  const res = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`);
  const data = await res.json();
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

app.get('/standings/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const cacheKey = `standings_v3_${leagueId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}/competitions/${leagueId}/standings`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    const data = await response.json();
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
    apiError(res, 502, 'upstream_error', e.message, []);
  }
});

app.get('/matches', async (req, res) => {
  const { date } = req.query;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const cacheKey = `matches_${date || 'today'}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const today = date || new Date().toISOString().split('T')[0];
    const response = await fetch(`${FOOTBALL_DATA_BASE}/matches?date=${today}`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    const data = await response.json();
    await setCache(cacheKey, data.matches || [], TTL.matches);
    res.json(data.matches || []);
  } catch (e) {
    console.error('/matches hata:', e.message);
    apiError(res, 502, 'upstream_error', e.message, []);
  }
});

app.get('/match/:matchId', async (req, res) => {
  const { matchId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', null);
  const cacheKey = `match_${matchId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}/matches/${matchId}`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    const data = await response.json();
    await setCache(cacheKey, data, TTL.live);
    res.json(data);
  } catch (e) {
    apiError(res, 502, 'upstream_error', e.message, null);
  }
});

app.get('/h2h/:matchId', async (req, res) => {
  const { matchId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const isFinished = req.query.finished === '1';
  const cacheKey = `h2h_${matchId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}/matches/${matchId}/head2head?limit=10`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    const data = await response.json();
    const ttl = isFinished ? TTL.h2h : 24 * 60 * 60 * 1000;
    await setCache(cacheKey, data.matches || [], ttl);
    res.json(data.matches || []);
  } catch (e) {
    apiError(res, 502, 'upstream_error', e.message, []);
  }
});

app.get('/team/:teamId', async (req, res) => {
  const { teamId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', null);
  const cacheKey = `team_${teamId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}/teams/${teamId}`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    const data = await response.json();
    await setCache(cacheKey, data, TTL.team);
    res.json(data);
  } catch (e) {
    apiError(res, 502, 'upstream_error', e.message, null);
  }
});

app.get('/team/:teamId/matches', async (req, res) => {
  const { teamId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const cacheKey = `team_matches_season_v2_${teamId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}/teams/${teamId}/matches?status=FINISHED&limit=50&season=${CURRENT_FOOTBALL_SEASON}`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    const data = await response.json();
    const matches = Array.isArray(data.matches) && data.matches.length > 0 ? data.matches : null;
    if (matches) await setCache(cacheKey, matches, TTL.h2h);
    res.json(matches || []);
  } catch (e) {
    console.error('/team/:teamId/matches hata:', e.message);
    apiError(res, 502, 'upstream_error', e.message, []);
  }
});

app.get('/scorers/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', []);
  const cacheKey = `scorers_${leagueId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}/competitions/${leagueId}/scorers?limit=100`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    const data = await response.json();
    await setCache(cacheKey, data.scorers || [], TTL.standings);
    res.json(data.scorers || []);
  } catch (e) {
    apiError(res, 502, 'upstream_error', e.message, []);
  }
});

// =====================
// WEATHER & ODDS
// =====================

app.get('/weather', async (req, res) => {
  const { city } = req.query;
  if (!city) return apiError(res, 400, 'bad_request', 'city is required', null);
  if (!WEATHER_API_KEY) return missingConfig(res, 'WEATHER_API_KEY', null);
  const cacheKey = `weather_${city}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const response = await fetch(
      `${WEATHER_BASE}/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(city)}&lang=tr`
    );
    const data = await response.json();
    const result = {
      temp:      data.current.temp_c,
      condition: data.current.condition.text,
      wind:      data.current.wind_kph,
      humidity:  data.current.humidity,
      city:      data.location.name,
    };
    await setCache(cacheKey, result, TTL.weather);
    res.json(result);
  } catch (e) {
    apiError(res, 502, 'upstream_error', e.message, null);
  }
});

app.get('/odds', async (req, res) => {
  const { sport } = req.query;
  if (!sport) return apiError(res, 400, 'bad_request', 'sport is required', []);
  if (!ODDS_API_KEY) return missingConfig(res, 'ODDS_API_KEY', []);
  const cacheKey = `odds_${sport}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const response = await fetch(
      `${ODDS_BASE}/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`
    );
    const data = await response.json();
    await setCache(cacheKey, data, TTL.odds);
    res.json(data);
  } catch (e) {
    apiError(res, 502, 'upstream_error', e.message, []);
  }
});

// =====================
// HEALTH
// =====================

app.use(createHealthRouter(() => mongoConnected));

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
  const cacheKey = `superlig_season_events_${SL_SEASON}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const r = await fetch(`${SPORTSDB_BASE}/eventsseason.php?id=${SL_LEAGUE_ID}&s=${SL_SEASON}`);
  const data = await r.json();
  const events = Array.isArray(data.events) ? data.events : [];
  if (events.length > 0) await setCache(cacheKey, events, TTL.seasonFixtures);
  return events;
}

function formatDateForEspn(date) {
  return date.replace(/-/g, '');
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
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=${formatDateForEspn(date)}`);
  const data = await r.json();
  const events = Array.isArray(data.events) ? data.events : [];
  return events.map(event => mapEspnSuperLigEvent(event, date));
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
    const response = await fetch(`${ALLSPORTS_BASE}?met=Teams&APIkey=${ALLSPORTS_KEY}&teamName=${encodeURIComponent(query)}`);
    const data = await response.json();
    const team = (data.result || [])[0];
    if (team) return team;
  }
  return null;
}

app.get('/superlig/standings', async (req, res) => {
  const cacheKey = 'superlig_standings_v3';
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings');
    const data = await r.json();
    const entries = data?.children?.[0]?.standings?.entries || [];
    if (entries.length === 0) return res.json([]);
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
    res.json(result);
  } catch (e) {
    console.error('/superlig/standings hata:', e.message);
    res.json([]);
  }
});

app.get('/superlig/matches', async (req, res) => {
  const { date } = req.query;
  const d = date || new Date().toISOString().split('T')[0];
  const cacheKey = `superlig_matches_v2_${d}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await fetch(`${SPORTSDB_BASE}/eventsday.php?d=${d}&l=${SL_LEAGUE_ID}`);
    const data = await r.json();
    let events = data.events || [];
    if (events.length === 0) {
      const seasonEvents = await fetchSuperLigSeasonEvents();
      events = seasonEvents.filter(e => e.dateEvent === d || e.dateEventLocal === d);
    }
    let result = events.map(mapSuperLigEvent);
    if (result.length === 0) {
      result = await fetchEspnSuperLigMatches(d);
    }
    const isPast = new Date(d) <= new Date();
    if (result.length > 0) await setCache(cacheKey, result, isPast ? TTL.matches : TTL.standings);
    res.json(result);
  } catch (e) {
    console.error('/superlig/matches hata:', e.message);
    res.json([]);
  }
});

app.get('/superlig/team-form/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const tid = parseInt(teamId);
  if (!tid) return res.json([]);

  const cacheKey = `superlig_form_season_v3_${teamId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    // Fetch all rounds so form cards can calculate current-season home/away splits.
    const roundNums = Array.from({ length: 38 }, (_, i) => i + 1);
    const roundResults = await Promise.all(
      roundNums.map(r =>
        fetch(`${SPORTSDB_BASE}/eventsround.php?id=${SL_LEAGUE_ID}&r=${r}&s=${SL_SEASON}`)
          .then(resp => resp.json())
          .then(d => d.events || [])
          .catch(() => [])
      )
    );

    const allEvents = roundResults.flat();
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
    res.json(teamMatches);
  } catch (e) {
    console.error('/superlig/team-form hata:', e.message);
    res.json([]);
  }
});

app.get('/superlig/players/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const cacheKey = `superlig_players_v1_${teamId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await fetch(`${SPORTSDB_BASE}/lookup_all_players.php?id=${teamId}`);
    const data = await r.json();
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
    res.json([]);
  }
});

app.get('/superlig/scorers', async (req, res) => {
  const cacheKey = 'superlig_scorers_v2';
  const cached = await getCache(cacheKey);
  if (Array.isArray(cached) && cached.length > 0) return res.json(cached);
  try {
    const r = await fetch(`${SPORTSDB_BASE}/eventspastleague.php?l=${SL_LEAGUE_ID}&s=${SL_SEASON}`);
    const data = await r.json();
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
    res.json([]);
  }
});

app.get('/superlig/match/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const cacheKey = `superlig_match_v1_${eventId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await fetch(`${SPORTSDB_BASE}/lookupevent.php?id=${eventId}`);
    const data = await r.json();
    const event = data?.events?.[0] || null;
    if (!event) return res.json(null);
    const isFinished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event.strStatus || '');
    await setCache(cacheKey, event, isFinished ? TTL.h2h : TTL.matches);
    res.json(event);
  } catch (e) {
    console.error('/superlig/match/:eventId hata:', e.message);
    res.json(null);
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
  const season = req.query.season || CURRENT_FOOTBALL_SEASON;
  if (!FOOTBALL_DATA_KEY) return missingConfig(res, 'FOOTBALL_DATA_KEY', {});
  const cacheKey = `ucl_knockouts_v5_${season}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await fetch(
      `${FOOTBALL_DATA_BASE}/competitions/CL/matches?season=${season}`,
      { headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY } }
    );
    const data = await r.json();
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
    res.status(500).json({ error: e.message });
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
  if (!ALLSPORTS_KEY) return res.json(null);
  try {
    // Takım adıyla arama
    const teamRes = await fetch(`${ALLSPORTS_BASE}?met=Teams&APIkey=${ALLSPORTS_KEY}&teamName=${encodeURIComponent(teamName)}`);
    const teamData = await teamRes.json();
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
    const fixRes = await fetch(`${ALLSPORTS_BASE}?met=Fixtures&APIkey=${ALLSPORTS_KEY}&teamId=${teamId}&from=${ago}&to=${today}`);
    const fixData = await fixRes.json();
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
    await setCache(cacheKey, result, 24 * 60 * 60 * 1000);
    res.json(result);
  } catch (e) {
    console.error('/allsports/team-stats hata:', e.message);
    res.json(null);
  }
});

// ─── AllSports H2H ────────────────────────────────────────────────────────────
app.get('/allsports/h2h', async (req, res) => {
  const { home, away } = req.query;
  if (!home || !away) return res.status(400).json({ error: 'home ve away parametreleri gerekli' });
  if (!ALLSPORTS_KEY) return res.json([]);

  const cacheKey = `allsports_h2h_v1_${home}_${away}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [homeTeam, awayTeam] = await Promise.all([
      findAllSportsTeam(home),
      findAllSportsTeam(away),
    ]);
    if (!homeTeam || !awayTeam) return res.json([]);

    const h2hRes = await fetch(`${ALLSPORTS_BASE}?met=H2H&APIkey=${ALLSPORTS_KEY}&firstTeamId=${homeTeam.team_key}&secondTeamId=${awayTeam.team_key}`);
    const h2hData = await h2hRes.json();

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

    if (matches.length > 0) await setCache(cacheKey, matches, 6 * 60 * 60 * 1000);
    res.json(matches);
  } catch (e) {
    console.error('/allsports/h2h hata:', e.message);
    res.json([]);
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

app.post('/register-token', async (req, res) => {
  const { token, prefs, watchedTeams } = req.body;
  if (!token) return res.status(400).json({ ok: false, error: 'token gerekli' });
  if (!mongoConnected) return res.json({ ok: false, error: 'db yok' });
  try {
    await PushToken.findOneAndUpdate(
      { token },
      { token, prefs: prefs || {}, watchedTeams: watchedTeams || [], updatedAt: new Date() },
      { upsert: true, new: true },
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('register-token hatası:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/push/status', async (req, res) => {
  if (!requireDiagnosticsSecret(req, res)) return;
  if (!mongoConnected) return res.json({ ok: false, mongo: false, tokenCount: 0 });
  try {
    const tokenCount = await PushToken.countDocuments();
    const dailyCount = await PushToken.countDocuments({ 'prefs.daily': true });
    const favTeamCount = await PushToken.countDocuments({ 'prefs.favTeam': true });
    const featuredCount = await PushToken.countDocuments({ 'prefs.featured': true });
    res.json({ ok: true, mongo: true, tokenCount, dailyCount, favTeamCount, featuredCount });
  } catch (e) {
    res.status(500).json({ ok: false, mongo: true, error: e.message });
  }
});

app.post('/push/test', async (req, res) => {
  if (!PUSH_TEST_SECRET || req.headers['x-push-test-secret'] !== PUSH_TEST_SECRET) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const { token, title = 'ScoutFootball test', body = 'Push bildirimi test mesajı' } = req.body || {};
  if (!token) return res.status(400).json({ ok: false, error: 'token gerekli' });
  try {
    await sendPushNotifications([token], title, body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Expo Push Service üzerinden bildirim gönder
async function sendPushNotifications(tokens, title, body) {
  if (!tokens.length) return;
  const messages = tokens.map(t => ({ to: t, title, body, sound: 'default' }));
  // Max 100 mesaj per request
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk),
      });
      const data = await res.json();
      // Geçersiz token'ları temizle
      if (data.data) {
        for (let j = 0; j < data.data.length; j++) {
          if (data.data[j].status === 'error' &&
              data.data[j].details?.error === 'DeviceNotRegistered') {
            try { await PushToken.deleteOne({ token: chunk[j].to }); } catch {}
          }
        }
      }
    } catch (e) {
      console.error('Expo push hatası:', e.message);
    }
  }
}

// Notification scheduling is handled locally in the mobile app. The backend
// keeps token registration/status/test endpoints for diagnostics and future
// server-side campaigns, but does not run automatic push cron jobs.

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ScoutFootball Backend çalışıyor: port ${PORT}`));
