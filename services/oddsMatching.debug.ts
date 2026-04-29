import { isOddsGameMatch } from './oddsMatching';

type Case = {
  providerHome: string;
  providerAway: string;
  appHome: string;
  appAway: string;
  expected: boolean;
};

export const oddsMatchingDebugCases: Case[] = [
  { providerHome: 'Atlético Madrid', providerAway: 'Arsenal', appHome: 'Atleti', appAway: 'Arsenal', expected: true },
  { providerHome: 'Paris Saint-Germain', providerAway: 'Bayern Munich', appHome: 'PSG', appAway: 'Bayern', expected: true },
  { providerHome: 'Bayern Munich', providerAway: 'Borussia Dortmund', appHome: 'Bayern', appAway: 'Dortmund', expected: true },
  { providerHome: 'Real Madrid', providerAway: 'Barcelona', appHome: 'Real Madrid', appAway: 'Barcelona', expected: true },
  { providerHome: 'Atlético Madrid', providerAway: 'Arsenal', appHome: 'Arsenal', appAway: 'Atleti', expected: false },
];

export function runOddsMatchingDebugCases() {
  return oddsMatchingDebugCases.map(item => ({
    ...item,
    actual: isOddsGameMatch(
      { home_team: item.providerHome, away_team: item.providerAway },
      item.appHome,
      item.appAway,
    ),
  }));
}
