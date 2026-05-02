import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURRENT_FOOTBALL_SEASON } from '../constants/seasons';
import { API_BASE_URL } from './config';
import { isOddsGameMatch } from './oddsMatching';
export {
  ApiResponseError,
  clearContextFallbackStats,
  clearLastApiError,
  getContextFallbackStats,
  getLastApiError,
  isStaleApiData,
  recordContextFallback,
} from './apiResponse';
import { isStaleApiData, logApiError, readApiJson, recordContextFallback } from './apiResponse';

const BASE_URL = API_BASE_URL;

const FETCH_TIMEOUT_MS = 12_000;

function fetchWithTimeout(url: string, opts?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

const LEAGUE_MAP: Record<number, number> = {
  39: 2021,
  140: 2014,
  78: 2002,
  135: 2019,
  61: 2015,
  2: 2001,
};

const ODDS_LEAGUE_MAP: Record<number, string> = {
  2021: 'soccer_epl',
  2014: 'soccer_spain_la_liga',
  2002: 'soccer_germany_bundesliga',
  2019: 'soccer_italy_serie_a',
  2015: 'soccer_france_ligue_one',
  2001: 'soccer_uefa_champs_league',
};

export const TEAM_CITIES: Record<string, string> = {
  // Premier League
  'Arsenal': 'London', 'Chelsea': 'London', 'Tottenham': 'London',
  'West Ham': 'London', 'Crystal Palace': 'London', 'Fulham': 'London',
  'Brentford': 'London', 'Charlton': 'London', 'Millwall': 'London',
  'Manchester City': 'Manchester', 'Manchester United': 'Manchester',
  'Liverpool': 'Liverpool', 'Everton': 'Liverpool',
  'Newcastle': 'Newcastle upon Tyne',
  'Aston Villa': 'Birmingham', 'Birmingham': 'Birmingham',
  'Brighton': 'Brighton', 'Southampton': 'Southampton',
  'Nottingham': 'Nottingham', 'Burnley': 'Burnley', 'Bournemouth': 'Bournemouth',
  'Ipswich': 'Ipswich', 'Leicester': 'Leicester', 'Sunderland': 'Sunderland',
  'Wolves': 'Wolverhampton', 'Wolverhampton': 'Wolverhampton',
  'Sheffield': 'Sheffield', 'Leeds': 'Leeds', 'Luton': 'Luton',
  'Watford': 'Watford', 'Norwich': 'Norwich', 'Swansea': 'Swansea',
  'Stoke': 'Stoke-on-Trent', 'Derby': 'Derby', 'Blackburn': 'Blackburn',
  // La Liga
  'Real Madrid': 'Madrid', 'Barcelona': 'Barcelona', 'Atletico Madrid': 'Madrid',
  'Atlético Madrid': 'Madrid', 'Club Atlético de Madrid': 'Madrid', 'Atlético': 'Madrid', 'Atleti': 'Madrid',
  'Sevilla': 'Seville', 'Betis': 'Seville', 'Real Betis': 'Seville',
  'Villarreal': 'Villarreal', 'Valencia': 'Valencia',
  'Girona': 'Girona', 'Athletic Club': 'Bilbao', 'Real Sociedad': 'San Sebastian',
  'Mallorca': 'Palma', 'RCD Mallorca': 'Palma',
  'Celta Vigo': 'Vigo', 'Celta': 'Vigo',
  'Osasuna': 'Pamplona',
  'Rayo Vallecano': 'Madrid', 'Rayo': 'Madrid',
  'Getafe': 'Getafe',
  'Alaves': 'Vitoria', 'Deportivo Alaves': 'Vitoria',
  'Leganes': 'Madrid',
  'Espanyol': 'Barcelona',
  'Las Palmas': 'Las Palmas',
  'Valladolid': 'Valladolid',
  'Almeria': 'Almeria', 'Cadiz': 'Cadiz', 'Granada': 'Granada',
  'Elche': 'Elche', 'Levante': 'Valencia', 'Eibar': 'Eibar',
  // Bundesliga
  'Bayern': 'Munich', 'Bayern München': 'Munich',
  'Borussia Dortmund': 'Dortmund',
  'Bayer Leverkusen': 'Leverkusen', 'RB Leipzig': 'Leipzig',
  'Eintracht Frankfurt': 'Frankfurt', 'Freiburg': 'Freiburg',
  'Wolfsburg': 'Wolfsburg', 'Stuttgart': 'Stuttgart', 'Heidenheim': 'Heidenheim',
  'Augsburg': 'Augsburg', 'Mainz': 'Mainz', 'Bochum': 'Bochum',
  'Hoffenheim': 'Hoffenheim', 'Werder': 'Bremen', 'Bremen': 'Bremen',
  'Union Berlin': 'Berlin', 'Hertha': 'Berlin',
  'Gladbach': 'Monchengladbach', 'Monchengladbach': 'Monchengladbach',
  'Köln': 'Cologne', 'Koln': 'Cologne', '1. FC Köln': 'Cologne',
  'Schalke': 'Gelsenkirchen', 'Hannover': 'Hannover',
  'Hamburg': 'Hamburg', 'Nürnberg': 'Nuremberg', 'Nuremberg': 'Nuremberg',
  'Darmstadt': 'Darmstadt', 'St. Pauli': 'Hamburg', 'Holstein Kiel': 'Kiel',
  // Serie A
  'Inter Milan': 'Milan', 'Inter': 'Milan', 'AC Milan': 'Milan',
  'Juventus': 'Turin', 'Torino': 'Turin',
  'Napoli': 'Naples', 'Roma': 'Rome', 'Lazio': 'Rome', 'Atalanta': 'Bergamo',
  'Fiorentina': 'Florence', 'Bologna': 'Bologna',
  'Monza': 'Monza', 'Como': 'Como', 'Parma': 'Parma',
  'Cagliari': 'Cagliari', 'Udinese': 'Udine', 'Empoli': 'Empoli',
  'Lecce': 'Lecce', 'Genoa': 'Genoa',
  'Salernitana': 'Salerno', 'Frosinone': 'Frosinone', 'Sassuolo': 'Sassuolo',
  'Cremonese': 'Cremona', 'Hellas Verona': 'Verona', 'Venezia': 'Venice',
  'Spezia': 'La Spezia', 'Sampdoria': 'Genoa',
  // Ligue 1
  'Paris Saint-Germain': 'Paris', 'PSG': 'Paris', 'Monaco': 'Monaco',
  'Lyon': 'Lyon', 'Marseille': 'Marseille', 'Lille': 'Lille',
  'Nice': 'Nice', 'Rennes': 'Rennes', 'Nantes': 'Nantes',
  'Strasbourg': 'Strasbourg', 'Brest': 'Brest', 'Auxerre': 'Auxerre',
  'Saint-Etienne': 'Saint-Etienne', 'Toulouse': 'Toulouse',
  'Reims': 'Reims', 'Le Havre': 'Le Havre', 'Lens': 'Lens',
  'Metz': 'Metz', 'Lorient': 'Lorient', 'Clermont': 'Clermont-Ferrand',
  'Montpellier': 'Montpellier', 'Angers': 'Angers', 'Troyes': 'Troyes',
  'Bordeaux': 'Bordeaux', 'Stade Brestois': 'Brest',
  // UCL / Diğer
  'Porto': 'Porto', 'Benfica': 'Lisbon', 'Sporting': 'Lisbon',
  'Celtic': 'Glasgow', 'Rangers': 'Glasgow',
  'Ajax': 'Amsterdam', 'Feyenoord': 'Rotterdam', 'PSV': 'Eindhoven',
  'Club Brugge': 'Bruges', 'Anderlecht': 'Brussels',
  'Red Bull Salzburg': 'Salzburg', 'Salzburg': 'Salzburg',
  'Dinamo Zagreb': 'Zagreb',
  'Copenhagen': 'Copenhagen', 'FC Copenhagen': 'Copenhagen',
  'Galatasaray': 'Istanbul', 'Fenerbahçe': 'Istanbul', 'Beşiktaş': 'Istanbul',
  'Fenerbahce': 'Istanbul', 'Besiktas': 'Istanbul',
  'Shakhtar': 'Kharkiv', 'Dynamo Kyiv': 'Kyiv',
  'Legia': 'Warsaw',
  // Süper Lig
  'Trabzonspor': 'Trabzon',
  'Başakşehir': 'Istanbul', 'Basaksehir': 'Istanbul', 'Istanbul Basaksehir': 'Istanbul',
  'Samsunspor': 'Samsun',
  'Göztepe': 'Izmir', 'Goztepe': 'Izmir',
  'Çaykur Rizespor': 'Rize', 'Caykur Rizespor': 'Rize', 'Rizespor': 'Rize',
  'Konyaspor': 'Konya',
  'Gaziantep': 'Gaziantep',
  'Kocaelispor': 'Kocaeli', 'Kocaeli': 'Kocaeli',
  'Alanyaspor': 'Alanya',
  'Antalyaspor': 'Antalya',
  'Gençlerbirliği': 'Ankara', 'Genclerbirligi': 'Ankara',
  'Eyüpspor': 'Istanbul', 'Eyupspor': 'Istanbul',
  'Kayserispor': 'Kayseri',
  'Fatih Karagümrük': 'Istanbul', 'Karagumruk': 'Istanbul', 'Karagümrük': 'Istanbul',
  'Kasımpaşa': 'Istanbul', 'Kasimpasa': 'Istanbul',
  'Sivasspor': 'Sivas',
  'Hatayspor': 'Hatay',
  'Adana Demirspor': 'Adana', 'Demirspor': 'Adana',
  'Giresunspor': 'Giresun',
  'Pendikspor': 'Istanbul',
  'Ümraniyespor': 'Istanbul', 'Umraniyespor': 'Istanbul',
  'Ankaragücü': 'Ankara', 'Ankaragucu': 'Ankara',
  'MKE Ankaragücü': 'Ankara',
  'Altay': 'Izmir',
  'Bursaspor': 'Bursa',
  'Eskişehirspor': 'Eskisehir',
  'Çaykur': 'Rize',
};

export function getCityForTeam(teamName: string): string | null {
  if (!teamName) return null;
  for (const key of Object.keys(TEAM_CITIES)) {
    if (teamName.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(teamName.toLowerCase())) {
      return TEAM_CITIES[key];
    }
  }
  return null;
}

export type Standing = {
  pos: number;
  team: string;
  teamId: number;
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  pts: number;
};

export type FDScore = {
  fullTime: { home: number | null; away: number | null };
  halfTime?: { home: number | null; away: number | null };
};

export type FDTeamRef = {
  id: number;
  name?: string;
  shortName?: string;
  crest?: string;
};

export type FDMatch = {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: FDTeamRef;
  awayTeam: FDTeamRef;
  score: FDScore;
  competition?: { id: number; name?: string; code?: string };
  referees?: Array<{ id: number; name: string; type?: string }>;
};

export type FDFixtureStat = { type: string; value: string };

export type FDMatchDetail = FDMatch & {
  stage?: string;
  statistics?: Array<{ statistics?: FDFixtureStat[] }>;
};

export type SLMatch = {
  id: string | number;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  date: string;
  time: string;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
};

export type SLFormMatch = {
  id?: string | number;
  home?: string;
  away?: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: number;
  awayTeamId?: number;
  date?: string;
  dateEvent?: string;
  team1Home?: boolean;
  status?: string;
};

export type SLPlayer = {
  name: string;
  position?: string;
  nationality?: string;
};

export type SLScorer = {
  name: string;
  goals: number;
  team: string;
};

export type WeatherData = {
  temp?: number;
  wind?: number;
  condition: string;
  city?: string;
  humidity?: number;
};

export type AllSportsTeamStats = {
  matchesAnalyzed: number;
  avgCorners: number | null;
  avgOppCorners: number | null;
  avgPossession: number | null;
};

export type SLEventData = {
  idEvent?: string | number;
  intHomeScore: number | null;
  intAwayScore: number | null;
  strStatus?: string;
  strVenue?: string;
  intRound?: number | string | null;
  strReferee?: string;
  dateEvent?: string;
};

export type OddsData = {
  home: string;
  draw?: string;
  away: string;
};

export type HomeData = {
  date: string;
  matches: FDMatch[];
  superLigMatches: SLMatch[];
  standings: Record<number, Standing[]>;
  featuredMatchId?: number | null;
  stale?: boolean;
  issues?: string[];
  sourceWarnings?: string[];
  sourceSeverity?: 'warning' | 'error' | null;
  nextPreview: {
    date: string;
    matches: FDMatch[];
    superLigMatches: SLMatch[];
    featuredMatchId?: number | null;
    source?: 'fresh' | 'cache' | 'stale' | null;
  } | null;
  generatedAt: string;
};

function arrayOrEmpty<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function isStanding(value: unknown): value is Standing {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Standing>;
  return typeof row.team === 'string' &&
    typeof row.pos === 'number' &&
    typeof row.played === 'number' &&
    typeof row.pts === 'number';
}

function standingsOrEmpty(value: unknown): Standing[] {
  return arrayOrEmpty<unknown>(value).filter(isStanding);
}

export async function getStandings(leagueId: number): Promise<Standing[]> {
  try {
    const fdId = LEAGUE_MAP[leagueId];
    if (!fdId) return [];
    const res = await fetchWithTimeout(`${BASE_URL}/standings/${fdId}`);
    const data = await readApiJson<Standing[]>(res, []);
    return standingsOrEmpty(data);
  } catch (e) {
    logApiError('getStandings', e);
    return [];
  }
}

export async function getTodayMatches(date?: string): Promise<FDMatch[]> {
  try {
    const url = date ? `${BASE_URL}/matches?date=${date}` : `${BASE_URL}/matches`;
    const res = await fetchWithTimeout(url);
    const data = await readApiJson<FDMatch[]>(res, []);
    return arrayOrEmpty<FDMatch>(data);
  } catch (e) {
    logApiError('getTodayMatches', e);
    return [];
  }
}

export async function getHomeData(date: string): Promise<HomeData | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/home?date=${encodeURIComponent(date)}`);
    const data = await readApiJson<HomeData | null>(res, null);
    if (!data || !Array.isArray(data.matches) || !Array.isArray(data.superLigMatches)) return null;
    return {
      ...data,
      stale: Boolean(data.stale || isStaleApiData(data)),
      standings: data.standings || {},
      issues: arrayOrEmpty<string>(data.issues),
      sourceWarnings: arrayOrEmpty<string>(data.sourceWarnings),
      sourceSeverity: data.sourceSeverity === 'warning' || data.sourceSeverity === 'error'
        ? data.sourceSeverity
        : null,
      nextPreview: data.nextPreview || null,
    };
  } catch (e) {
    logApiError('getHomeData', e);
    return null;
  }
}

export async function getMatchStats(matchId: string): Promise<FDMatchDetail | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/match/${matchId}`);
    const data = await readApiJson<FDMatchDetail | null>(res, null);
    return data || null;
  } catch (e) {
    logApiError('getMatchStats', e);
    return null;
  }
}

