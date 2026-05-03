import {
  isFavTeam,
  isRecentItem,
  parseFavTeam,
  parseFavTeamList,
  parseRecentItems,
} from '../utils/profileStorage';

const favTeam = {
  name: 'Galatasaray',
  teamId: 133804,
  apiId: 203,
  leagueName: 'Super Lig',
  leagueFlag: 'TR',
};

const recentItem = {
  id: 57,
  name: 'Arsenal',
  leagueName: 'Premier Lig',
  apiId: 39,
  timestamp: 1_777_777_777,
};

describe('profile storage guards', () => {
  it('accepts valid favorite teams and rejects malformed rows', () => {
    expect(isFavTeam(favTeam)).toBe(true);
    expect(isFavTeam({ ...favTeam, teamId: '133804' })).toBe(false);
    expect(isFavTeam({ ...favTeam, name: '' })).toBe(false);
    expect(isFavTeam(null)).toBe(false);
    expect(isFavTeam([favTeam])).toBe(false);
  });

  it('accepts valid recent items and rejects malformed rows', () => {
    expect(isRecentItem(recentItem)).toBe(true);
    expect(isRecentItem({ ...recentItem, timestamp: 'soon' })).toBe(false);
    expect(isRecentItem({ ...recentItem, id: Number.NaN })).toBe(false);
    expect(isRecentItem({ ...recentItem, name: '   ' })).toBe(false);
  });

  it('parses a single favorite team safely', () => {
    expect(parseFavTeam(JSON.stringify(favTeam))).toEqual(favTeam);
    expect(parseFavTeam(JSON.stringify({ ...favTeam, apiId: '203' }))).toBeNull();
    expect(parseFavTeam('{not json')).toBeNull();
    expect(parseFavTeam(null)).toBeNull();
  });

  it('filters malformed favorite and recent arrays', () => {
    expect(parseFavTeamList(JSON.stringify([
      favTeam,
      { ...favTeam, teamId: 'bad' },
      null,
    ]))).toEqual([favTeam]);

    expect(parseRecentItems(JSON.stringify([
      recentItem,
      { ...recentItem, timestamp: 'bad' },
      ['bad'],
    ]))).toEqual([recentItem]);
  });

  it('returns empty arrays for non-array or invalid JSON payloads', () => {
    expect(parseFavTeamList(JSON.stringify(favTeam))).toEqual([]);
    expect(parseRecentItems('{not json')).toEqual([]);
    expect(parseRecentItems(null)).toEqual([]);
  });
});
