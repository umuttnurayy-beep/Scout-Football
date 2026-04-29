import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURRENT_FOOTBALL_SEASON } from '../constants/seasons';
import { API_BASE_URL } from './config';

const BASE_URL = API_BASE_URL;

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

export type WeatherData = {
  temp: number;
  wind: number;
  condition: string;
  city?: string;
};

export type OddsData = {
  home: string;
  draw: string;
  away: string;
};

export type HomeData = {
  date: string;
  matches: any[];
  superLigMatches: any[];
  standings: Record<number, Standing[]>;
  featuredMatchId?: number | null;
  stale?: boolean;
  nextPreview: {
    date: string;
    matches: any[];
    superLigMatches: any[];
  } | null;
  generatedAt: string;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'ok' in payload && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
}

async function readApiJson<T>(res: Response, fallback: T): Promise<T> {
  const payload = unwrapApiData<T>(await res.json());
  return payload ?? fallback;
}

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
    const res = await fetch(`${BASE_URL}/standings/${fdId}`);
    const data = await readApiJson<Standing[]>(res, []);
    return standingsOrEmpty(data);
  } catch (e) {
    console.error('getStandings hata:', e);
    return [];
  }
}

export async function getTodayMatches(date?: string): Promise<any[]> {
  try {
    const url = date ? `${BASE_URL}/matches?date=${date}` : `${BASE_URL}/matches`;
    const res = await fetch(url);
    const data = await readApiJson<any[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    console.error('getTodayMatches hata:', e);
    return [];
  }
}

export async function getHomeData(date: string): Promise<HomeData | null> {
  try {
    const res = await fetch(`${BASE_URL}/home?date=${encodeURIComponent(date)}`);
    const payload = await res.json() as (ApiEnvelope<HomeData> & { stale?: boolean }) | HomeData | null;
    if (!res.ok || !payload) return null;
    if (typeof payload === 'object' && 'ok' in payload && payload.ok === false) return null;
    const data = unwrapApiData<HomeData | null>(payload as HomeData | ApiEnvelope<HomeData | null>);
    if (!data || !Array.isArray(data.matches) || !Array.isArray(data.superLigMatches)) return null;
    return {
      ...data,
      stale: Boolean((payload as { stale?: boolean }).stale || data.stale),
      standings: data.standings || {},
      nextPreview: data.nextPreview || null,
    };
  } catch (e) {
    console.error('getHomeData hata:', e);
    return null;
  }
}

export async function getMatchStats(matchId: string): Promise<any> {
  try {
    const res = await fetch(`${BASE_URL}/match/${matchId}`);
    const data = await readApiJson<any | null>(res, null);
    return data || null;
  } catch (e) {
    console.error('getMatchStats hata:', e);
    return null;
  }
}

export async function getH2H(matchId: string, isFinished?: boolean): Promise<any[]> {
  try {
    const url = isFinished ? `${BASE_URL}/h2h/${matchId}?finished=1` : `${BASE_URL}/h2h/${matchId}`;
    const res = await fetch(url);
    const data = await readApiJson<any[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    console.error('getH2H hata:', e);
    return [];
  }
}

export async function getTeamForm(teamId: number): Promise<any[]> {
  try {
    const res = await fetch(`${BASE_URL}/team/${teamId}/matches`);
    const data = await readApiJson<any[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    console.error('getTeamForm hata:', e);
    return [];
  }
}

export async function getWeather(city: string): Promise<WeatherData | null> {
  try {
    const res = await fetch(`${BASE_URL}/weather?city=${encodeURIComponent(city)}`);
    const data = await readApiJson<WeatherData | null>(res, null);
    return data || null;
  } catch (e) {
    console.error('getWeather hata:', e);
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

    const res = await fetch(`${BASE_URL}/odds?sport=${sport}`);
    const data = await readApiJson<any[]>(res, []);
    if (!Array.isArray(data)) return null;

    function normalize(s: string) {
      const basic = s.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/fc|afc|cf|sc|ac|as|rc|ss|us |ud |cd |real |olympique |borussia /gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
      const aliases: Record<string, string> = {
        atleti: 'atleticomadrid',
        atletico: 'atleticomadrid',
      };
      return aliases[basic] || basic;
    }

    const match = data.find((game: any) => {
      const h = normalize(game.home_team || '');
      const a = normalize(game.away_team || '');
      const home = normalize(homeTeam);
      const away = normalize(awayTeam);
      return (h.includes(home) || home.includes(h)) && (a.includes(away) || away.includes(a));
    });

    if (!match) return null;

    let bestHome = 0, bestDraw = 0, bestAway = 0;
    for (const bookmaker of match.bookmakers || []) {
      const market = bookmaker.markets?.find((m: any) => m.key === 'h2h');
      if (!market) continue;
      const outcomes = market.outcomes || [];
      const h = outcomes.find((o: any) => o.name === match.home_team)?.price || 0;
      const d = outcomes.find((o: any) => o.name === 'Draw')?.price || 0;
      const a = outcomes.find((o: any) => o.name === match.away_team)?.price || 0;
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
    console.error('getOdds hata:', e);
    return null;
  }
}

export async function getTopScorers(leagueId: number): Promise<any[]> {
  try {
    const res = await fetch(`${BASE_URL}/scorers/${leagueId}`);
    const data = await readApiJson<any[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    console.error('getTopScorers hata:', e);
    return [];
  }
}

export async function getFdTeamData(teamId: number): Promise<any> {
  try {
    const res = await fetch(`${BASE_URL}/team/${teamId}`);
    const data = await readApiJson<any | null>(res, null);
    return data || null;
  } catch (e) {
    console.error('getFdTeamData hata:', e);
    return null;
  }
}

export async function getUclKnockouts(season = CURRENT_FOOTBALL_SEASON): Promise<any> {
  try {
    const res = await fetch(`${BASE_URL}/ucl/knockouts?season=${season}`);
    return await readApiJson<any | null>(res, null) || null;
  } catch (e) {
    console.error('getUclKnockouts hata:', e);
    return null;
  }
}

export async function getAllSportsTeamStats(teamName: string): Promise<any> {
  try {
    const res = await fetch(`${BASE_URL}/allsports/team-stats/${encodeURIComponent(teamName)}`);
    const data = await readApiJson<any | null>(res, null);
    return data || null;
  } catch (e) {
    console.error('getAllSportsTeamStats hata:', e);
    return null;
  }
}

export async function getAllSportsH2H(homeTeam: string, awayTeam: string): Promise<any[]> {
  try {
    const res = await fetch(`${BASE_URL}/allsports/h2h?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`);
    const data = await readApiJson<any[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    console.error('getAllSportsH2H hata:', e);
    return [];
  }
}

// --- Süper Lig (TheSportsDB) ---

export async function getSuperLigStandings(): Promise<Standing[]> {
  try {
    const res = await fetch(`${BASE_URL}/superlig/standings`);
    const data = await readApiJson<Standing[]>(res, []);
    return standingsOrEmpty(data);
  } catch (e) {
    console.error('getSuperLigStandings hata:', e);
    return [];
  }
}

export async function getSuperLigMatches(date?: string): Promise<any[]> {
  try {
    const url = date ? `${BASE_URL}/superlig/matches?date=${date}` : `${BASE_URL}/superlig/matches`;
    const res = await fetch(url);
    const data = await readApiJson<any[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    console.error('getSuperLigMatches hata:', e);
    return [];
  }
}

export async function getSuperLigTeamForm(teamId: number): Promise<any[]> {
  try {
    const res = await fetch(`${BASE_URL}/superlig/team-form/${teamId}`);
    const data = await readApiJson<any[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    console.error('getSuperLigTeamForm hata:', e);
    return [];
  }
}

export async function getSuperLigPlayers(teamId: number): Promise<any[]> {
  try {
    const res = await fetch(`${BASE_URL}/superlig/players/${teamId}`);
    const data = await readApiJson<any[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    console.error('getSuperLigPlayers hata:', e);
    return [];
  }
}

export async function getSuperLigScorers(): Promise<any[]> {
  try {
    const res = await fetch(`${BASE_URL}/superlig/scorers`);
    const data = await readApiJson<any[]>(res, []);
    return arrayOrEmpty(data);
  } catch (e) {
    console.error('getSuperLigScorers hata:', e);
    return [];
  }
}

export async function getSuperLigMatch(eventId: string): Promise<any | null> {
  try {
    const res = await fetch(`${BASE_URL}/superlig/match/${eventId}`);
    const data = await readApiJson<any | null>(res, null);
    return data || null;
  } catch (e) {
    console.error('getSuperLigMatch hata:', e);
    return null;
  }
}