export type MatchContextData = {
  match: FDMatchDetail | null;
  homeForm: FDMatch[];
  awayForm: FDMatch[];
  h2h: FDMatch[];
  issues?: string[];
  generatedAt?: string;
};

export async function getMatchContext(matchId: string, isFinished?: boolean): Promise<MatchContextData | null> {
  try {
    const url = isFinished ? `${BASE_URL}/match/${matchId}/context?finished=1` : `${BASE_URL}/match/${matchId}/context`;
    const res = await fetchWithTimeout(url);
    const data = await readApiJson<MatchContextData | null>(res, null);
    if (!data || !data.match) return null;
    return {
      ...data,
      homeForm: arrayOrEmpty(data.homeForm),
      awayForm: arrayOrEmpty(data.awayForm),
      h2h: arrayOrEmpty(data.h2h),
      issues: arrayOrEmpty<string>(data.issues),
    };
  } catch (e) {
    logApiError('getMatchContext', e);
    return null;
  }
}

export async function getH2H(matchId: string, isFinished?: boolean): Promise<FDMatch[]> {
  try {
    const url = isFinished ? `${BASE_URL}/h2h/${matchId}?finished=1` : `${BASE_URL}/h2h/${matchId}`;
    const res = await fetchWithTimeout(url);
    const data = await readApiJson<FDMatch[]>(res, []);
    return arrayOrEmpty<FDMatch>(data);
  } catch (e) {
    logApiError('getH2H', e);
    return [];
  }
}

