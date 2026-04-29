const ODDS_TEAM_ALIASES: Record<string, string> = {
  atleti: 'atleticomadrid',
  atletico: 'atleticomadrid',
  psg: 'parissaintgermain',
  bayern: 'bayernmunich',
  'bayernmunchen': 'bayernmunich',
  'fcbayernmunchen': 'bayernmunich',
};

export function normalizeOddsTeamName(name: string): string {
  const basic = name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/fc|afc|cf|sc|ac|as|rc|ss|us |ud |cd |real |olympique |borussia /gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  return ODDS_TEAM_ALIASES[basic] || basic;
}

export function isOddsTeamMatch(providerName: string, appName: string): boolean {
  const provider = normalizeOddsTeamName(providerName);
  const app = normalizeOddsTeamName(appName);
  if (!provider || !app) return false;
  return provider.includes(app) || app.includes(provider);
}

export function isOddsGameMatch(game: { home_team?: string; away_team?: string }, homeTeam: string, awayTeam: string): boolean {
  return isOddsTeamMatch(game.home_team || '', homeTeam) &&
    isOddsTeamMatch(game.away_team || '', awayTeam);
}
