const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const createHealthRouter = require('./routes/health');
const {
  FOOTBALL_DATA_KEY,
  WEATHER_API_KEY,
  ODDS_API_KEY,
  RAPID_API_KEY,
  ALLSPORTS_KEY,
  MONGODB_URI,
  PUSH_TEST_SECRET,
  FOOTBALL_DATA_BASE,
  WEATHER_BASE,
  ODDS_BASE,
  API_FOOTBALL_BASE,
  ALLSPORTS_BASE,
  SPORTSDB_BASE,
  SL_LEAGUE_ID,
  SL_SEASON,
} = require('./config');

const app = express();
app.use(cors());
app.use(express.json());

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
  playerStats: 6   * 60  * 60  * 1000,
  teamStats:   6   * 60  * 60  * 1000,
  topscorers:  60  * 60  * 1000,
  fixtures:    5   * 60  * 1000,
  fixtureStats:60  * 60  * 1000,
};

// --- API-Football Helper ---
async function apifootball(path) {
  if (!RAPID_API_KEY) throw new Error('RAPID_API_KEY tanımlı değil');
  const res = await fetch(`${API_FOOTBALL_BASE}${path}`, {
    headers: {
      'x-apisports-key': RAPID_API_KEY,
    },
  });
  const json = await res.json();
  if (!json.response || (Array.isArray(json.response) && json.response.length === 0)) {
    console.log(`[AF] boş response | path: ${path} | errors:`, JSON.stringify(json.errors));
  }
  return json.response;
}

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
  if (!FOOTBALL_DATA_KEY) return res.json([]);
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
    res.json([]);
  }
});

app.get('/matches', async (req, res) => {
  const { date } = req.query;
  if (!FOOTBALL_DATA_KEY) return res.json([]);
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
    res.json([]);
  }
});

app.get('/live', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) return res.json([]);
  const cached = await getCache('live');
  if (cached) return res.json(cached);
  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}/matches?status=LIVE,IN_PLAY,PAUSED`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    const data = await response.json();
    await setCache('live', data.matches || [], TTL.live);
    res.json(data.matches || []);
  } catch (e) {
    console.error('/live hata:', e.message);
    res.json([]);
  }
});

app.get('/match/:matchId', async (req, res) => {
  const { matchId } = req.params;
  if (!FOOTBALL_DATA_KEY) return res.json(null);
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
    res.status(500).json({ error: e.message });
  }
});

app.get('/h2h/:matchId', async (req, res) => {
  const { matchId } = req.params;
  if (!FOOTBALL_DATA_KEY) return res.json([]);
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
    res.status(500).json({ error: e.message });
  }
});

app.get('/team/:teamId', async (req, res) => {
  const { teamId } = req.params;
  if (!FOOTBALL_DATA_KEY) return res.json(null);
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
    res.status(500).json({ error: e.message });
  }
});

app.get('/team/:teamId/matches', async (req, res) => {
  const { teamId } = req.params;
  if (!FOOTBALL_DATA_KEY) return res.json([]);
  const cacheKey = `team_matches_${teamId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}/teams/${teamId}/matches?status=FINISHED&limit=10&season=2025`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
    });
    const data = await response.json();
    const matches = Array.isArray(data.matches) && data.matches.length > 0 ? data.matches : null;
    if (matches) await setCache(cacheKey, matches, TTL.h2h);
    res.json(matches || []);
  } catch (e) {
    console.error('/team/:teamId/matches hata:', e.message);
    res.json([]);
  }
});

app.get('/scorers/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  if (!FOOTBALL_DATA_KEY) return res.json([]);
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
    res.status(500).json({ error: e.message });
  }
});

// =====================
// WEATHER & ODDS
// =====================

app.get('/weather', async (req, res) => {
  const { city } = req.query;
  if (!WEATHER_API_KEY || !city) return res.json(null);
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
    res.status(500).json({ error: e.message });
  }
});

app.get('/odds', async (req, res) => {
  const { sport } = req.query;
  if (!ODDS_API_KEY || !sport) return res.json([]);
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
    res.status(500).json({ error: e.message });
  }
});

// =====================
// API-FOOTBALL (RapidAPI) — /af/ prefix
// =====================

// Oyuncu profili + istatistikleri
app.get('/af/player/:playerId', async (req, res) => {
  const { playerId } = req.params;
  const { season = '2024' } = req.query;
  const cacheKey = `af_player_${playerId}_${season}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await apifootball(`/players?id=${playerId}&season=${season}`);
    const result = data?.[0] || null;
    await setCache(cacheKey, result, TTL.playerStats);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Takım istatistikleri (detaylı)