export async function getTeamForm(teamId: number): Promise<FDMatch[]> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/team/${teamId}/matches`);
    const data = await readApiJson<FDMatch[]>(res, []);
    return arrayOrEmpty<FDMatch>(data);
  } catch (e) {
    logApiError('getTeamForm', e);
    return [];
  }
}

export async function getWeather(city: string): Promise<WeatherData | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/weather?city=${encodeURIComponent(city)}`);
    const data = await readApiJson<WeatherData | null>(res, null);
    return data || null;
  } catch (e) {
    logApiError('getWeather', e);
    return null;
  }
}

export async function getOdds(homeTeam: string, awayTeam: string, leagueApiId: number): Promise<OddsData | null> {
  try {
    const sport = ODDS_LEAGUE_MAP[leagueApiId];
    if (!sport) return null;

    const storeKey = `odds_match_${leagueApiId}_${homeTeam}_${awayTeam}`;
    const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

    // Cache'te varsa dön — maç öncesi oran sabit kalır
    try {
      const raw = await AsyncStorage.getItem(storeKey);
      if (raw) {
        const { odds, ts } = JSON.parse(raw);
        if (Date.now() - ts < TWENTY_FOUR_H) return odds;
      }
    } catch (_) {}

    const res = await fetchWithTimeout(`${BASE_URL}/odds?sport=${sport}`);
    type OddsOutcome = { name: string; price: number };
    type OddsMarket = { key: string; outcomes: OddsOutcome[] };
    type OddsBookmaker = { markets?: OddsMarket[] };
    type OddsGame = { home_team: string; away_team: string; bookmakers?: OddsBookmaker[] };

    const data = await readApiJson<OddsGame[]>(res, []);
    if (!Array.isArray(data)) return null;

    const match = data.find((game) => isOddsGameMatch(game, homeTeam, awayTeam));

    if (!match) return null;

    let bestHome = 0, bestDraw = 0, bestAway = 0;
    for (const bookmaker of match.bookmakers || []) {
      const market = bookmaker.markets?.find((m) => m.key === 'h2h');
      if (!market) continue;
      const outcomes = market.outcomes || [];
      const h = outcomes.find((o) => o.name === match.home_team)?.price || 0;
      const d = outcomes.find((o) => o.name === 'Draw')?.price || 0;
      const a = outcomes.find((o) => o.name === match.away_team)?.price || 0;
      if (h > bestHome) bestHome = h;
      if (d > bestDraw) bestDraw = d;
      if (a > bestAway) bestAway = a;
    }

    if (!bestHome) return null;
    const odds: OddsData = {
      home: bestHome.toFixed(2),
      draw: bestDraw.toFixed(2),
      away: bestAway.toFixed(2),
    };

    try { await AsyncStorage.setItem(storeKey, JSON.stringify({ odds, ts: Date.now() })); } catch (_) {}

    return odds;
  } catch (e) {
    logApiError('getOdds', e);
    return null;
  }
}

