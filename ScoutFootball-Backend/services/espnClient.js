const ESPN_BASE_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/soccer';
const ESPN_BASE_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

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

function hasMatchTeamNames(match) {
  return Boolean(
    (match.homeTeam?.shortName || match.homeTeam?.name) &&
    (match.awayTeam?.shortName || match.awayTeam?.name),
  );
}

function isSameMatchTime(a, b) {
  return minutesBetweenDates(a, b) <= 120;
}

function mergeByMatchTime(matches, fallbackMatches) {
  const result = [...matches];
  for (const fallback of fallbackMatches) {
    const existingIndex = result.findIndex(match =>
      match.competition?.id === fallback.competition?.id &&
      isSameMatchTime(match.utcDate, fallback.utcDate),
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

function createEspnClient({ upstream, currentSeason }) {
  function mapEspnEventToMatch(event, date) {
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
      season: { startDate: `${currentSeason}-07-01`, endDate: `${Number(currentSeason) + 1}-06-30`, winner: null },
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

  async function fetchStandings(slug) {
    const data = await upstream.fetchJson(`${ESPN_BASE_STANDINGS}/${slug}/standings`, {}, 'espn standings');
    const entries = data.children?.[0]?.standings?.entries || [];
    if (entries.length === 0) return [];
    return entries.map((entry, idx) => {
      const sm = {};
      for (const s of (entry.stats || [])) sm[s.name] = s.value;
      return {
        pos:    idx + 1,
        team:   entry.team?.displayName || entry.team?.name || '?',
        teamId: 0,
        tla:    entry.team?.abbreviation || '',
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

  async function fetchScoreboardMatches(slug, date) {
    const data = await upstream.fetchJson(
      `${ESPN_BASE_SCOREBOARD}/${slug}/scoreboard?dates=${formatDateForEspn(date)}`,
      {},
      'espn scoreboard',
    );
    const events = Array.isArray(data.events) ? data.events : [];
    return events.map(event => mapEspnEventToMatch(event, date));
  }

  async function repairMatchesWithEspn(matches, date) {
    const uclMatches = matches.filter(m => m.competition?.id === 2001);
    const needsRepair = uclMatches.length === 0 || uclMatches.some(m => !hasMatchTeamNames(m));
    if (!needsRepair) return matches;
    try {
      const espnMatches = await fetchScoreboardMatches('uefa.champions', date);
      if (espnMatches.length === 0) return matches;
      return mergeByMatchTime(matches, espnMatches.filter(hasMatchTeamNames));
    } catch (e) {
      console.error('[matches] UCL ESPN repair failed:', e.message);
      return matches;
    }
  }

  return { fetchStandings, fetchScoreboardMatches, repairMatchesWithEspn };
}

module.exports = { createEspnClient, hasMatchTeamNames };