app.get('/af/team-stats/:leagueId/:teamId', async (req, res) => {
  const { leagueId, teamId } = req.params;
  const { season = '2024' } = req.query;
  const cacheKey = `af_teamstats_v2_${leagueId}_${teamId}_${season}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await apifootball(`/teams/statistics?league=${leagueId}&season=${season}&team=${teamId}`);
    if (data) await setCache(cacheKey, data, TTL.teamStats);
    res.json(data || null);
  } catch (e) {
    console.error('/af/team-stats hata:', e.message);
    res.json(null);
  }
});

// Maç istatistikleri (fixture ID ile)
app.get('/af/fixture-stats/:fixtureId', async (req, res) => {
  const { fixtureId } = req.params;
  const cacheKey = `af_fixstats_${fixtureId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await apifootball(`/fixtures/statistics?fixture=${fixtureId}`);
    await setCache(cacheKey, data, TTL.fixtureStats);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Maç oyuncu performansları
app.get('/af/fixture-players/:fixtureId', async (req, res) => {
  const { fixtureId } = req.params;
  const cacheKey = `af_fixplayers_${fixtureId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await apifootball(`/fixtures/players?fixture=${fixtureId}`);
    await setCache(cacheKey, data, TTL.fixtureStats);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Gol krallığı (API-Football — pas, şut, dribbling dahil)
app.get('/af/topscorers/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  const { season = '2025' } = req.query;
  const cacheKey = `af_topscorers_v2_${leagueId}_${season}`;
  const cached = await getCache(cacheKey);
  if (Array.isArray(cached) && cached.length > 0) return res.json(cached);
  try {
    const data = await apifootball(`/players/topscorers?league=${leagueId}&season=${season}`);
    if (Array.isArray(data) && data.length > 0) await setCache(cacheKey, data, TTL.topscorers);
    res.json(data || []);
  } catch (e) {
    console.error('/af/topscorers hata:', e.message);
    res.json([]);
  }
});

// Asist krallığı
app.get('/af/topassists/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  const { season = '2025' } = req.query;
  const cacheKey = `af_topassists_v2_${leagueId}_${season}`;
  const cached = await getCache(cacheKey);
  if (Array.isArray(cached) && cached.length > 0) return res.json(cached);
  try {
    const data = await apifootball(`/players/topassists?league=${leagueId}&season=${season}`);
    if (Array.isArray(data) && data.length > 0) await setCache(cacheKey, data, TTL.topscorers);
    res.json(data || []);
  } catch (e) {
    console.error('/af/topassists hata:', e.message);
    res.json([]);
  }
});

// Takım kadrosu
app.get('/af/squad/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const cacheKey = `af_squad_v2_${teamId}`;
  const cached = await getCache(cacheKey);
  if (Array.isArray(cached) && cached.length > 0) return res.json(cached);
  try {
    const data = await apifootball(`/players/squads?team=${teamId}`);
    const result = data?.[0]?.players || [];
    if (result.length > 0) await setCache(cacheKey, result, TTL.team);
    res.json(result);
  } catch (e) {
    console.error('/af/squad hata:', e.message);
    res.json([]);
  }
});

// Ligdeki tüm takımlar (AF team ID bulmak için — 7 gün cache)
app.get('/af/league-teams/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  const { season = '2025' } = req.query;
  const cacheKey = `af_leagueteams_v2_${leagueId}_${season}`;
  const cached = await getCache(cacheKey);
  if (Array.isArray(cached) && cached.length > 0) return res.json(cached);
  try {
    const data = await apifootball(`/teams?league=${leagueId}&season=${season}`);
    const teams = (data || []).map((t) => ({
      id:   t.team.id,
      name: t.team.name,
      code: t.team.code,
      logo: t.team.logo,
    }));
    if (teams.length > 0) await setCache(cacheKey, teams, 7 * 24 * 60 * 60 * 1000);
    res.json(teams);
  } catch (e) {
    console.error('/af/league-teams hata:', e.message);
    res.json([]);
  }
});

// Fixture detayı (lineup + events dahil)
app.get('/af/fixture/:fixtureId', async (req, res) => {
  const { fixtureId } = req.params;
  const cacheKey = `af_fixture_${fixtureId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await apifootball(`/fixtures?id=${fixtureId}`);
    const result = data?.[0] || null;
    await setCache(cacheKey, result, TTL.fixtures);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  const cacheKey = `superlig_matches_v1_${d}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const r = await fetch(`${SPORTSDB_BASE}/eventsday.php?d=${d}&l=${SL_LEAGUE_ID}`);
    const data = await r.json();
    const events = data.events || [];
    const result = events.map(e => ({
      id:         e.idEvent,
      home:       e.strHomeTeam,
      away:       e.strAwayTeam,
      homeScore:  (e.intHomeScore !== null && e.intHomeScore !== '') ? parseInt(e.intHomeScore) : null,
      awayScore:  (e.intAwayScore !== null && e.intAwayScore !== '') ? parseInt(e.intAwayScore) : null,
      date:       e.dateEvent,
      time:       e.strTime,
      status:     e.strStatus,
      homeTeamId: parseInt(e.idHomeTeam) || 0,
      awayTeamId: parseInt(e.idAwayTeam) || 0,
    }));
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

  const cacheKey = `superlig_form_v2_${teamId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    // Fetch last 15 rounds in parallel to collect last 5 team matches
    const roundNums = Array.from({ length: 15 }, (_, i) => 38 - i); // 38..24
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
      .slice(-5)
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
  const season = req.query.season || '2025';
  if (!FOOTBALL_DATA_KEY) return res.json({});
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

app.get('/af/test', async (req, res) => {
  if (!RAPID_API_KEY) return res.json({ ok: false, error: 'RAPID_API_KEY tanımlı değil' });
  try {
    const r = await fetch(`${API_FOOTBALL_BASE}/status`, {
      headers: { 'x-apisports-key': RAPID_API_KEY },
    });
    const json = await r.json();
    res.json({
      ok: true,
      account: json.response?.account,
      requests: json.response?.requests,
      subscription: json.response?.subscription,
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
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

// Takım adı normalizasyonu (Türkçe karakter)
function normPush(s) {
  return (s || '').toLowerCase()
    .replace(/ç/g,'c').replace(/ş/g,'s').replace(/ğ/g,'g')
    .replace(/ü/g,'u').replace(/ö/g,'o').replace(/ı/g,'i').replace(/İ/g,'i')
    .replace(/[^a-z0-9]/g,'');
}

function teamMatchesPush(teamName, home, away) {
  const n = normPush(teamName), h = normPush(home), a = normPush(away);
  return h.includes(n) || a.includes(n) || n.includes(h) || n.includes(a);
}

// Günlük analiz bildirimi (saat 10:00 Türkiye = 07:00 UTC)
async function sendDailyNotifications() {
  if (!mongoConnected) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    let matchCount = 0;
    try {
      const fd = await getCache(`matches_${today}`);
      if (Array.isArray(fd)) matchCount += fd.filter(m => m.status !== 'FINISHED').length;
    } catch {}
    try {
      const sl = await getCache(`superlig_matches_v1_${today}`);
      if (Array.isArray(sl)) matchCount += sl.filter(m => !m.homeScore && m.homeScore !== 0).length;
    } catch {}

    const body = matchCount > 0
      ? `Bugün ${matchCount} maç var. Scout analizini incele.`
      : 'Bugünün maç programı hazır. Scout analizini incele.';

    const dailyUsers   = await PushToken.find({ 'prefs.daily': true });
    const featuredOnly = await PushToken.find({ 'prefs.featured': true, 'prefs.daily': { $ne: true } });

    if (dailyUsers.length)
      await sendPushNotifications(dailyUsers.map(d => d.token), 'Bugünün analizleri hazır ⚽', body);
    if (featuredOnly.length)
      await sendPushNotifications(featuredOnly.map(d => d.token), 'Günün öne çıkan maçı ⭐', body);

    console.log(`Günlük bildirim: ${dailyUsers.length + featuredOnly.length} kullanıcı, ${matchCount} maç`);
  } catch (e) {
    console.error('Günlük bildirim hatası:', e.message);
  }
}

// Maç hatırlatması: maçtan 30 dk önce (FD maçları — utcDate güvenilir)
async function sendMatchReminders() {
  if (!mongoConnected) return;
  try {
    const favUsers = await PushToken.find({ 'prefs.favTeam': true });
    if (!favUsers.length) return;

    const today = new Date().toISOString().split('T')[0];
    let fdMatches = [];
    try {
      const cached = await getCache(`matches_${today}`);
      if (Array.isArray(cached)) fdMatches = cached;
    } catch {}

    const now = new Date();
    const upcoming = fdMatches.filter(m => {
      if (!m.utcDate || m.status === 'FINISHED') return false;
      const diff = (new Date(m.utcDate) - now) / 60000;
      return diff >= 28 && diff <= 33; // 28-33 dk penceresi (her 5 dk check)
    });

    for (const m of upcoming) {
      const home = m.homeTeam?.name || '';
      const away = m.awayTeam?.name || '';
      if (!home || !away) continue;
      const interested = favUsers.filter(u =>
        (u.watchedTeams || []).some(t => teamMatchesPush(t, home, away))
      );
      if (!interested.length) continue;
      await sendPushNotifications(
        interested.map(u => u.token),
        '⚽ Maç başlamak üzere!',
        `${home} - ${away} · 30 dakika kaldı`,
      );
      console.log(`Maç hatırlatması: ${home} - ${away}, ${interested.length} kullanıcı`);
    }
  } catch (e) {
    console.error('Maç hatırlatma hatası:', e.message);
  }
}

// Zamanlayıcı: her 30 saniyede kontrol et
let lastDailyDate = '';
setInterval(async () => {
  if (!mongoConnected) return;
  const now = new Date();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const today = now.toISOString().split('T')[0];

  // 07:00-07:05 UTC (10:00-10:05 Türkiye) — günde bir kez
  if (h === 7 && m < 5 && lastDailyDate !== today) {
    lastDailyDate = today;
    await sendDailyNotifications();
  }

  // Maç hatırlatması: her 5 dakikada bir (:00, :05, :10 ...)
  if (m % 5 === 0) {
    await sendMatchReminders();
  }
}, 30 * 1000);

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ScoutFootball Backend çalışıyor: port ${PORT}`));
