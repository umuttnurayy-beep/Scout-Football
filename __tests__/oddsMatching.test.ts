import { isOddsGameMatch, isOddsTeamMatch, normalizeOddsTeamName } from '../services/oddsMatching';

describe('normalizeOddsTeamName', () => {
  it('strips accents, club prefixes, punctuation, and spacing', () => {
    expect(normalizeOddsTeamName('FC Bayern München')).toBe('bayernmunich');
    expect(normalizeOddsTeamName('Real Sociedad')).toBe('sociedad');
    expect(normalizeOddsTeamName('Olympique Lyonnais')).toBe('lyonnais');
  });

  it('maps common betting provider aliases', () => {
    expect(normalizeOddsTeamName('PSG')).toBe('parissaintgermain');
    expect(normalizeOddsTeamName('Atleti')).toBe('atleticomadrid');
    expect(normalizeOddsTeamName('Bayern Munchen')).toBe('bayernmunich');
  });
});

describe('odds team matching', () => {
  it('matches provider and app names after normalization', () => {
    expect(isOddsTeamMatch('Paris Saint-Germain', 'PSG')).toBe(true);
    expect(isOddsTeamMatch('FC Bayern Munich', 'Bayern München')).toBe(true);
    expect(isOddsTeamMatch('Manchester City', 'Manchester')).toBe(true);
  });

  it('rejects empty or unrelated teams', () => {
    expect(isOddsTeamMatch('', 'Arsenal')).toBe(false);
    expect(isOddsTeamMatch('Arsenal', '')).toBe(false);
    expect(isOddsTeamMatch('Arsenal', 'Chelsea')).toBe(false);
  });
});

describe('odds game matching', () => {
  it('requires both home and away teams to match', () => {
    const game = { home_team: 'FC Bayern Munich', away_team: 'Paris Saint-Germain' };

    expect(isOddsGameMatch(game, 'Bayern München', 'PSG')).toBe(true);
    expect(isOddsGameMatch(game, 'Bayern München', 'Chelsea')).toBe(false);
  });

  it('treats missing provider team names as non-matches', () => {
    expect(isOddsGameMatch({}, 'Bayern München', 'PSG')).toBe(false);
  });
});
