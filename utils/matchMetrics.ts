import { FDMatch, H2HRawItem, HomeData, SLMatch, Standing, getCityForTeam } from '../services/api';
import { buildScoutPick, strHash, type MatchFormStats } from './matchAnalysis';

// ─── constants ───────────────────────────────────────────────────────────────

export const SUPPORTED_LEAGUES = [2021, 2014, 2002, 2019, 2015, 2001];

export const LEAGUE_NAMES: Record<number, string> = {
  2021: 'Premier Lig', 2014: 'La Liga', 2002: 'Bundesliga',
  2019: 'Serie A', 2015: 'Ligue 1', 2001: 'UCL', 203: 'Süper Lig',
};

export const LEAGUE_WEIGHT: Record<number, number> = {
  2001: 30,  // UCL
  2021: 26,  // Premier Lig
  2014: 26,  // La Liga
  2002: 22,  // Bundesliga
  2019: 22,  // Serie A
  2015: 18,  // Ligue 1
  203:  14,  // Süper Lig
};

export const MARQUEE_MATCHUPS: { leagueApiId: number; teams: [string, string]; bonus: number }[] = [
  { leagueApiId: 203,  teams: ['Galatasaray', 'Fenerbahce'], bonus: 12 },
  { leagueApiId: 203,  teams: ['Galatasaray', 'Besiktas'], bonus: 10 },
  { leagueApiId: 203,  teams: ['Fenerbahce', 'Besiktas'], bonus: 10 },
  { leagueApiId: 2019, teams: ['Milan', 'Juventus'], bonus: 9 },
  { leagueApiId: 2019, teams: ['Inter', 'Juventus'], bonus: 9 },
  { leagueApiId: 2019, teams: ['Inter', 'Milan'], bonus: 9 },
  { leagueApiId: 2014, teams: ['Real Madrid', 'Barcelona'], bonus: 12 },
  { leagueApiId: 2014, teams: ['Real Madrid', 'Atletico Madrid'], bonus: 8 },
  { leagueApiId: 2021, teams: ['Manchester United', 'Liverpool'], bonus: 10 },
  { leagueApiId: 2021, teams: ['Man United', 'Liverpool'], bonus: 10 },
  { leagueApiId: 2021, teams: ['Manchester United', 'Manchester City'], bonus: 9 },
  { leagueApiId: 2021, teams: ['Man United', 'Man City'], bonus: 9 },
  { leagueApiId: 2021, teams: ['Arsenal', 'Tottenham'], bonus: 8 },
  { leagueApiId: 2002, teams: ['Bayern', 'Dortmund'], bonus: 9 },
  { leagueApiId: 2015, teams: ['Paris Saint-Germain', 'Marseille'], bonus: 8 },
];

export const MAJOR_TEAMS = [
  'Real Madrid', 'Barcelona', 'Atletico Madrid',
  'Bayern', 'Borussia Dortmund', 'Dortmund',
  'Paris Saint-Germain', 'PSG',
  'Arsenal', 'Liverpool', 'Manchester City', 'Man City', 'Manchester United', 'Man United', 'Man Utd', 'Chelsea', 'Tottenham',
  'Inter', 'Internazionale', 'Milan', 'AC Milan', 'Juventus', 'Napoli', 'Roma',
  'Galatasaray', 'Fenerbahce', 'Fenerbahçe', 'Besiktas', 'Beşiktaş', 'Trabzonspor',
];

const SINGLE_MAJOR_TEAM_BONUS = 7;
const DOUBLE_MAJOR_TEAM_BONUS = 18;

export const STANDINGS_LEAGUES: { leagueApiId: number; apiId: number }[] = [
  { leagueApiId: 2021, apiId: 39 },
  { leagueApiId: 2014, apiId: 140 },
  { leagueApiId: 2002, apiId: 78 },
  { leagueApiId: 2019, apiId: 135 },
  { leagueApiId: 2015, apiId: 61 },
  { leagueApiId: 2001, apiId: 2 },
];

export const MIN_PLAYED = 3;

// ─── types ───────────────────────────────────────────────────────────────────

export type Match = {
  id: number; leagueApiId: number; league: string;
  home: string; away: string; time: string;
  date?: string;
  score: string | null; finished: boolean;
  city: string | null; utcDate: string;
  homeTeamId: number; awayTeamId: number;
};

