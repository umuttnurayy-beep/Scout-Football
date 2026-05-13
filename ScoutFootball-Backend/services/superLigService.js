const ESPN_SL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard';
const ESPN_SL_STANDINGS  = 'https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings';
const ESPN_SL_TEAM_BASE  = 'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/teams';

// TheSportsDB team ID → ESPN team ID (for team schedule endpoint)
const SL_SPORTSDB_TO_ESPN_ID = {
  133804: 432,    // Galatasaray
  133807: 436,    // Fenerbahce
  133796: 997,    // Trabzonspor
  133794: 1895,   // Besiktas
  134589: 7914,   // Istanbul Basaksehir
  135891: 789,    // Goztepe
  133797: 11429,  // Samsunspor
  133835: 7648,   // Konyaspor
  133885: 7656,   // Caykur Rizespor
  138092: 20070,  // Gaziantep FK
  133870: 995,    // Kocaelispor
  135676: 9078,   // Alanyaspor
  133834: 6870,   // Kasimpasa
  133798: 996,    // Genclerbirligi
  138977: 20729,  // Eyupspor
  133799: 3794,   // Antalyaspor
  133802: 3643,   // Kayserispor
  138983: 20736,  // Fatih Karagumruk
};

// AllSports league ID for Turkish Süper Lig (237 is common, but may vary by account)
const ALLSPORTS_SL_LEAGUE_ID = '237';

// TheSportsDB team ID → best AllSports search name for team-based fixture lookup
const SL_SPORTSDB_TO_ALLSPORTS_NAME = {
  133804: 'Galatasaray',
  133807: 'Fenerbahce',
  133796: 'Trabzonspor',
  133794: 'Besiktas',
  134589: 'Istanbul Basaksehir',
  135891: 'Goztepe',
  133797: 'Samsunspor',
  133885: 'Caykur Rizespor',
  133835: 'Konyaspor',
  138092: 'Gaziantep FK',
  133870: 'Kocaelispor',
  135676: 'Alanyaspor',
  133799: 'Antalyaspor',
  133798: 'Genclerbirligi',
  138977: 'Eyupspor',
  133802: 'Kayserispor',
  138983: 'Fatih Karagumruk',
  133834: 'Kasimpasa',
  133800: 'Sivasspor',
  137630: 'Hatayspor',
  134199: 'Adana Demirspor',
  138094: 'Umraniyespor',
  135534: 'Pendikspor',
  133879: 'Sakaryaspor',
  139327: 'Bodrum',
  139328: 'Corum',
  133867: 'Elazig',
};

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