export type FDSquadPlayer = {
  id: number;
  name: string;
  position?: string;
  nationality?: string;
};

export type FDScorer = {
  player: { id: number; name: string };
  team?: { id: number; name?: string };
  goals: number;
  assists?: number;
  playedMatches?: number;
};

export type FDTeamData = {
  id?: number;
  name?: string;
  squad?: FDSquadPlayer[];
};

export async function getTopScorers(leagueId: number): Promise<FDScorer[]> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/scorers/${leagueId}`);
    const data = await readApiJson<FDScorer[]>(res, []);
    return arrayOrEmpty<FDScorer>(data);
  } catch (e) {
    logApiError('getTopScorers', e);
    return [];
  }
}

export async function getFdTeamData(teamId: number): Promise<FDTeamData | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/team/${teamId}`);
    const data = await readApiJson<FDTeamData | null>(res, null);
    return data || null;
  } catch (e) {
    logApiError('getFdTeamData', e);
    return null;
  }
}

export type UCLKnockouts = Record<string, FDMatch[]>;

export async function getUclKnockouts(season = CURRENT_FOOTBALL_SEASON): Promise<UCLKnockouts | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/ucl/knockouts?season=${season}`);
    return await readApiJson<UCLKnockouts | null>(res, null) || null;
  } catch (e) {
    logApiError('getUclKnockouts', e);
    return null;
  }
}

export async function getAllSportsTeamStats(teamName: string): Promise<AllSportsTeamStats | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/allsports/team-stats/${encodeURIComponent(teamName)}`);
    const data = await readApiJson<AllSportsTeamStats | null>(res, null);
    return data || null;
  } catch (e) {
    logApiError('getAllSportsTeamStats', e);
    return null;
  }
}