export type Metrics = {
  hasData: boolean;
  expectedGoals: number;
  leagueAvg: number;
  homePpg: number;
  awayPpg: number;
  diff: number;
  favorite: 'home' | 'away' | 'balanced';
  confidence: 'low' | 'medium' | 'high';
  tempo: number;
  homePos?: number;
  awayPos?: number;
  homePts?: number;
  awayPts?: number;
  homePlayed?: number;
  awayPlayed?: number;
  leaderPts?: number;
  totalTeams?: number;
  homeAbovePts?: number;
  homeBelowPts?: number;
  awayAbovePts?: number;
  awayBelowPts?: number;
  safetyPts?: number;
  homeAvgGf?: number;
  homeAvgGa?: number;
  awayAvgGf?: number;
  awayAvgGa?: number;
  homeWinPct?: number;
  awayWinPct?: number;
  reason?: string;
  summary: string;
};

export type ListItem = {
  key: string;
  type: 'notice' | 'section-header' | 'hero' | 'highlight' | 'day-summary' | 'match' | 'single-insight' | 'single-trends' | 'single-h2h' | 'tomorrow-featured' | 'empty' | 'empty-scout';
  m?: Match;
  metrics?: Metrics;
  h2h?: H2HRawItem[];
  rank?: number;
  title?: string;
  sub?: string;
  summary?: string;
  filter?: string;
  notice?: 'stale' | 'cache' | 'warning' | 'error';
  warningText?: string | null;
};

export type FeaturedMatchCache = Record<string, number>;

// ─── low-level helpers ────────────────────────────────────────────────────────

export function timeToMins(t: string): number {
  const p = t.split(':');
  return p.length === 2 ? parseInt(p[0]) * 60 + parseInt(p[1]) : 0;
}

export function formatTime(utcDate: string): string {
  const d = new Date(utcDate);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function formatSportsDbTime(date: string, time?: string | null): string {
  if (!time) return '?';
  const d = new Date(`${date}T${time}Z`);
  if (Number.isNaN(d.getTime())) return time.substring(0, 5);
  return formatTime(d.toISOString());
}

export function sportsDbUtcDate(date: string, time?: string | null): string {
  return `${date}T${time || '00:00:00'}Z`;
}

// ─── standings lookup ─────────────────────────────────────────────────────────

export function normalizeTeam(name: string): string {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİ]/g, 'i')
    .replace(/[éèêë]/g, 'e').replace(/[áàâä]/g, 'a').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõ]/g, 'o').replace(/[úùû]/g, 'u').replace(/ñ/g, 'n').replace(/ß/g, 's')
    .replace(/\s+/g, ' ').trim();
}

// football-data.org shortName → ESPN displayName için bilinen takım eşleştirmeleri
const TEAM_ALIASES: Record<string, string> = {
  'paris sg':            'paris saint-germain',
  'psg':                 'paris saint-germain',
  'inter':               'internazionale',
  'man city':            'manchester city',
  'man utd':             'manchester united',
  'manchester utd':      'manchester united',
  'bayern':              'bayern munich',
  'bayern munchen':      'bayern munich',
  'fc bayern munchen':   'bayern munich',
  'bvb':                 'borussia dortmund',
  'dortmund':            'borussia dortmund',
  'atleti':              'atletico madrid',
  'sp lisbon':           'sporting cp',
  'sporting lisbon':     'sporting cp',
  'leverkusen':          'bayer leverkusen',
  'brugge':              'club brugge',
  'eintr. frankfurt':    'eintracht frankfurt',
  'rb leipzig':          'rasenballsport leipzig',
  'newcastle':           'newcastle united',
  'atletico madrid':     'atletico madrid',
};

export function findStanding(standings: Standing[] | undefined, teamName: string, teamId: number): Standing | null {
  if (!standings || standings.length === 0) return null;
  if (teamId > 0) {
    const byId = standings.find(s => s.teamId === teamId);
    if (byId) return byId;
  }
  const target = normalizeTeam(teamName);
  if (!target) return null;
  const alias = TEAM_ALIASES[target];
  const targets = alias ? [target, alias] : [target];
  for (const t of targets) {
    const exact = standings.find(s => normalizeTeam(s.team) === t);
    if (exact) return exact;
  }
  for (const t of targets) {
    const partial = standings.find(s => {
      const norm = normalizeTeam(s.team);
      return norm.includes(t) || t.includes(norm);
    });
    if (partial) return partial;
  }
  return null;
}

