const ESPN_SL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard';
const ESPN_SL_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings';

// AllSports league ID for Turkish Süper Lig
const ALLSPORTS_SL_LEAGUE_ID = '237';

// Keys: ESPN / AllSports / SportsDB name variants → TheSportsDB team ID
const SL_ESPN_TO_SPORTSDB = {
  'Galatasaray':              133804,
  'Galatasaray SK':           133804,
  'Fenerbahce':               133807,
  'Fenerbahce SK':            133807,
  'Fenerbahçe':               133807,
  'Trabzonspor':              133796,
  'Trabzonspor AS':           133796,
  'Besiktas':                 133794,
  'Besiktas JK':              133794,
  'Beşiktaş':                 133794,
  'Istanbul Basaksehir':      134589,
  'Istanbul Basaksehir FK':   134589,
  'Basaksehir FK':            134589,
  'Basaksehir':               134589,
  'Goztepe':                  135891,
  'Göztepe':                  135891,
  'Samsunspor':               133797,
  'Caykur Rizespor':          133885,
  'Rizespor':                 133885,
  'Çaykur Rizespor':          133885,
  'Konyaspor':                133835,
  'Konyaspor Kulubu':         133835,
  'Gaziantep FK':             138092,
  'Gaziantep':                138092,
  'Kocaelispor':              133870,
  'Alanyaspor':               135676,
  'Antalyaspor':              133799,
  'Genclerbirligi':           133798,
  'Gençlerbirliği':           133798,
  'Eyupspor':                 138977,
  'Eyüpspor':                 138977,
  'Kayserispor':              133802,
  'Fatih Karagumruk':         138983,
  'Fatih Karagümrük':         138983,
  'Kasimpasa':                133834,
  'Kasımpaşa':                133834,
  'Sivasspor':                133800,
  'Hatayspor':                137630,
  'Adana Demirspor':          134199,
  'Umraniyespor':             138094,
  'Ümraniyespor':             138094,
  'Pendikspor':               135534,
  'Sakaryaspor':              133879,
  'Bodrum FK':                139327,
  'Bodrumspor':               139327,
  'Çorum FK':                 139328,
  'Corum FK':                 139328,
  'Elazığspor':               133867,
};

function formatDateForEspn(date) {
  return date.replace(/-/g, '');
}

function timeFromIso(isoDate) {
  const time = (isoDate || '').split('T')[1] || '';
  return time.replace('Z', '').split('.')[0] || null;
}

function sportsDbTeamIdForName(name) {
  if (!name) return 0;
  if (SL_ESPN_TO_SPORTSDB[name]) return SL_ESPN_TO_SPORTSDB[name];
  const normalize = v => v
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  const target = normalize(name);
  const match = Object.keys(SL_ESPN_TO_SPORTSDB).find(key => normalize(key) === target);
  return match ? SL_ESPN_TO_SPORTSDB[match] : 0;
}