const ALL_TEAMS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

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

  // Fetch all finished SL fixtures for the current season from AllSports (league-wide)
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
        { timeoutMs: 5000 },
        'allsports superlig season fixtures',
      );
      const finished = (data.result || [])
        .filter(f => f.event_status === 'Finished' && f.event_final_result)
        .map(mapAllSportsFixture)
        .filter(Boolean)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (finished.length > 0) {
        await setCache(cacheKey, finished, TTL.seasonFixtures);
        console.log(`[superlig] AllSports league fixtures loaded: ${finished.length} matches`);
      } else {
        console.warn(`[superlig] AllSports leagueId=${ALLSPORTS_SL_LEAGUE_ID} returned 0 finished matches — will use per-team fallback`);
      }
      return finished;
    });
  }

  // ESPN team schedule — primary source for SL team form (no key needed, full season)
  async function fetchEspnTeamSchedule(tid) {
    const espnId = SL_SPORTSDB_TO_ESPN_ID[tid];
    if (!espnId) return [];

    const data = await upstream.fetchJson(
      `${ESPN_SL_TEAM_BASE}/${espnId}/schedule`,
      {},
      'espn sl team schedule',
    );

    const events = Array.isArray(data.events) ? data.events : [];
    const finished = [];

    for (const event of events) {
      const comp = (event.competitions || [])[0];
      if (!comp) continue;
      if (!comp.status?.type?.completed) continue;

      const comps = comp.competitors || [];
      const home = comps.find(c => c.homeAway === 'home');
      const away = comps.find(c => c.homeAway === 'away');
      if (!home || !away) continue;

      const getScore = c => {
        const s = c.score;
        if (s === null || s === undefined) return null;
        if (typeof s === 'object') return parseInt(s.displayValue ?? s.value ?? 0);
        return parseInt(s);
      };

      const homeScore = getScore(home);
      const awayScore = getScore(away);
      if (homeScore === null || isNaN(homeScore) || awayScore === null || isNaN(awayScore)) continue;

      const homeName = home.team?.displayName || home.team?.name || '';
      const awayName = away.team?.displayName || away.team?.name || '';
      const isHome   = parseInt(home.team?.id) === espnId;

      finished.push({
        homeTeamId: isHome ? tid : (sportsDbTeamIdForName(homeName) || 0),
        awayTeamId: isHome ? (sportsDbTeamIdForName(awayName) || 0) : tid,
        homeScore,
        awayScore,
        date:  (event.date || '').split('T')[0],
        home:  homeName,
        away:  awayName,
        source: 'espn',
      });
    }

    return finished.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // Per-team AllSports fixture lookup — fallback when league ID is wrong/unavailable
  async function fetchAllSportsTeamFixtures(tid) {
    if (!allSportsKey || !allSportsBase) return [];
    const teamName = SL_SPORTSDB_TO_ALLSPORTS_NAME[tid];
    if (!teamName) return [];

    const yearStart = (currentSportsDbSeason || '2025-2026').split('-')[0];
    const yearEnd   = (currentSportsDbSeason || '2025-2026').split('-')[1] || String(Number(yearStart) + 1);
    const from = `${yearStart}-07-01`;
    const to   = `${yearEnd}-07-01`;

    // Cache the AllSports team_key for 30 days (team IDs don't change)
    const teamKeyCacheKey = `sl_as_teamkey_v1_${tid}`;
    let teamKey = await getCache(teamKeyCacheKey);
    if (!teamKey) {
      const teamData = await upstream.fetchJson(
        `${allSportsBase}?met=Teams&APIkey=${allSportsKey}&teamName=${encodeURIComponent(teamName)}`,
        { timeoutMs: 5000 },
        'allsports team lookup',
      );
      const team = (teamData.result || [])[0];
      if (!team?.team_key) {
        console.warn(`[superlig] AllSports team not found: ${teamName}`);
        return [];
      }
      teamKey = team.team_key;
      await setCache(teamKeyCacheKey, teamKey, 30 * 24 * 60 * 60 * 1000);
    }

    const fixtureData = await upstream.fetchJson(
      `${allSportsBase}?met=Fixtures&APIkey=${allSportsKey}&teamId=${teamKey}&from=${from}&to=${to}`,
      { timeoutMs: 5000 },
      'allsports team season fixtures',
    );

    const finished = (fixtureData.result || [])
      .filter(f => f.event_status === 'Finished' && f.event_final_result)
      .map(mapAllSportsFixture)
      .filter(Boolean)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log(`[superlig] AllSports per-team fixtures for ${teamName} (key=${teamKey}): ${finished.length} matches`);
    return finished;
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

  async function fetchAllSuperLigTeams() {
    const cacheKey = 'superlig_all_teams_v1';
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const data = await upstream.fetchJson(
        `${sportsDbBase}/lookup_all_teams.php?id=${slLeagueId}`,
        {},
        'sportsdb superlig all teams',
      );
      const teams = (data?.teams || []).map(t => ({
        name: t.strTeam,
        teamId: parseInt(t.idTeam) || 0,
      })).filter(t => t.name && t.teamId > 0);
      if (teams.length === 0) return [];
      await setCache(cacheKey, teams, ALL_TEAMS_TTL_MS);
      return teams;
    });
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
          teamId: sportsDbTeamIdForName(espnName),
          played: Math.round(stats.gamesPlayed || 0),
          win:    Math.round(stats.wins    || 0),
          draw:   Math.round(stats.ties    || 0),
          loss:   Math.round(stats.losses  || 0),
          gf:     Math.round(stats.pointsFor  || 0),
          ga:     Math.round(stats.pointsAgainst || 0),
          pts:    Math.round(stats.points  || 0),
        };
      }).sort((a, b) => a.pos - b.pos);

      // Hardcoded map'te bulunamayan takımlar için TheSportsDB listesinden ID tamamla
      const missing = result.filter(r => r.teamId === 0);
      if (missing.length > 0) {
        try {
          const allTeams = await fetchAllSuperLigTeams();
          if (allTeams.length > 0) {
            for (const row of missing) {
              const normalized = normalizeForMap(row.team);
              const match = allTeams.find(t => normalizeForMap(t.name) === normalized);
              if (match) row.teamId = match.teamId;
            }
          }
        } catch (_) { /* critical değil, ID'siz devam et */ }
      }

      await setCache(cacheKey, result, TTL.standings);
      return result;
    });
  }

  // ESPN'den alınan score'ları takım adına göre SportsDB sonuçlarına uygula
  function enrichScoresFromEspn(sdbResults, espnResults) {
    if (!espnResults || espnResults.length === 0) return sdbResults;
    function norm(s) { return (s || '').toLowerCase().replace(/[^a-z]/g, ''); }
    const espnMap = new Map();
    for (const e of espnResults) {
      espnMap.set(`${norm(e.home)}|${norm(e.away)}`, e);
      espnMap.set(`${norm(e.away)}|${norm(e.home)}`, e);
    }
    return sdbResults.map(m => {
      if (m.homeScore !== null) return m;
      const key = `${norm(m.home)}|${norm(m.away)}`;
      const espn = espnMap.get(key);
      if (!espn || espn.homeScore === null) return m;
      const swapped = norm(m.home) === norm(espn.away);
      return {
        ...m,
        homeScore: swapped ? espn.awayScore : espn.homeScore,
        awayScore: swapped ? espn.homeScore : espn.awayScore,
        status: espn.status || m.status,
      };
    });
  }

  async function fetchMatchesForDate(date) {
    const d = date || new Date().toISOString().split('T')[0];
    const cacheKey = `superlig_matches_v4_${d}`;
    const today = new Date().toISOString().split('T')[0];
    const isPastDate = d < today;

    const cached = await getCache(cacheKey);
    if (cached) {
      // Geçmiş tarihte null score varsa ESPN ile zenginleştir, aynı cache key'e yaz
      if (isPastDate && cached.some(m => m.homeScore === null)) {
        const espnData = await fetchEspnMatches(d).catch(() => []);
        const enriched = enrichScoresFromEspn(cached, espnData);
        await setCache(cacheKey, enriched, TTL.pastMatches);
        return enriched;
      }
      return cached;
    }

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) {
        if (isPastDate && fresh.some(m => m.homeScore === null)) {
          const espnData = await fetchEspnMatches(d).catch(() => []);
          const enriched = enrichScoresFromEspn(fresh, espnData);
          await setCache(cacheKey, enriched, TTL.pastMatches);
          return enriched;
        }
        return fresh;
      }

      // Geçmiş tarihler için eventspastleague.php — tüm sezon biten maçlar
      if (isPastDate) {
        const pastCacheKey = `superlig_past_season_v2_${currentSportsDbSeason}`;
        let pastEvents = await getCache(pastCacheKey);
        if (!pastEvents) {
          const pastData = await upstream.fetchJson(
            `${sportsDbBase}/eventspastleague.php?l=${slLeagueId}&s=${currentSportsDbSeason}`,
            {},
            'sportsdb superlig past season events',
          ).catch(() => ({ events: [] }));
          pastEvents = pastData.events || [];
          if (pastEvents.length > 0) await setCache(pastCacheKey, pastEvents, TTL.pastMatches);
        }
        const dayPastEvents = (pastEvents || []).filter(e => e.dateEvent === d);
        if (dayPastEvents.length > 0) {
          let result = dayPastEvents.map(mapSportsDbEvent);
          if (result.some(m => m.homeScore === null)) {
            const espnData = await fetchEspnMatches(d).catch(() => []);
            result = enrichScoresFromEspn(result, espnData);
          }
          await setCache(cacheKey, result, TTL.pastMatches);
          return result;
        }
      }

      // Step 1: TheSportsDB day events — free tier returns ~3 results but gives us the round number
      const dayData = await upstream.fetchJson(
        `${sportsDbBase}/eventsday.php?d=${d}&l=${slLeagueId}`,
        {},
        'sportsdb superlig matches',
      ).catch(() => ({ events: [] }));
      const dayEvents = dayData.events || [];

      // Step 2: Use round number from day events to fetch ALL matches for that round.
      // eventsround.php has no per-day limit on the free tier.
      let roundEvents = [];
      const round = dayEvents[0]?.intRound || dayEvents[0]?.strRound || null;
      if (round) {
        const roundData = await upstream.fetchJson(
          `${sportsDbBase}/eventsround.php?id=${slLeagueId}&r=${round}&s=${currentSportsDbSeason}`,
          {},
          'sportsdb superlig round events',
        ).catch(() => ({ events: [] }));
        roundEvents = (roundData.events || []).filter(
          e => e.dateEvent === d || e.dateEventLocal === d,
        );
      }

      // Prefer round events (all matches with TheSportsDB IDs); fall back to day events
      const sdbEvents = roundEvents.length > dayEvents.length ? roundEvents : dayEvents;

      if (sdbEvents.length > 0) {
        let result = sdbEvents.map(mapSportsDbEvent);
        if (isPastDate && result.some(m => m.homeScore === null)) {
          const espnData = await fetchEspnMatches(d).catch(() => []);
          result = enrichScoresFromEspn(result, espnData);
        }
        await setCache(cacheKey, result, ttlForMatchDate(d, result.some(m => isLiveStatus(m.status))));
        return result;
      }

      // Step 3: ESPN fallback — all matches but IDs won't work for detail pages
      const espnResult = await fetchEspnMatches(d).catch(() => []);
      if (espnResult.length > 0) {
        await setCache(cacheKey, espnResult, ttlForMatchDate(d, espnResult.some(m => isLiveStatus(m.status))));
        return espnResult;
      }

      return [];
    });
  }

  async function fetchTeamFormMatches(teamId) {
    const tid = parseInt(teamId);
    if (!tid) return [];
    const cacheKey = `superlig_form_season_v7_${tid}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;

      // Attempt 1: ESPN team schedule (public API, no key, full season ~30 matches)
      try {
        const espnMatches = await fetchEspnTeamSchedule(tid);
        if (espnMatches.length > 0) {
          await setCache(cacheKey, espnMatches, TTL.teamStats);
          console.log(`[superlig] ESPN team schedule for tid=${tid}: ${espnMatches.length} matches`);
          return espnMatches;
        }
      } catch (e) {
        console.error('[superlig] ESPN team schedule failed:', e.message);
      }

      // Attempt 2: AllSports league-wide fixtures
      if (allSportsKey && allSportsBase) {
        try {
          const allSportsFixtures = await fetchAllSportsSeasonFixtures();
          if (allSportsFixtures.length > 15) {
            const teamMatches = allSportsFixtures.filter(
              f => f.homeTeamId === tid || f.awayTeamId === tid,
            );
            if (teamMatches.length >= 5) {
              await setCache(cacheKey, teamMatches, TTL.teamStats);
              return teamMatches;
            }
          }

          // Attempt 3: AllSports per-team lookup
          const teamMatches = await fetchAllSportsTeamFixtures(tid);
          if (teamMatches.length >= 5) {
            await setCache(cacheKey, teamMatches, TTL.teamStats);
            return teamMatches;
          }
        } catch (e) {
          console.error('[superlig] AllSports form fetch failed:', e.message);
        }
      }

      // Final fallback: TheSportsDB season events (15-event limit — only cache if sufficient)
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
      // Only cache if we got a reasonable number of matches — avoids poisoning the cache with
      // TheSportsDB's 15-event-per-season hard limit that produces only 1–2 matches per team.
      if (teamMatches.length >= 5) await setCache(cacheKey, teamMatches, TTL.teamStats);
      return teamMatches;
    });
  }

  async function fetchTeamContext(teamId) {
    const tid = parseInt(teamId);
    if (!tid) return null;
    const cacheKey = `superlig_team_context_v3_${tid}`;
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
      const formSource = recentMatches.find(m => m?.source)?.source || 'sportsdb';
      const result = {
        teamId: tid,
        source: isLimited && standingsRow ? 'mixed' : formSource,
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

  async function fetchH2HFromEspn(homeTeamId, awayTeamId) {
    const homeEspnId = SL_SPORTSDB_TO_ESPN_ID[homeTeamId];
    const awayEspnId = SL_SPORTSDB_TO_ESPN_ID[awayTeamId];
    if (!homeEspnId || !awayEspnId) return [];

    const now = new Date();
    const currentSeasonYear = (now.getMonth() + 1) >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const seasons = [currentSeasonYear, currentSeasonYear - 1];

    const seen = new Map();
    for (const season of seasons) {
      try {
        const data = await upstream.fetchJson(
          `${ESPN_SL_TEAM_BASE}/${homeEspnId}/schedule?season=${season}`,
          {},
          `espn sl h2h season ${season}`,
        );
        const events = Array.isArray(data.events) ? data.events : [];
        for (const event of events) {
          const comp = (event.competitions || [])[0];
          if (!comp?.status?.type?.completed) continue;
          const comps = comp.competitors || [];
          const teamIds = comps.map(c => parseInt(c.team?.id));
          if (!teamIds.includes(awayEspnId)) continue;
          const home = comps.find(c => c.homeAway === 'home');
          const away = comps.find(c => c.homeAway === 'away');
          if (!home || !away) continue;
          const getScore = c => {
            const s = c.score;
            if (!s) return null;
            if (typeof s === 'object') return parseInt(s.displayValue ?? s.value ?? 0);
            return parseInt(s);
          };
          const homeScore = getScore(home);
          const awayScore = getScore(away);
          if (homeScore === null || awayScore === null || isNaN(homeScore) || isNaN(awayScore)) continue;
          const dateStr = (event.date || '').split('T')[0];
          const isHomeTeamHome = parseInt(home.team?.id) === homeEspnId;
          seen.set(String(event.id || dateStr), {
            date: dateStr,
            home: home.team?.displayName || '',
            away: away.team?.displayName || '',
            homeScore,
            awayScore,
            homeTeamId: isHomeTeamHome ? homeTeamId : awayTeamId,
            awayTeamId: isHomeTeamHome ? awayTeamId : homeTeamId,
            team1Home:  isHomeTeamHome,
          });
        }
      } catch (e) {
        console.error(`[sl h2h] ESPN season ${season} failed:`, e.message);
      }
    }
    return [...seen.values()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  }

  async function fetchH2HFromSportsDb(homeTeamId, awayTeamId) {
    try {
      const [homeData, awayData] = await Promise.allSettled([
        upstream.fetchJson(`${sportsDbBase}/eventslast.php?id=${homeTeamId}`, { timeoutMs: 5000 }, 'sportsdb eventslast home'),
        upstream.fetchJson(`${sportsDbBase}/eventslast.php?id=${awayTeamId}`, { timeoutMs: 5000 }, 'sportsdb eventslast away'),
      ]);
      const seen = new Map();
      const addEvents = (data) => {
        const events = data?.results || data?.events || [];
        for (const e of events) {
          const hId = parseInt(e.idHomeTeam), aId = parseInt(e.idAwayTeam);
          const isH2H = (hId === homeTeamId && aId === awayTeamId) || (hId === awayTeamId && aId === homeTeamId);
          if (!isH2H || e.intHomeScore == null || e.intHomeScore === '') continue;
          seen.set(e.idEvent, {
            date:       e.dateEvent,
            home:       e.strHomeTeam,
            away:       e.strAwayTeam,
            homeScore:  parseInt(e.intHomeScore),
            awayScore:  parseInt(e.intAwayScore),
            homeTeamId: hId,
            awayTeamId: aId,
            team1Home:  hId === homeTeamId,
          });
        }
      };
      if (homeData.status === 'fulfilled') addEvents(homeData.value);
      if (awayData.status === 'fulfilled') addEvents(awayData.value);
      return [...seen.values()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
    } catch (e) {
      return [];
    }
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
    fetchAllSuperLigTeams,
    fetchMatchesForDate,
    fetchTeamFormMatches,
    fetchTeamContext,
    fetchMatch,
    fetchH2HFromEspn,
    fetchH2HFromSportsDb,
    SL_ESPN_TO_SPORTSDB,
    sportsDbTeamIdForName,
  };
}

module.exports = { createSuperLigService, SL_ESPN_TO_SPORTSDB };