export function hasUsableStandingsMap(map: Record<number, Standing[]> | null): map is Record<number, Standing[]> {
  if (!map) return false;
  if (Array.isArray(map[203]) && map[203].length > 0) return true;
  return STANDINGS_LEAGUES.some(({ leagueApiId }) => Array.isArray(map[leagueApiId]) && map[leagueApiId].length > 0);
}

// ─── metrics engine ───────────────────────────────────────────────────────────

export const NO_DATA: Metrics = {
  hasData: false, expectedGoals: 0, leagueAvg: 1.5,
  homePpg: 0, awayPpg: 0, diff: 0, favorite: 'balanced',
  confidence: 'low', tempo: 0,
  reason: 'Sezon verisi bulunamadı',
  summary: 'Analiz için sezon verisi henüz mevcut değil.',
};

function getStandingNeighbors(standings: Standing[] | undefined, pos?: number) {
  if (!standings || !pos) return { abovePts: undefined, belowPts: undefined };
  return {
    abovePts: standings.find(s => s.pos === pos - 1)?.pts,
    belowPts: standings.find(s => s.pos === pos + 1)?.pts,
  };
}

function getSafetyLinePts(standings: Standing[] | undefined) {
  if (!standings || standings.length < 10) return undefined;
  const bottomStart = standings.length >= 18 ? standings.length - 3 : Math.max(standings.length - 2, 1);
  return standings.find(s => s.pos === bottomStart - 1)?.pts;
}

