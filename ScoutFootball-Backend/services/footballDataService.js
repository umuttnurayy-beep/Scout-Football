const { hasMatchTeamNames } = require('./espnClient');

// FD league ID → ESPN slug for leagues not on FD free tier
const FD_TO_ESPN_SLUG = {
  '2019': 'ita.1',
  '2015': 'fra.1',
  '2001': 'uefa.champions',
};

function createFootballDataService({
  upstream,
  espnClient,
  getCache,
  setCache,
  dedupe,
  TTL,
  ttlForMatchDate,
  isLiveStatus,
  footballDataBase,
  footballDataKey,
  currentSeason,
}) {
  function footballDataMatchCacheTtl(match) {
    const status = String(match?.status || '').toUpperCase();
    if (status === 'FINISHED') return TTL.historical;
    const matchDate = String(match?.utcDate || '').split('T')[0];
    return ttlForMatchDate(matchDate, isLiveStatus(status));
  }

  async function fetchStandingsForLeague(leagueId) {
    if (!footballDataKey) return [];
    const cacheKey = `standings_v3_${leagueId}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;

      const data = await upstream.fetchJson(
        `${footballDataBase}/competitions/${leagueId}/standings`,
        { headers: { 'X-Auth-Token': footballDataKey } },
        'football-data standings',
      );
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

      const espnSlug = FD_TO_ESPN_SLUG[String(leagueId)];
      if (espnSlug) {
        console.log(`[standings] football-data.org empty for ${leagueId}, trying ESPN (${espnSlug})`);
        const espnResult = await espnClient.fetchStandings(espnSlug);
        if (espnResult.length > 0) {
          await setCache(cacheKey, espnResult, TTL.standings);
          return espnResult;
        }
      }

      return [];
    });
  }

  async function fetchMatchesForDate(date) {
    if (!footballDataKey) return [];
    const cacheKey = `matches_v2_${date || 'today'}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;

      const today = date || new Date().toISOString().split('T')[0];
      const data = await upstream.fetchJson(
        `${footballDataBase}/matches?date=${today}`,
        { headers: { 'X-Auth-Token': footballDataKey } },
        'football-data matches',
      );
      const matches = Array.isArray(data.matches) ? data.matches : [];
      const repairedMatches = await espnClient.repairMatchesWithEspn(matches, today);
      const renderableMatches = repairedMatches.filter(hasMatchTeamNames);
      await setCache(cacheKey, renderableMatches, ttlForMatchDate(today, renderableMatches.some(m => isLiveStatus(m.status))));
      return renderableMatches;
    });
  }

  async function fetchMatch(matchId) {
    const cacheKey = `match_${matchId}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const data = await upstream.fetchJson(
        `${footballDataBase}/matches/${matchId}`,
        { headers: { 'X-Auth-Token': footballDataKey } },
        'football-data match',
      );
      await setCache(cacheKey, data, footballDataMatchCacheTtl(data));
      return data;
    });
  }

  async function fetchH2H(matchId, isFinished) {
    const cacheKey = `h2h_${matchId}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const data = await upstream.fetchJson(
        `${footballDataBase}/matches/${matchId}/head2head?limit=10`,
        { headers: { 'X-Auth-Token': footballDataKey } },
        'football-data h2h',
      );
      const matches = data.matches || [];
      await setCache(cacheKey, matches, isFinished ? TTL.historical : TTL.h2h);
      return matches;
    });
  }

  async function fetchTeamMatches(teamId) {
    const cacheKey = `team_matches_season_v2_${teamId}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const data = await upstream.fetchJson(
        `${footballDataBase}/teams/${teamId}/matches?status=FINISHED&limit=50&season=${currentSeason}`,
        { headers: { 'X-Auth-Token': footballDataKey } },
        'football-data team matches',
      );
      const matches = Array.isArray(data.matches) && data.matches.length > 0 ? data.matches : [];
      if (matches.length > 0) await setCache(cacheKey, matches, TTL.teamStats);
      return matches;
    });
  }

  return {
    footballDataMatchCacheTtl,
    fetchStandingsForLeague,
    fetchMatchesForDate,
    fetchMatch,
    fetchH2H,
    fetchTeamMatches,
  };
}

module.exports = { createFootballDataService };