export type H2HRawItem = {
  homeTeam?: { shortName?: string; name?: string };
  awayTeam?: { shortName?: string; name?: string };
  score?: { fullTime?: { home?: number | null; away?: number | null } };
  utcDate?: string;
  home?: string;
  away?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  date?: string;
};

export async function getAllSportsH2H(homeTeam: string, awayTeam: string): Promise<H2HRawItem[]> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/allsports/h2h?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`);
    const data = await readApiJson<H2HRawItem[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    logApiError('getAllSportsH2H', e);
    return [];
  }
}

// --- Süper Lig (TheSportsDB) ---

export async function getSuperLigStandings(): Promise<Standing[]> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/superlig/standings`);
    const data = await readApiJson<Standing[]>(res, []);
    return standingsOrEmpty(data);
  } catch (e) {
    logApiError('getSuperLigStandings', e);
    return [];
  }
}

export async function getSuperLigMatches(date?: string): Promise<SLMatch[]> {
  try {
    const url = date ? `${BASE_URL}/superlig/matches?date=${date}` : `${BASE_URL}/superlig/matches`;
    const res = await fetchWithTimeout(url);
    const data = await readApiJson<SLMatch[]>(res, []);
    return arrayOrEmpty<SLMatch>(data);
  } catch (e) {
    logApiError('getSuperLigMatches', e);
    return [];
  }
}

