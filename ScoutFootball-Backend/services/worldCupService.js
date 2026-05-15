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
    round:      e.strRound || e.intRound || null,
    venue:      e.strVenue || null,
    homeTeamId: parseInt(e.idHomeTeam) || 0,
    awayTeamId: parseInt(e.idAwayTeam) || 0,
  };
}

function createWorldCupService({ upstream, getCache, setCache, dedupe, TTL, ttlForMatchDate, isLiveStatus, sportsDbBase, wcLeagueId, wcSeason }) {

  async function fetchSeasonFixtures() {
    const cacheKey = `wc_season_v1_${wcSeason}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;
    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const data = await upstream.fetchJson(
        `${sportsDbBase}/eventsseason.php?id=${wcLeagueId}&s=${wcSeason}`,
        {}, 'sportsdb wc season'
      );
      const events = (data.events || []).map(mapSportsDbEvent);
      if (events.length > 0) await setCache(cacheKey, events, TTL.seasonFixtures);
      return events;
    });
  }

  async function fetchMatchesForDate(date) {
    const d = date || new Date().toISOString().split('T')[0];
    const cacheKey = `wc_matches_v1_${d}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;
    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      // Önce season fixtures'dan filtrele (cache-friendly)
      const all = await fetchSeasonFixtures();
      const result = all.filter(m => m.date === d);
      if (result.length > 0) {
        await setCache(cacheKey, result, ttlForMatchDate(d, result.some(m => isLiveStatus(m.status))));
        return result;
      }
      // Fallback: eventsday.php
      const dayData = await upstream.fetchJson(
        `${sportsDbBase}/eventsday.php?d=${d}&l=${wcLeagueId}`,
        {}, 'sportsdb wc day'
      ).catch(() => ({ events: [] }));
      const dayResult = (dayData.events || []).map(mapSportsDbEvent);
      if (dayResult.length > 0) await setCache(cacheKey, dayResult, ttlForMatchDate(d, dayResult.some(m => isLiveStatus(m.status))));
      return dayResult;
    });
  }

  async function fetchMatch(eventId) {
    const cacheKey = `wc_match_v1_${eventId}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;
    return dedupe(cacheKey, async () => {
      const fresh = await getCache(cacheKey);
      if (fresh) return fresh;
      const data = await upstream.fetchJson(
        `${sportsDbBase}/lookupevent.php?id=${eventId}`,
        {}, 'sportsdb wc match'
      );
      const event = data?.events?.[0] || null;
      if (!event) return null;
      const isFinished = ['FT','AET','PEN','Match Finished'].includes(event.strStatus || '');
      const matchDate = event.dateEvent || new Date().toISOString().split('T')[0];
      await setCache(cacheKey, event, isFinished ? TTL.historical : ttlForMatchDate(matchDate, isLiveStatus(event.strStatus)));
      return event;
    });
  }

  return { fetchSeasonFixtures, fetchMatchesForDate, fetchMatch };
}

module.exports = { createWorldCupService };