export function buildMatchSummary(m: {
  expectedGoals: number; favorite: 'home' | 'away' | 'balanced';
  confidence: 'low' | 'medium' | 'high'; tempo: number; homePpg: number; awayPpg: number;
}): string {
  const bits: string[] = [];
  if (m.expectedGoals >= 3.2)      bits.push('gollü maç ihtimali yüksek');
  else if (m.expectedGoals >= 2.5) bits.push('gol beklentisi orta-üst');
  else if (m.expectedGoals < 2.0)  bits.push('kontrollü skor profili');

  if (m.confidence === 'high') bits.push('belirgin bir favori var');
  else if (m.favorite === 'balanced' && m.homePpg >= 1.8 && m.awayPpg >= 1.8)
    bits.push('iki güçlü ekip dengeli profilde');
  else if (m.favorite === 'balanced')
    bits.push('iki takım dengeli profilde');

  if (m.tempo >= 3.0) bits.push('tempo sinyali yüksek');

  if (bits.length === 0) return 'Takım verilerine göre standart bir maç profili.';
  const sentence = bits.join(', ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

export function computeMetrics(home: Standing | null, away: Standing | null, standings?: Standing[], leagueApiId?: number): Metrics {
  if (!home || !away) {
    return { ...NO_DATA, reason: 'Takım tablo satırı eşleşmedi' };
  }
  if (home.played < MIN_PLAYED || away.played < MIN_PLAYED) {
    return {
      ...NO_DATA,
      reason: 'Erken sezon — yeterli veri yok',
      summary: 'Sezon erken; takım ortalamaları henüz güvenilir değil.',
    };
  }

  const totalGf     = standings?.reduce((s, r) => s + (r.gf || 0), 0) ?? 0;
  const totalPlayed = standings?.reduce((s, r) => s + (r.played || 0), 0) ?? 0;
  const leagueAvg   = totalPlayed > 0 ? totalGf / totalPlayed : 1.5;

  const homeAtk = home.gf / home.played;
  const homeDef = home.ga / home.played;
  const awayAtk = away.gf / away.played;
  const awayDef = away.ga / away.played;

  const expectedGoals = (homeAtk * awayDef + awayAtk * homeDef) / leagueAvg;

  const homePpg = home.pts / home.played;
  const awayPpg = away.pts / away.played;
  const diff = homePpg - awayPpg;
  const absDiff = Math.abs(diff);

  const favorite: Metrics['favorite'] = diff > 0.3 ? 'home' : diff < -0.3 ? 'away' : 'balanced';
  const confidence: Metrics['confidence'] = absDiff > 1.0 ? 'high' : absDiff > 0.5 ? 'medium' : 'low';
  const tempo = (home.gf + home.ga + away.gf + away.ga) / (home.played + away.played);

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const pct = (n: number) => Math.round(n * 100);
  const leaderPts = standings?.reduce((max, s) => Math.max(max, s.pts), 0);
  const homeNeighbors = getStandingNeighbors(standings, home.pos);
  const awayNeighbors = getStandingNeighbors(standings, away.pos);
  const safetyPts = getSafetyLinePts(standings);

  return {
    hasData: true,
    expectedGoals: round1(expectedGoals),
    leagueAvg: round1(leagueAvg),
    homePpg: round1(homePpg),
    awayPpg: round1(awayPpg),
    diff: round1(diff),
    favorite, confidence,
    tempo: round1(tempo),
    homePos: home.pos,
    awayPos: away.pos,
    homePts: home.pts,
    awayPts: away.pts,
    homePlayed: home.played,
    awayPlayed: away.played,
    leaderPts,
    totalTeams: standings?.length,
    homeAbovePts: homeNeighbors.abovePts,
    homeBelowPts: homeNeighbors.belowPts,
    awayAbovePts: awayNeighbors.abovePts,
    awayBelowPts: awayNeighbors.belowPts,
    safetyPts,
    homeAvgGf: round1(homeAtk),
    homeAvgGa: round1(homeDef),
    awayAvgGf: round1(awayAtk),
    awayAvgGa: round1(awayDef),
    homeWinPct: pct(home.win / home.played),
    awayWinPct: pct(away.win / away.played),
    summary: buildMatchSummary({ expectedGoals, favorite, confidence, tempo, homePpg, awayPpg }),
  };
}

export function buildDaySummary(metricsList: Metrics[]): string {
  const withData = metricsList.filter(m => m.hasData);
  if (withData.length === 0) return 'Bugünün maçları için yeterli sezon verisi yok.';
  const avgXG     = withData.reduce((s, m) => s + m.expectedGoals, 0) / withData.length;
  const highScore = withData.filter(m => m.expectedGoals > 3.0).length;
  const balanced  = withData.filter(m => m.favorite === 'balanced').length;
  const highConf  = withData.filter(m => m.confidence === 'high').length;
  const half      = Math.ceil(withData.length / 2);

  const parts: string[] = [];
  parts.push(`Maç başına ortalama ~${avgXG.toFixed(1)} gol bekleniyor.`);
  if (highScore >= 3)        parts.push(`${highScore} maçta 3+ gol profili var.`);
  if (balanced >= half)      parts.push('Çoğu maç dengeli profilde.');
  else if (highConf >= half) parts.push('Çoğu maçta belirgin bir favori öne çıkıyor.');
  return parts.join(' ');
}

// ─── scout scoring ────────────────────────────────────────────────────────────

export function marqueeBonus(m: Match): number {
  const home = normalizeTeam(m.home);
  const away = normalizeTeam(m.away);
  const samePair = (a: string, b: string) => {
    const x = normalizeTeam(a);
    const y = normalizeTeam(b);
    return (home.includes(x) || x.includes(home)) && (away.includes(y) || y.includes(away)) ||
      (home.includes(y) || y.includes(home)) && (away.includes(x) || x.includes(away));
  };
  const matchup = MARQUEE_MATCHUPS.find(item =>
    item.leagueApiId === m.leagueApiId && samePair(item.teams[0], item.teams[1])
  );
  return matchup?.bonus ?? 0;
}

function isMajorTeamName(teamName: string): boolean {
  const team = normalizeTeam(teamName);
  return MAJOR_TEAMS.some(major => {
    const normalizedMajor = normalizeTeam(major);
    return team.includes(normalizedMajor) || normalizedMajor.includes(team);
  });
}

export function majorTeamBonus(m: Match): number {
  const count = [m.home, m.away].filter(isMajorTeamName).length;
  if (count >= 2) return DOUBLE_MAJOR_TEAM_BONUS;
  if (count === 1) return SINGLE_MAJOR_TEAM_BONUS;
  return 0;
}

export function scoutScore(m: Match, metrics: Metrics): number {
  let s = LEAGUE_WEIGHT[m.leagueApiId] ?? 8;
  const mins = timeToMins(m.time);
  if (mins >= 20 * 60)      s += 2;
  else if (mins >= 18 * 60) s += 1;
  if (!m.finished) s += 1;

  const posBonusFn = (pos: number | undefined) => {
    if (pos === undefined) return 0;
    if (pos <= 3) return 4;
    if (pos <= 6) return 2;
    return 0;
  };
  s += posBonusFn(metrics.homePos) + posBonusFn(metrics.awayPos);
  s += marqueeBonus(m);
  s += majorTeamBonus(m);

  if (metrics.homePos !== undefined && metrics.awayPos !== undefined) {
    if (metrics.homePos <= 5 && metrics.awayPos <= 5) s += 4;
    else if (metrics.homePos <= 8 && metrics.awayPos <= 8) s += 2;
  }

  if (metrics.hasData) {
    if (metrics.expectedGoals > 3.0)                                          s += 2;
    else if (metrics.expectedGoals > 2.5)                                     s += 1;
    if (metrics.favorite === 'balanced' && metrics.homePpg >= 1.8 && metrics.awayPpg >= 1.8) s += 2;
    if (metrics.confidence === 'high' && metrics.tempo < 2.3)                 s -= 1;
  }
  return s;
}

// ─── data mapping ─────────────────────────────────────────────────────────────

export function mapSLMatch(m: SLMatch): Match {
  const hasScore   = m.homeScore !== null && m.homeScore !== undefined;
  const isFinished = m.status === 'Match Finished' || hasScore;
  const utcDate = sportsDbUtcDate(m.date, m.time);
  return {
    id:          parseInt(String(m.id)) || strHash(m.home + m.away + m.date),
    leagueApiId: 203,
    league:      'Süper Lig',
    home:        m.home,
    away:        m.away,
    time:        formatSportsDbTime(m.date, m.time),
    score:       hasScore ? `${m.homeScore} - ${m.awayScore}` : null,
    finished:    isFinished,
    city:        getCityForTeam(m.home),
    utcDate,
    homeTeamId:  m.homeTeamId || 0,
    awayTeamId:  m.awayTeamId || 0,
  };
}

export function mapMatch(m: FDMatch): Match {
  const finished = m.status === 'FINISHED';
  const fh = m.score?.fullTime?.home, fa = m.score?.fullTime?.away;
  return {
    id:          m.id,
    leagueApiId: m.competition?.id || 0,
    league:      LEAGUE_NAMES[m.competition?.id ?? 0] || m.competition?.name || 'Diğer',
    home:        m.homeTeam?.shortName || m.homeTeam?.name || '',
    away:        m.awayTeam?.shortName || m.awayTeam?.name || '',
    time:        formatTime(m.utcDate),
    score:       finished && fh !== null && fh !== undefined ? `${fh} - ${fa}` : null,
    finished,
    city:        getCityForTeam(m.homeTeam?.name || ''),
    utcDate:     m.utcDate,
    homeTeamId:  m.homeTeam?.id || 0,
    awayTeamId:  m.awayTeam?.id || 0,
  };
}

export function isRenderableMatch(m: Match): boolean {
  return Boolean(m.home?.trim() && m.away?.trim() && m.time && m.league);
}

export function buildVisibleMatches(data: FDMatch[], slData: SLMatch[]): Match[] {
  const mainMatches = data
    .filter(m => SUPPORTED_LEAGUES.includes(m.competition?.id ?? 0))
    .map(mapMatch)
    .filter(isRenderableMatch);
  const superLigMatches = slData
    .map(mapSLMatch)
    .filter(isRenderableMatch);
  return [...mainMatches, ...superLigMatches];
}

export function rankMatchesWithMetrics(matches: Match[], rowsMap: Record<number, Standing[]>) {
  return matches
    .map(m => {
      const rows = rowsMap[m.leagueApiId];
      const home = findStanding(rows, m.home, m.homeTeamId);
      const away = findStanding(rows, m.away, m.awayTeamId);
      const metrics = computeMetrics(home, away, rows, m.leagueApiId);
      return { m, metrics };
    })
    .sort((a, b) => {
      const scoreDiff = scoutScore(b.m, b.metrics) - scoutScore(a.m, a.metrics);
      if (scoreDiff !== 0) return scoreDiff;
      const timeDiff = timeToMins(a.m.time) - timeToMins(b.m.time);
      if (timeDiff !== 0) return timeDiff;
      return a.m.id - b.m.id;
    });
}

export function selectPreviewMatch(
  visible: Match[],
  rowsMap: Record<number, Standing[]>,
  featuredMatchId?: number | null,
) {
  if (visible.length === 0) return null;
  const normalizedFeaturedMatchId = Number(featuredMatchId) || null;
  if (normalizedFeaturedMatchId) {
    const backendFeatured = visible.find(match => match.id === normalizedFeaturedMatchId);
    if (backendFeatured) {
      const rows = rowsMap[backendFeatured.leagueApiId];
      const home = findStanding(rows, backendFeatured.home, backendFeatured.homeTeamId);
      const away = findStanding(rows, backendFeatured.away, backendFeatured.awayTeamId);
      return {
        m: backendFeatured,
        metrics: computeMetrics(home, away, rows, backendFeatured.leagueApiId),
      };
    }
  }
  return rankMatchesWithMetrics(visible, rowsMap)[0] || null;
}

export function buildNextPreviewFromHomeData(homeData: Pick<HomeData, 'nextPreview'>, rowsMap: Record<number, Standing[]>) {
  if (!homeData.nextPreview) return null;
  const nextVisible = buildVisibleMatches(homeData.nextPreview.matches || [], homeData.nextPreview.superLigMatches || []);
  const backendFeaturedMatchId = homeData.nextPreview.featuredMatchId ?? null;
  return selectPreviewMatch(nextVisible, rowsMap, backendFeaturedMatchId);
}

export function uniqueLeagueIds(matches: Match[]): number[] {
  return [...new Set(matches.map(m => m.leagueApiId).filter(Boolean))];
}

// ─── display helpers ──────────────────────────────────────────────────────────

export function favoriteText(m: Match, metrics: Metrics): string {
  if (!metrics.hasData) return '';
  return buildHomeCardAnalysis(m, metrics).headline;
}

export function expectedLine(metrics: Metrics): string {
  return `Beklenen ~${metrics.expectedGoals.toFixed(1)} gol`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function compactSentence(text: string, maxLength = 132) {
  const sentence = text.split(/(?<=\.)\s+/)[0] || text;
  return sentence.length <= maxLength ? sentence : `${sentence.slice(0, maxLength - 1).trim()}…`;
}

function pickVariant(lines: string[], hash: number) {
  return lines[Math.abs(hash) % lines.length];
}

function homeCardHeadline(m: Match, metrics: Metrics, pick: ReturnType<typeof buildScoutPick>, hash: number) {
  const homeName = m.home;
  const awayName = m.away;
  const leader = metrics.favorite === 'home' ? homeName : metrics.favorite === 'away' ? awayName : null;
  const goalText = metrics.expectedGoals >= 3.0
    ? ['Gol ihtimali yüksek', 'Açık maç profili', 'Skor potansiyeli güçlü', 'İki taraf için gol alanı var']
    : ['Gol ihtimali orta-üst', 'Skor potansiyeli var', 'İki taraf da gol arayabilir', 'Gole yakın maç profili'];

  if (pick.tone === 'goals') {
    return pickVariant(goalText, hash);
  }
  if (pick.tone === 'caution') {
    return pickVariant([
      'Net favori yok',
      'Sinyaller iki tarafa bölünüyor',
      'Dengeli ve riskli eşleşme',
      'Kazanan seçimi riskli',
    ], hash);
  }
  if (pick.tone === 'draw') {
    return pickVariant([
      'Düşük skorlu maç profili',
      'Düşük skor ihtimali var',
      'Dar skor ihtimali canlı',
      'Gollü maç sinyali zayıf',
    ], hash);
  }
  if (pick.tone === 'home') {
    return pickVariant([
      `${homeName} formda önde`,
      `${homeName} daha avantajlı`,
      `${homeName} sezon verisinde önde`,
      `${homeName} kaybetmeme tarafında`,
    ], hash);
  }
  if (pick.tone === 'away') {
    return pickVariant([
      `${awayName} formda önde`,
      `${awayName} deplasmanda tehditli`,
      `${awayName} sezon verisinde önde`,
      `${awayName} kaybetmeme tarafında`,
    ], hash);
  }
  if (leader) return `${leader} hafif önde`;
  return pickVariant(['Dengeli eşleşme', 'Taraflar birbirine yakın', 'Net favori yok'], hash);
}

function homeCardSummary(m: Match, metrics: Metrics, pick: ReturnType<typeof buildScoutPick>, hash: number) {
  const homeName = m.home;
  const awayName = m.away;
  const goalLevel = metrics.expectedGoals >= 2.9 ? 'gol beklentisi yüksek' : metrics.expectedGoals >= 2.4 ? 'gol beklentisi orta-üst' : 'skor profili kontrollü';
  const ppgGap = Math.abs(metrics.homePpg - metrics.awayPpg);
  const homeAttack = metrics.homeAvgGf || 0;
  const awayAttack = metrics.awayAvgGf || 0;
  const homeDef = metrics.homeAvgGa || 0;
  const awayDef = metrics.awayAvgGa || 0;
  const attackGap = Math.abs(homeAttack - awayAttack);
  const defenseGap = Math.abs(homeDef - awayDef);

  if (pick.tone === 'goals') {
    return pickVariant([
      `${goalLevel}; iki takımın gol üretimi düşük skora kapanmıyor.`,
      `Hücum ortalamaları gol ihtimalini destekliyor, taraf avantajı ise daha sınırlı.`,
      `${expectedLine(metrics)}; bu maçta ana sinyal skor potansiyeli.`,
      `Savunma verileri iki taraf için de gol alanı bırakıyor.`,
    ], hash);
  }
  if (pick.tone === 'caution') {
    return pickVariant([
      `Form ve taraf sinyalleri bölünüyor; ilk gol maçın yönünü değiştirebilir.`,
      `Net favori sinyali zayıf; iki tarafın da güçlü ve zayıf alanı var.`,
      `${homeName} ve ${awayName} farklı verilerde öne çıkıyor, bu yüzden tek taraf yorumu riskli.`,
      `Denge yüksek; skor ya da erken baskı maçın yönünü değiştirebilir.`,
    ], hash);
  }
  if (pick.tone === 'draw') {
    return pickVariant([
      `${goalLevel}; iki taraf için de sabırlı başlangıç daha olası görünüyor.`,
      `Gol verisi düşük kalıyor; dar skor senaryosu veriyle uyumlu.`,
      `Form farkı büyük değil; kontrollü oyun ve tek gol etkisi öne çıkıyor.`,
      `Hücum verisi güçlü değil; maçın açılması için erken kırılma anı gerekebilir.`,
    ], hash);
  }
  if (pick.tone === 'home') {
    return pickVariant([
      `${homeName} form ve üretim tarafında önde; ${awayName} savunması baskı yiyebilir.`,
      `${homeName} avantajlı görünüyor, ancak gol beklentisi maçın riskini artırıyor.`,
      `Ev sahibi tarafı daha güçlü sinyal veriyor; ${goalLevel}.`,
      `${homeName} oyun kontrolüne daha yakın; fark özellikle hücum verisinden geliyor.`,
    ], hash);
  }
  if (pick.tone === 'away') {
    return pickVariant([
      `${awayName} form ve üretim tarafında önde; deplasman gol tehdidi öne çıkıyor.`,
      `${awayName} avantajlı görünüyor, ancak deplasman riski tamamen kapanmıyor.`,
      `Deplasman tarafı daha güçlü sinyal veriyor; ${goalLevel}.`,
      `${awayName} oyunda kalmaya yakın; avantaj daha çok form ve gol üretiminden geliyor.`,
    ], hash);
  }
  if (ppgGap <= 0.25 && attackGap <= 0.35 && defenseGap <= 0.35) {
    return pickVariant([
      `Takımların form, hücum ve savunma çizgisi yakın; denge sinyali güçlü.`,
      `Sezon verisi iki tarafı net ayırmıyor; ilk gol daha belirleyici olabilir.`,
      `Taraflar birbirine yakın; risk daha çok maçın skor akışında.`,
    ], hash);
  }
  return pickVariant([
    `${goalLevel}; form ve hücum-savunma dengesi birlikte okunmalı.`,
    `Sezon verisi tek yöne sert akmıyor; taraf yorumu temkinli kalmalı.`,
    `Ana sinyal ${goalLevel}; taraf yorumu ise form farkına bağlı.`,
  ], hash);
}

function standingsStatsFromMetrics(metrics: Metrics, side: 'home' | 'away'): MatchFormStats {
  const played = side === 'home' ? metrics.homePlayed : metrics.awayPlayed;
  const avgGf = side === 'home' ? metrics.homeAvgGf : metrics.awayAvgGf;
  const avgGa = side === 'home' ? metrics.homeAvgGa : metrics.awayAvgGa;
  const winPct = side === 'home' ? metrics.homeWinPct : metrics.awayWinPct;
  const expectedPct = clamp(28 + metrics.expectedGoals * 12, 30, 72);
  const bttsPct = clamp(34 + (metrics.homeAvgGf || 0) * 8 + (metrics.awayAvgGf || 0) * 8, 35, 70);

  return {
    total: played || 0,
    totalAvgGf: (avgGf || 0).toFixed(1),
    totalAvgGa: (avgGa || 0).toFixed(1),
    over25Pct: Math.round(expectedPct),
    kgVarPct: Math.round(bttsPct),
    homeWinPct: side === 'home' ? winPct || 0 : 0,
    awayWinPct: side === 'away' ? winPct || 0 : 0,
    totalWinPct: winPct || 0,
    homePlayed: side === 'home' ? played || 0 : 0,
    awayPlayed: side === 'away' ? played || 0 : 0,
  };
}

export function buildHomeCardAnalysis(m: Match, metrics: Metrics): { headline: string; summary: string } {
  if (!metrics.hasData) return { headline: '', summary: metrics.summary };

  const hasSignalInputs =
    metrics.homeAvgGf !== undefined &&
    metrics.homeAvgGa !== undefined &&
    metrics.awayAvgGf !== undefined &&
    metrics.awayAvgGa !== undefined;

  if (!hasSignalInputs) {
    if (metrics.favorite === 'balanced') return { headline: 'Dengeli eşleşme', summary: metrics.summary };
    const favName = metrics.favorite === 'home' ? m.home : m.away;
    const suffix = metrics.confidence === 'high' ? 'sezon tablosunda belirgin önde' : metrics.confidence === 'medium' ? 'sezon tablosunda önde' : 'sezon tablosunda hafif önde';
    return { headline: `${favName} ${suffix}`, summary: metrics.summary };
  }

  const homeStats = standingsStatsFromMetrics(metrics, 'home');
  const awayStats = standingsStatsFromMetrics(metrics, 'away');
  const homeFormPts = clamp(Math.round(metrics.homePpg * 5), 0, 15);
  const awayFormPts = clamp(Math.round(metrics.awayPpg * 5), 0, 15);
  const h2hCount = 0;
  const weatherRisk = false;
  const hash = strHash(`${m.home}-${m.away}-${m.id}`);
  const pick = buildScoutPick(m.home, m.away, homeStats, awayStats, homeFormPts, awayFormPts, h2hCount, weatherRisk);

  return {
    headline: homeCardHeadline(m, metrics, pick, hash),
    summary: homeCardSummary(m, metrics, pick, hash + 7),
  };
}

export function levelFromExpectedGoals(value: number): string {
  if (value >= 2.8) return 'Yüksek';
  if (value <= 2.0) return 'Düşük';
  return 'Orta';
}

export function riskFromMetrics(metrics: Metrics): string {
  if (!metrics.hasData) return 'Orta';
  if (metrics.confidence === 'high') return 'Düşük';
  if (metrics.confidence === 'low') return 'Yüksek';
  return 'Orta';
}

export function confidenceText(metrics: Metrics): string {
  if (!metrics.hasData) return 'Sınırlı';
  if (metrics.confidence === 'high') return 'Yüksek';
  if (metrics.confidence === 'medium') return 'Orta';
  return 'Düşük';
}

export function trendBarPercent(value: string): number {
  if (value === 'Yüksek') return 82;
  if (value === 'Düşük') return 36;
  if (value === 'Sınırlı') return 34;
  return 58;
}

export function singleMatchScoutText(m: Match, metrics: Metrics): string {
  if (!metrics.hasData) return `${m.home} - ${m.away} için sezon verisi sınırlı. Taraf yorumu yerine ilk bölüm temposu ve şut hacmi izlenmeli.`;
  const fav = favoriteText(m, metrics).toLowerCase();
  const tempo = metrics.expectedGoals >= 2.8 ? 'yüksek tempo' : metrics.expectedGoals <= 2.0 ? 'kontrollü tempo' : 'orta tempo';
  return `${m.home} - ${m.away} eşleşmesi ${tempo} profili sunuyor. ${expectedLine(metrics)}; taraf okumasında ${fav} sinyali var.`;
}

export function readH2HMatch(match: H2HRawItem) {
  const home = match.home || match.homeTeam?.shortName || match.homeTeam?.name || '';
  const away = match.away || match.awayTeam?.shortName || match.awayTeam?.name || '';
  const homeScore = match.homeScore ?? match.score?.fullTime?.home;
  const awayScore = match.awayScore ?? match.score?.fullTime?.away;
  const rawDate = match.date || match.utcDate;
  const date = rawDate ? new Date(rawDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return { home, away, homeScore, awayScore, date };
}
