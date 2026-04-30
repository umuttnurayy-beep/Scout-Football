const ALLSPORTS_TEAM_ALIASES = {
  besiktas: ['Besiktas', 'Besiktas JK'],
  fenerbahce: ['Fenerbahce', 'Fenerbahce SK', 'Fenerbahçe'],
  galatasaray: ['Galatasaray', 'Galatasaray SK'],
  trabzonspor: ['Trabzonspor', 'Trabzonspor AS'],
  gaziantep: ['Gaziantep FK', 'Gaziantep'],
  gaziantepfk: ['Gaziantep FK', 'Gaziantep'],
  caykurrizespor: ['Rizespor', 'Caykur Rizespor', 'Rize'],
  rizespor: ['Rizespor', 'Caykur Rizespor', 'Rize'],
  konyaspor: ['Konyaspor', 'Konyaspor Kulubu'],
  basaksehir: ['Istanbul Basaksehir', 'Basaksehir'],
  istanbulbasaksehir: ['Istanbul Basaksehir', 'Basaksehir'],
  goztepe: ['Goztepe', 'Göztepe'],
};

function normalizeTeamLookupName(value) {
  return (value || '')
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function allSportsTeamQueries(name) {
  const aliases = ALLSPORTS_TEAM_ALIASES[normalizeTeamLookupName(name)] || [];
  return [...new Set([name, ...aliases].filter(Boolean))];
}

function createAllSportsH2HService({
  allSportsBase,
  allSportsKey,
  dedupe,
  getCache,
  setCache,
  TTL,
  upstream,
}) {
  async function findAllSportsTeam(name) {
    const queries = allSportsTeamQueries(name);
    for (const query of queries) {
      const data = await upstream.fetchJson(`${allSportsBase}?met=Teams&APIkey=${allSportsKey}&teamName=${encodeURIComponent(query)}`, {}, 'allsports team search');
      const team = (data.result || [])[0];
      if (team) return team;
    }
    return null;
  }

  async function fetchAllSportsH2HMatches(home, away) {
    if (!allSportsKey) throw new Error('ALLSPORTS_KEY missing');
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

      const h2hData = await upstream.fetchJson(`${allSportsBase}?met=H2H&APIkey=${allSportsKey}&firstTeamId=${homeTeam.team_key}&secondTeamId=${awayTeam.team_key}`, {}, 'allsports h2h');

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
        .slice(0, 10);

      if (matches.length > 0) await setCache(cacheKey, matches, TTL.historical);
      return matches;
    });
  }

  return {
    fetchAllSportsH2HMatches,
    findAllSportsTeam,
  };
}

module.exports = {
  allSportsTeamQueries,
  createAllSportsH2HService,
  normalizeTeamLookupName,
};