function mapSportsDbEvent(e) {
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

function normalizeForMap(v) {
  return (v || '')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function createSuperLigService({
  upstream,
  getCache,
  setCache,
  dedupe,
  TTL,
  ttlForMatchDate,
  isLiveStatus,
  sportsDbBase,
  slLeagueId,
  currentSportsDbSeason,
  allSportsBase,
  allSportsKey,
}) {
  // Map AllSports fixture → normalized form match (same shape as TheSportsDB path)
  function mapAllSportsFixture(f) {
    const parts = (f.event_final_result || '').split(' - ');
    const homeScore = parseInt(parts[0]);
    const awayScore = parseInt(parts[1]);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;
    const homeId = sportsDbTeamIdForName(f.event_home_team);
    const awayId = sportsDbTeamIdForName(f.event_away_team);
    return {
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeScore,
      awayScore,
      date: f.event_date,
      home: f.event_home_team,
      away: f.event_away_team,
      source: 'allsports',
    };
  }

  // Fetch all finished SL fixtures for the current season from AllSports
  async function fetchAllSportsSeasonFixtures() {
    if (!allSportsKey || !allSportsBase) return [];
    const yearStart = (currentSportsDbSeason || '2025-2026').split('-')[0];
    const yearEnd   = (currentSportsDbSeason || '2025-2026').split('-')[1] || String(Number(yearStart) + 1);
    const cacheKey  = `sl_allsports_fixtures_v1_${currentSportsDbSeason}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;

      const from = `${yearStart}-07-01`;
      const to   = `${yearEnd}-07-01`;
      const data = await upstream.fetchJson(
        `${allSportsBase}?met=Fixtures&leagueId=${ALLSPORTS_SL_LEAGUE_ID}&from=${from}&to=${to}&APIkey=${allSportsKey}`,
        {},
        'allsports superlig season fixtures',
      );
      const finished = (data.result || [])
        .filter(f => f.event_status === 'Finished' && f.event_final_result)
        .map(mapAllSportsFixture)
        .filter(Boolean)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (finished.length > 0) {
        await setCache(cacheKey, finished, TTL.seasonFixtures);
        console.log(`[superlig] AllSports season fixtures loaded: ${finished.length} matches`);
      }
      return finished;
    });
  }

  async function fetchSeasonEvents() {
    const cacheKey = `superlig_season_events_${currentSportsDbSeason}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const data = await upstream.fetchJson(
        `${sportsDbBase}/eventsseason.php?id=${slLeagueId}&s=${currentSportsDbSeason}`,
        {},
        'sportsdb superlig season events',
      );
      const events = Array.isArray(data.events) ? data.events : [];
      if (events.length > 0) await setCache(cacheKey, events, TTL.seasonFixtures);
      return events;
    });
  }

  async function fetchEspnMatches(date) {
    const data = await upstream.fetchJson(
      `${ESPN_SL_SCOREBOARD}?dates=${formatDateForEspn(date)}`,
      {},
      'espn superlig scoreboard',
    );
    const events = Array.isArray(data.events) ? data.events : [];
    return events.map(event => mapEspnSuperLigEvent(event, date));
  }

  async function fetchStandings() {
    const cacheKey = 'superlig_standings_v3';
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const data = await upstream.fetchJson(ESPN_SL_STANDINGS, {}, 'espn superlig standings');
      const entries = data?.children?.[0]?.standings?.entries || [];
      if (entries.length === 0) return [];
      const result = entries.map(e => {
        const stats = {};
        for (const s of (e.stats || [])) {
          if ('value' in s) stats[s.name] = s.value;
        }
        const espnName = e.team?.displayName || '';
        return {
          pos:    Math.round(stats.rank    || 0),
          team:   espnName,
          teamId: SL_ESPN_TO_SPORTSDB[espnName] || 0,
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

  async function fetchMatchesForDate(date) {
    const d = date || new Date().toISOString().split('T')[0];
    const cacheKey = `superlig_matches_v2_${d}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;

      const data = await upstream.fetchJson(
        `${sportsDbBase}/eventsday.php?d=${d}&l=${slLeagueId}`,
        {},
        'sportsdb superlig matches',
      );
      let events = data.events || [];
      if (events.length === 0) {
        const seasonEvents = await fetchSeasonEvents();
        events = seasonEvents.filter(e => e.dateEvent === d || e.dateEventLocal === d);
      }
      let result = events.map(mapSportsDbEvent);
      if (result.length === 0) {
        result = await fetchEspnMatches(d);
      }
      if (result.length > 0) {
        await setCache(cacheKey, result, ttlForMatchDate(d, result.some(m => isLiveStatus(m.status))));
      }
      return result;
    });
  }

  async function fetchTeamFormMatches(teamId) {
    const tid = parseInt(teamId);
    if (!tid) return [];
    const cacheKey = `superlig_form_season_v4_${tid}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;

      // Primary: AllSports full season fixtures (TheSportsDB free tier returns only ~15 events)
      try {
        const allSportsFixtures = await fetchAllSportsSeasonFixtures();
        if (allSportsFixtures.length > 15) {
          const teamMatches = allSportsFixtures.filter(
            f => f.homeTeamId === tid || f.awayTeamId === tid,
          );
          if (teamMatches.length > 0) {
            await setCache(cacheKey, teamMatches, TTL.teamStats);
            return teamMatches;
          }
        }
      } catch (e) {
        console.error('[superlig] AllSports fixtures fallback failed:', e.message);
      }

      // Fallback: TheSportsDB season events
      const allEvents = await fetchSeasonEvents();
      const teamMatches = allEvents
        .filter(e =>
          (parseInt(e.idHomeTeam) === tid || parseInt(e.idAwayTeam) === tid) &&
          e.intHomeScore !== null && e.intHomeScore !== '' && e.intHomeScore !== undefined,
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

  async function fetchTeamContext(teamId) {
    const tid = parseInt(teamId);
    if (!tid) return null;
    const cacheKey = `superlig_team_context_v1_${tid}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const [recentMatches, standings] = await Promise.all([
        fetchTeamFormMatches(tid),
        fetchStandings(),
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

  async function fetchMatch(eventId) {
    const cacheKey = `superlig_match_v1_${eventId}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const data = await upstream.fetchJson(
        `${sportsDbBase}/lookupevent.php?id=${eventId}`,
        {},
        'sportsdb superlig match',
      );
      const event = data?.events?.[0] || null;
      if (!event) return null;
      const isFinished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event.strStatus || '');
      const matchDate = event.dateEvent || new Date().toISOString().split('T')[0];
      await setCache(cacheKey, event, isFinished ? TTL.historical : ttlForMatchDate(matchDate, isLiveStatus(event.strStatus)));
      return event;
    });
  }

  return {
    fetchSeasonEvents,
    fetchStandings,
    fetchMatchesForDate,
    fetchTeamFormMatches,
    fetchTeamContext,
    fetchMatch,
    SL_ESPN_TO_SPORTSDB,
    sportsDbTeamIdForName,
  };
}

module.exports = { createSuperLigService, SL_ESPN_TO_SPORTSDB };