export async function getSuperLigTeamForm(teamId: number): Promise<SLFormMatch[]> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/superlig/team-form/${teamId}`);
    const data = await readApiJson<SLFormMatch[]>(res, []);
    return arrayOrEmpty<SLFormMatch>(data);
  } catch (e) {
    logApiError('getSuperLigTeamForm', e);
    return [];
  }
}

export interface SuperLigTeamContext {
  teamId: number;
  source: 'espn' | 'allsports' | 'sportsdb' | 'mixed';
  isLimited: boolean;
  fallbackReason: string | null;
  formMatchesCount: number;
  recentMatches: SLFormMatch[];
  standingsStats: Standing | null;
}

export async function getSuperLigTeamContext(teamId: number): Promise<SuperLigTeamContext | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/superlig/team-context/${teamId}`);
    const data = await readApiJson<SuperLigTeamContext | null>(res, null);
    return data || null;
  } catch (e) {
    logApiError('getSuperLigTeamContext', e);
    return null;
  }
}

export async function getSuperLigPlayers(teamId: number): Promise<SLPlayer[]> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/superlig/players/${teamId}`);
    const data = await readApiJson<SLPlayer[]>(res, []);
    return arrayOrEmpty<SLPlayer>(data);
  } catch (e) {
    logApiError('getSuperLigPlayers', e);
    return [];
  }
}

export async function getSuperLigScorers(): Promise<SLScorer[]> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/superlig/scorers`);
    const data = await readApiJson<SLScorer[]>(res, []);
    return arrayOrEmpty<SLScorer>(data);
  } catch (e) {
    logApiError('getSuperLigScorers', e);
    return [];
  }
}

export async function getSuperLigMatch(eventId: string): Promise<SLEventData | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/superlig/match/${eventId}`);
    const data = await readApiJson<SLEventData | null>(res, null);
    return data || null;
  } catch (e) {
    logApiError('getSuperLigMatch', e);
    return null;
  }
}

export type SuperLigMatchContextData = {
  event: SLEventData | null;
  homeContext: SuperLigTeamContext | null;
  awayContext: SuperLigTeamContext | null;
  h2h: SLFormMatch[];
  issues?: string[];
  generatedAt?: string;
};

export async function getSuperLigMatchContext({
  eventId,
  homeTeamId,
  awayTeamId,
  home,
  away,
}: {
  eventId: string;
  homeTeamId?: number;
  awayTeamId?: number;
  home?: string;
  away?: string;
}): Promise<SuperLigMatchContextData | null> {
  try {
    const params = new URLSearchParams();
    if (homeTeamId) params.set('homeTeamId', String(homeTeamId));
    if (awayTeamId) params.set('awayTeamId', String(awayTeamId));
    if (home) params.set('home', home);
    if (away) params.set('away', away);
    const qs = params.toString();
    const res = await fetchWithTimeout(`${BASE_URL}/superlig/match/${eventId}/context${qs ? `?${qs}` : ''}`);
    const data = await readApiJson<SuperLigMatchContextData | null>(res, null);
    if (!data || !data.event) return null;
    return {
      ...data,
      h2h: arrayOrEmpty(data.h2h),
      issues: arrayOrEmpty<string>(data.issues),
    };
  } catch (e) {
    logApiError('getSuperLigMatchContext', e);
    return null;
  }
}
