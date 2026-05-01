import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, Image, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  clearLastApiError, getAllSportsH2H, getCityForTeam, getH2H, getHomeData, getLastApiError, getStandings, getSuperLigMatches, getSuperLigStandings, getTodayMatches, HomeData, Standing,
} from '../services/api';
import { loadNotifPrefs, scheduleNotifications } from '../services/notifications';
import { dataNoticeMessage, matchListEmptyMessage, summarizeSourceWarnings } from '../utils/emptyStates';

// ─── constants ───────────────────────────────────────────────────────────────

const STANDINGS_CACHE_KEY = 'scout_standings_cache_v5';
const FEATURED_MATCH_CACHE_KEY = 'scout_featured_match_cache_v1';
const HOME_DATA_CACHE_KEY = 'scout_home_data_cache_v1';

const SUPPORTED_LEAGUES = [2021, 2014, 2002, 2019, 2015, 2001];
const LEAGUE_NAMES: Record<number, string> = {
  2021: 'Premier Lig', 2014: 'La Liga', 2002: 'Bundesliga',
  2019: 'Serie A', 2015: 'Ligue 1', 2001: 'UCL', 203: 'Süper Lig',
};

const LEAGUE_WEIGHT: Record<number, number> = {
  2001: 30,  // UCL
  2021: 26,  // Premier Lig
  2014: 26,  // La Liga
  2002: 22,  // Bundesliga
  2019: 22,  // Serie A
  2015: 18,  // Ligue 1
  203:  14,  // Süper Lig
};

const MARQUEE_MATCHUPS: { leagueApiId: number; teams: [string, string]; bonus: number }[] = [
  { leagueApiId: 203,  teams: ['Galatasaray', 'Fenerbahce'], bonus: 12 },
  { leagueApiId: 203,  teams: ['Galatasaray', 'Besiktas'], bonus: 10 },
  { leagueApiId: 203,  teams: ['Fenerbahce', 'Besiktas'], bonus: 10 },
  { leagueApiId: 2019, teams: ['Milan', 'Juventus'], bonus: 9 },
  { leagueApiId: 2019, teams: ['Inter', 'Juventus'], bonus: 9 },
  { leagueApiId: 2019, teams: ['Inter', 'Milan'], bonus: 9 },
  { leagueApiId: 2014, teams: ['Real Madrid', 'Barcelona'], bonus: 12 },
  { leagueApiId: 2014, teams: ['Real Madrid', 'Atletico Madrid'], bonus: 8 },
  { leagueApiId: 2021, teams: ['Manchester United', 'Liverpool'], bonus: 10 },
  { leagueApiId: 2021, teams: ['Manchester United', 'Manchester City'], bonus: 9 },
  { leagueApiId: 2021, teams: ['Arsenal', 'Tottenham'], bonus: 8 },
  { leagueApiId: 2002, teams: ['Bayern', 'Dortmund'], bonus: 9 },
  { leagueApiId: 2015, teams: ['Paris Saint-Germain', 'Marseille'], bonus: 8 },
];

// standings yüklerken leagueApiId (Match'in kullandığı) → backend apiId eşlemesi
const STANDINGS_LEAGUES: { leagueApiId: number; apiId: number }[] = [
  { leagueApiId: 2021, apiId: 39 },
  { leagueApiId: 2014, apiId: 140 },
  { leagueApiId: 2002, apiId: 78 },
  { leagueApiId: 2019, apiId: 135 },
  { leagueApiId: 2015, apiId: 61 },
  { leagueApiId: 2001, apiId: 2 },
];

const LIG_FILTERS = [
  { label: 'Premier Lig', id: 2021 },
  { label: 'La Liga',     id: 2014 },
  { label: 'Bundesliga',  id: 2002 },
  { label: 'Serie A',     id: 2019 },
  { label: 'Ligue 1',     id: 2015 },
  { label: 'UCL',         id: 2001 },
  { label: 'Süper Lig',   id: 203  },
];

const DAYS   = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// standings'ten anlamlı metrik üretmek için minimum oynanmış maç sayısı
const MIN_PLAYED = 3;
const NEXT_MATCH_LOOKAHEAD_DAYS = 7;

// ─── types ───────────────────────────────────────────────────────────────────

type Match = {
  id: number; leagueApiId: number; league: string;
  home: string; away: string; time: string;
  date?: string;
  score: string | null; finished: boolean;
  city: string | null; utcDate: string;
  homeTeamId: number; awayTeamId: number;
};

type Metrics = {
  hasData: boolean;
  expectedGoals: number;   // toplam beklenen gol (Poisson xG)
  leagueAvg: number;       // lig ortalaması gol/takım/maç (Poisson normalize için)
  homePpg: number;         // puan / maç
  awayPpg: number;
  diff: number;            // homePpg - awayPpg
  favorite: 'home' | 'away' | 'balanced';
  confidence: 'low' | 'medium' | 'high';
  tempo: number;           // toplam gol ortalaması (iki takım birleşik)
  homePos?: number;        // lig sırası (prestij bonusu için)
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
  reason?: string;         // hasData=false ise neden
  summary: string;         // kart altındaki açıklama cümlesi
};

type ListItem = {
  key: string;
  type: 'notice' | 'section-header' | 'hero' | 'highlight' | 'day-summary' | 'match' | 'single-insight' | 'single-trends' | 'single-h2h' | 'tomorrow-featured' | 'empty' | 'empty-scout';
  m?: Match;
  metrics?: Metrics;
  h2h?: any[];
  rank?: number;
  title?: string;
  sub?: string;
  summary?: string;
  filter?: string;
  notice?: 'stale' | 'warning' | 'error';
  warningText?: string | null;
};

type FeaturedMatchCache = Record<string, number>;

// ─── metrics engine ──────────────────────────────────────────────────────────

function normalizeTeam(name: string): string {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİ]/g, 'i')
    // Avrupa aksanları — lig puan tablolarında ESPN vs football-data.org isim uyumsuzluğunu önler
    .replace(/[éèêë]/g, 'e').replace(/[áàâä]/g, 'a').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõ]/g, 'o').replace(/[úùû]/g, 'u').replace(/ñ/g, 'n').replace(/ß/g, 's')
    .replace(/\s+/g, ' ').trim();
}

// football-data.org shortName → ESPN displayName eşleştirmesi yapılamayan bilinen takımlar
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

function findStanding(standings: Standing[] | undefined, teamName: string, teamId: number): Standing | null {
  if (!standings || standings.length === 0) return null;
  if (teamId > 0) {
    const byId = standings.find(s => s.teamId === teamId);
    if (byId) return byId;
  }
  const target = normalizeTeam(teamName);
  if (!target) return null;
  // Alias varsa genişletilmiş hedef listesiyle ara
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

function hasUsableStandingsMap(map: Record<number, Standing[]> | null): map is Record<number, Standing[]> {
  if (!map) return false;
  if (Array.isArray(map[203]) && map[203].length > 0) return true;
  return STANDINGS_LEAGUES.some(({ leagueApiId }) => Array.isArray(map[leagueApiId]) && map[leagueApiId].length > 0);
}

const NO_DATA: Metrics = {
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

function computeMetrics(home: Standing | null, away: Standing | null, standings?: Standing[], leagueApiId?: number): Metrics {
  if (!home || !away) {
    const reason = 'Takım tablo satırı eşleşmedi';
    return { ...NO_DATA, reason };
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
    summary: buildMatchSummary({ expectedGoals, favorite, confidence, tempo, homePpg, awayPpg }),
  };
}

function buildMatchSummary(m: {
  expectedGoals: number; favorite: 'home' | 'away' | 'balanced';
  confidence: 'low' | 'medium' | 'high'; tempo: number; homePpg: number; awayPpg: number;
}): string {
  const bits: string[] = [];
  if (m.expectedGoals >= 3.2)      bits.push('gol çizgisi canlı');
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

function buildDaySummary(metricsList: Metrics[]): string {
  const withData = metricsList.filter(m => m.hasData);
  if (withData.length === 0) return 'Bugünün maçları için yeterli sezon verisi yok.';
  const avgXG      = withData.reduce((s, m) => s + m.expectedGoals, 0) / withData.length;
  const highScore  = withData.filter(m => m.expectedGoals > 3.0).length;
  const balanced   = withData.filter(m => m.favorite === 'balanced').length;
  const highConf   = withData.filter(m => m.confidence === 'high').length;
  const half       = Math.ceil(withData.length / 2);

  const parts: string[] = [];
  parts.push(`Maç başına ortalama ~${avgXG.toFixed(1)} gol bekleniyor.`);
  if (highScore >= 3)        parts.push(`${highScore} maçta 3+ gol profili var.`);
  if (balanced >= half)      parts.push('Çoğu maç dengeli profilde.');
  else if (highConf >= half) parts.push('Çoğu maçta belirgin bir favori öne çıkıyor.');
  return parts.join(' ');
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getDateList() {
  const dates: Date[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(); d.setDate(d.getDate() + i); dates.push(d);
  }
  return dates;
}

function formatDateParam(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(utcDate: string) {
  const d = new Date(utcDate);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatSportsDbTime(date: string, time?: string | null) {
  if (!time) return '?';
  const d = new Date(`${date}T${time}Z`);
  if (Number.isNaN(d.getTime())) return time.substring(0, 5);
  return formatTime(d.toISOString());
}

function sportsDbUtcDate(date: string, time?: string | null) {
  return `${date}T${time || '00:00:00'}Z`;
}

function isToday(date: Date) { return date.toDateString() === new Date().toDateString(); }

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function timeToMins(t: string): number {
  const p = t.split(':');
  return p.length === 2 ? parseInt(p[0]) * 60 + parseInt(p[1]) : 0;
}

function scoutScore(m: Match, metrics: Metrics): number {
  let s = LEAGUE_WEIGHT[m.leagueApiId] ?? 8;
  const mins = timeToMins(m.time);
  if (mins >= 20 * 60)      s += 2;
  else if (mins >= 18 * 60) s += 1;
  if (!m.finished) s += 1;

  // Prestij bonusu: lig sırası üst-sıra takımları öne çıkarır
  const posBonusFn = (pos: number | undefined) => {
    if (pos === undefined) return 0;
    if (pos <= 3) return 4;
    if (pos <= 6) return 2;
    return 0;
  };
  s += posBonusFn(metrics.homePos) + posBonusFn(metrics.awayPos);
  s += marqueeBonus(m);

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

function marqueeBonus(m: Match): number {
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

// ─── data mapping ────────────────────────────────────────────────────────────

function mapSLMatch(m: any): Match {
  const hasScore   = m.homeScore !== null && m.homeScore !== undefined;
  const isFinished = m.status === 'Match Finished' || hasScore;
  const utcDate = sportsDbUtcDate(m.date, m.time);
  return {
    id:          parseInt(m.id) || strHash(m.home + m.away + m.date),
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

function mapMatch(m: any): Match {
  const finished = m.status === 'FINISHED';
  const fh = m.score?.fullTime?.home, fa = m.score?.fullTime?.away;
  return {
    id:          m.id,
    leagueApiId: m.competition?.id || 0,
    league:      LEAGUE_NAMES[m.competition?.id] || m.competition?.name || 'Diğer',
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

// ─── components ──────────────────────────────────────────────────────────────

function isRenderableMatch(m: Match) {
  return Boolean(m.home?.trim() && m.away?.trim() && m.time && m.league);
}

function buildVisibleMatches(data: any[], slData: any[]) {
  const mainMatches = data
    .filter((m: any) => SUPPORTED_LEAGUES.includes(m.competition?.id))
    .map(mapMatch)
    .filter(isRenderableMatch);
  const superLigMatches = slData
    .map(mapSLMatch)
    .filter(isRenderableMatch);
  return [...mainMatches, ...superLigMatches];
}

function rankMatchesWithMetrics(matches: Match[], rowsMap: Record<number, Standing[]>) {
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

function buildNextPreviewFromHomeData(homeData: Pick<HomeData, 'nextPreview'>, rowsMap: Record<number, Standing[]>) {
  if (!homeData.nextPreview) return null;
  const nextVisible = buildVisibleMatches(homeData.nextPreview.matches || [], homeData.nextPreview.superLigMatches || []);
  const backendFeaturedMatchId = homeData.nextPreview.featuredMatchId ?? null;
  if (backendFeaturedMatchId) {
    const backendFeatured = nextVisible.find(match => match.id === backendFeaturedMatchId);
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
  return rankMatchesWithMetrics(nextVisible, rowsMap)[0] || null;
}

function uniqueLeagueIds(matches: Match[]) {
  return [...new Set(matches.map(m => m.leagueApiId).filter(Boolean))];
}

function favoriteText(m: Match, metrics: Metrics): string {
  if (!metrics.hasData) return '';
  if (metrics.favorite === 'balanced') return 'Dengeli eşleşme';
  const favName = metrics.favorite === 'home' ? m.home : m.away;
  if (metrics.confidence === 'high')   return `${favName} belirgin favori`;
  if (metrics.confidence === 'medium') return `${favName} favori`;
  return `${favName} hafif önde`;
}

function expectedLine(metrics: Metrics): string {
  return `Beklenen ~${metrics.expectedGoals.toFixed(1)} gol`;
}

function levelFromExpectedGoals(value: number) {
  if (value >= 2.8) return 'Yüksek';
  if (value <= 2.0) return 'Düşük';
  return 'Orta';
}

function riskFromMetrics(metrics: Metrics) {
  if (!metrics.hasData) return 'Orta';
  if (metrics.confidence === 'high') return 'Düşük';
  if (metrics.confidence === 'low') return 'Yüksek';
  return 'Orta';
}

function confidenceText(metrics: Metrics) {
  if (!metrics.hasData) return 'Sınırlı';
  if (metrics.confidence === 'high') return 'Yüksek';
  if (metrics.confidence === 'medium') return 'Orta';
  return 'Düşük';
}

function trendBarPercent(value: string) {
  if (value === 'Yüksek') return 82;
  if (value === 'Düşük') return 36;
  if (value === 'Sınırlı') return 34;
  return 58;
}

function singleMatchScoutText(m: Match, metrics: Metrics) {
  if (!metrics.hasData) return `${m.home} - ${m.away} için sezon verisi sınırlı. Taraf yorumu yerine ilk bölüm temposu ve şut hacmi izlenmeli.`;
  const fav = favoriteText(m, metrics).toLowerCase();
  const tempo = metrics.expectedGoals >= 2.8 ? 'yüksek tempo' : metrics.expectedGoals <= 2.0 ? 'kontrollü tempo' : 'orta tempo';
  return `${m.home} - ${m.away} eşleşmesi ${tempo} profili sunuyor. ${expectedLine(metrics)}; taraf okumasında ${fav} sinyali var.`;
}

function readH2HMatch(match: any) {
  const home = match.home || match.homeTeam?.shortName || match.homeTeam?.name || '';
  const away = match.away || match.awayTeam?.shortName || match.awayTeam?.name || '';
  const homeScore = match.homeScore ?? match.score?.fullTime?.home;
  const awayScore = match.awayScore ?? match.score?.fullTime?.away;
  const rawDate = match.date || match.utcDate;
  const date = rawDate ? new Date(rawDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return { home, away, homeScore, awayScore, date };
}

function HeroCard({ m, metrics, onPress }: { m: Match; metrics: Metrics; onPress: () => void }) {
  return (
    <TouchableOpacity style={sc.heroCard} onPress={onPress} activeOpacity={0.85}>
      <View style={sc.heroTop}>
        <Text style={sc.heroFireLabel}>🔥 GÜNÜN MAÇI</Text>
        <Text style={sc.heroLeague}>{m.league}</Text>
      </View>
      <View style={sc.heroTeamRow}>
        <Text style={sc.heroTeam} numberOfLines={1}>{m.home}</Text>
        <View style={sc.heroCenter}>
          {m.finished && m.score ? (
            <>
              <Text style={sc.heroScore}>{m.score}</Text>
              <Text style={sc.heroSubLabel}>MS</Text>
            </>
          ) : (
            <>
              <Text style={sc.heroSubLabel}>vs</Text>
              <Text style={sc.heroTime}>{m.time}</Text>
            </>
          )}
        </View>
        <Text style={[sc.heroTeam, { textAlign: 'right' }]} numberOfLines={1}>{m.away}</Text>
      </View>

      {metrics.hasData ? (
        <>
          <View style={sc.heroMetricRow}>
            <Text style={sc.heroMetricPrimary}>{expectedLine(metrics)}</Text>
            <Text style={sc.heroMetricDot}>·</Text>
            <Text style={sc.heroMetricPrimary} numberOfLines={1}>{favoriteText(m, metrics)}</Text>
          </View>
          <Text style={sc.heroSummary}>{metrics.summary}</Text>
        </>
      ) : (
        <Text style={sc.heroSummary}>{metrics.summary}</Text>
      )}
    </TouchableOpacity>
  );
}

function MiniMetric({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone?: 'hot' | 'cool' | 'warn' }) {
  const { colors: c, isDark } = useTheme();
  const color = tone === 'hot' ? c.primary : tone === 'warn' ? (isDark ? '#E3B341' : '#B7791F') : c.textSub;
  return (
    <View style={[sc.miniMetric, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[sc.miniMetricLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[sc.miniMetricValue, { color }]}>{value}</Text>
    </View>
  );
}

function SingleInsightCard({ m, metrics }: { m: Match; metrics: Metrics }) {
  const { colors: c } = useTheme();
  return (
    <View style={[sc.singlePanel, { backgroundColor: c.surface, borderColor: c.cardBorder }]}>
      <View style={sc.singleTitleRow}>
        <Ionicons name="sparkles-outline" size={17} color={c.primary} />
        <Text style={[sc.singleTitle, { color: c.primary }]}>SCOUT NE DİYOR?</Text>
      </View>
      <Text style={[sc.singleText, { color: c.text }]}>{singleMatchScoutText(m, metrics)}</Text>
      <View style={sc.singleMetrics}>
        <MiniMetric icon="flash-outline" label="Tempo" value={levelFromExpectedGoals(metrics.expectedGoals)} tone="hot" />
        <MiniMetric icon="stats-chart-outline" label="Gol Bek." value={levelFromExpectedGoals(metrics.expectedGoals)} tone="hot" />
        <MiniMetric icon="shield-outline" label="Risk" value={riskFromMetrics(metrics)} tone="warn" />
      </View>
    </View>
  );
}

function ProgressRow({ label, value, percent }: { label: string; value: string; percent: number }) {
  const { colors: c } = useTheme();
  return (
    <View style={sc.progressRow}>
      <View style={sc.progressTop}>
        <Text style={[sc.progressLabel, { color: c.text }]}>{label}</Text>
        <Text style={[sc.progressValue, { color: c.text }]}>{value}</Text>
      </View>
      <View style={[sc.progressTrack, { backgroundColor: c.borderLight }]}>
        <View style={[sc.progressFill, { width: `${Math.max(8, Math.min(100, percent))}%`, backgroundColor: c.primary }]} />
      </View>
    </View>
  );
}

function SingleTrendsCard({ m, metrics }: { m: Match; metrics: Metrics }) {
  const { colors: c } = useTheme();
  const goalLevel = levelFromExpectedGoals(metrics.expectedGoals);
  const sideValue = metrics.hasData ? favoriteText(m, metrics) : 'Belirsiz';
  const confidence = confidenceText(metrics);
  return (
    <View style={[sc.trendPanel, { backgroundColor: c.surface, borderColor: c.cardBorder }]}>
      <View style={sc.singleTitleRow}>
        <Ionicons name="analytics-outline" size={17} color={c.primary} />
        <Text style={[sc.singleTitle, { color: c.primary }]}>MAÇ TRENDLERİ</Text>
      </View>
      <ProgressRow label="Gol çizgisi" value={`~${metrics.expectedGoals.toFixed(1)} gol · ${goalLevel}`} percent={trendBarPercent(goalLevel)} />
      <ProgressRow label="Taraf okuması" value={sideValue || 'Dengeli'} percent={metrics.favorite === 'balanced' ? 52 : 70} />
      <ProgressRow label="Veri güveni" value={confidence} percent={trendBarPercent(confidence)} />
      <Text style={[sc.trendFoot, { color: c.textMuted }]}>Beklenen gol, lig tablosu ve form eşleşmesinden türetilen özet sinyal.</Text>
    </View>
  );
}

function SingleH2HCard({ h2h }: { h2h: any[] }) {
  const { colors: c } = useTheme();
  const rows = h2h.slice(0, 3).map(readH2HMatch);
  return (
    <View style={[sc.h2hPanel, { backgroundColor: c.surface, borderColor: c.cardBorder }]}>
      <View style={sc.singleTitleRow}>
        <Ionicons name="time-outline" size={17} color={c.primary} />
        <Text style={[sc.singleTitle, { color: c.primary }]}>SON 3 H2H</Text>
      </View>
      {rows.length === 0 ? (
        <Text style={[sc.h2hEmpty, { color: c.textMuted }]}>Bu eşleşme için yakın geçmiş verisi sınırlı.</Text>
      ) : rows.map((row, i) => (
        <View key={`${row.date}-${i}`} style={[sc.h2hMiniRow, { borderTopColor: c.borderLight }]}>
          <View style={sc.h2hMiniTeams}>
            <Text style={[sc.h2hMiniDate, { color: c.textMuted }]}>{row.date}</Text>
            <Text style={[sc.h2hMiniText, { color: c.text }]} numberOfLines={1}>{row.home} - {row.away}</Text>
          </View>
          <Text style={[sc.h2hMiniScore, { color: c.text }]}>{row.homeScore ?? '-'} - {row.awayScore ?? '-'}</Text>
        </View>
      ))}
    </View>
  );
}

function TomorrowFeaturedCard({ m, metrics, onPress }: { m: Match; metrics: Metrics; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity style={[sc.tomorrowCard, { backgroundColor: c.surface, borderColor: c.cardBorder }]} onPress={onPress} activeOpacity={0.86}>
      <View style={sc.hlTop}>
        <View style={sc.singleTitleRow}>
          <Ionicons name="star-outline" size={17} color="#E3B341" />
          <Text style={[sc.singleTitle, { color: '#E3B341' }]}>YAKLAŞAN ÖNE ÇIKAN</Text>
        </View>
        <Text style={[sc.hlLeague, { color: c.primary }]}>{m.league}</Text>
      </View>
      <View style={sc.hlTeams}>
        <Text style={[sc.hlTeam, { color: c.text }]} numberOfLines={1}>{m.home}</Text>
        <Text style={[sc.hlTime, { color: c.text }]}>{m.finished && m.score ? m.score : m.time}</Text>
        <Text style={[sc.hlTeam, { color: c.text, textAlign: 'right' }]} numberOfLines={1}>{m.away}</Text>
      </View>
      <Text style={[sc.hlMetric, { color: c.primary }]}>{metrics.hasData ? `${expectedLine(metrics)} · ${favoriteText(m, metrics)}` : metrics.summary}</Text>
    </TouchableOpacity>
  );
}

function EmptyActionCard({
  icon,
  title,
  text,
  accent,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  accent: string;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity style={[sc.emptyAction, { backgroundColor: c.surface, borderColor: c.cardBorder }]} onPress={onPress} activeOpacity={0.86}>
      <View style={[sc.emptyActionIcon, { borderColor: accent }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <View style={sc.emptyActionText}>
        <Text style={[sc.emptyActionTitle, { color: accent }]}>{title}</Text>
        <Text style={[sc.emptyActionBody, { color: c.text }]}>{text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={c.textMuted} />
    </TouchableOpacity>
  );
}

function DataNoticeCard({ type, message }: { type: 'stale' | 'warning' | 'error'; message?: string | null }) {
  const { colors: c, isDark } = useTheme();
  const isStale = type === 'stale';
  const isWarning = type === 'warning';
  const accentColor = isStale ? c.primary : isWarning ? '#E3B341' : '#E16F3D';
  const backgroundColor = isDark
    ? isWarning ? '#2A2416' : type === 'error' ? '#2B1F1A' : '#18202A'
    : isWarning ? '#FFF7E5' : type === 'error' ? '#FFF1EC' : '#F3F7FC';
  const borderColor = isWarning
    ? (isDark ? '#6E5A1F' : '#F3D07B')
    : type === 'error'
      ? (isDark ? '#7B4A37' : '#F2B39A')
      : c.cardBorder;
  return (
    <View style={[sc.noticeCard, { backgroundColor, borderColor }]}>
      <Ionicons
        name={isStale ? 'time-outline' : isWarning ? 'alert-circle-outline' : 'cloud-offline-outline'}
        size={18}
        color={accentColor}
      />
      <Text style={[sc.noticeText, { color: c.textSub }]}>
        {message || dataNoticeMessage(type)}
      </Text>
    </View>
  );
}

function EmptyScoutState({
  selectedDate,
  preview,
  onNextDate,
  onRefresh,
  onOpenLeagues,
  onOpenStats,
  onOpenMatch,
}: {
  selectedDate: Date;
  preview: { m: Match; metrics: Metrics } | null;
  onNextDate: () => void;
  onRefresh: () => void;
  onOpenLeagues: () => void;
  onOpenStats: () => void;
  onOpenMatch: () => void;
}) {
  const { colors: c } = useTheme();
  const dateText = `${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]}`;
  return (
    <View style={sc.emptyScoutWrap}>
      <View style={sc.emptyHero}>
        <Ionicons name="calendar-clear-outline" size={58} color={c.primary} />
        <Text style={[sc.emptyHeroTitle, { color: c.text }]}>Bu tarihte maç bulunamadı</Text>
        <Text style={[sc.emptyHeroText, { color: c.textMuted }]}>Seçili liglerde {dateText} için maç görünmüyor.</Text>
        <View style={sc.emptyHeroActions}>
          <TouchableOpacity style={[sc.emptyPrimaryBtn, { borderColor: c.primary }]} onPress={onNextDate}>
            <Ionicons name="calendar-outline" size={17} color={c.primary} />
            <Text style={[sc.emptyPrimaryText, { color: c.primary }]}>Sonraki maç gününe git</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[sc.emptyIconBtn, { borderColor: c.border }]} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color={c.textSub} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={sc.sectionHeader}>
        <Text style={[sc.sectionTitle, { color: c.textMuted }]}>KEŞFET & ANALİZ ET</Text>
      </View>

      {preview && (
        <TomorrowFeaturedCard m={preview.m} metrics={preview.metrics} onPress={onOpenMatch} />
      )}
      <EmptyActionCard
        icon="trophy-outline"
        title="LİGLERE GÖZ AT"
        text="Puan tabloları, takım profilleri ve lig genel görünümünü incele."
        accent={c.primary}
        onPress={onOpenLeagues}
      />
      <EmptyActionCard
        icon="stats-chart-outline"
        title="İSTATİSTİKLERİ KEŞFET"
        text="Gol, form ve takım trendlerini maç olmayan günlerde değerlendirebilirsin."
        accent="#8B5CF6"
        onPress={onOpenStats}
      />
      <View style={[sc.emptyNote, { backgroundColor: c.surface, borderColor: c.cardBorder }]}>
        <View style={sc.singleTitleRow}>
          <Ionicons name="chatbubble-outline" size={18} color={c.primary} />
          <Text style={[sc.singleTitle, { color: c.primary }]}>SCOUT NOTU</Text>
        </View>
        <Text style={[sc.emptyNoteText, { color: c.text }]}>Maç olmayan günlerde en sağlıklı hazırlık, lig formunu ve takım trendlerini izlemek. Yeni maçlar yayınlandığında ana ekran otomatik olarak yeniden anlam kazanır.</Text>
      </View>
    </View>
  );
}

function HighlightCard({ m, rank, metrics, onPress }: {
  m: Match; rank: number; metrics: Metrics; onPress: () => void;
}) {
  const { colors: c } = useTheme();
  const label = rank === 0 ? '⭐ Öne Çıkan' : rank === 1 ? '🎯 İzlenecek' : '📌 Dikkat';
  const borderColor = rank === 0 ? c.primary : rank === 1 ? '#E6A817' : c.textFaint;
  return (
    <TouchableOpacity style={[sc.hlCard, { backgroundColor: c.surface, borderColor: c.cardBorder, borderLeftColor: borderColor }]} onPress={onPress} activeOpacity={0.85}>
      <View style={sc.hlTop}>
        <Text style={[sc.hlRank, { color: borderColor }]}>{label}</Text>
        <Text style={[sc.hlLeague, { color: c.textFaint }]}>{m.league}</Text>
      </View>
      <View style={sc.hlTeams}>
        <Text style={[sc.hlTeam, { color: c.text }]} numberOfLines={1}>{m.home}</Text>
        <Text style={[sc.hlTime, { color: c.textSub }]}>{m.finished && m.score ? m.score : m.time}</Text>
        <Text style={[sc.hlTeam, { color: c.text, textAlign: 'right' }]} numberOfLines={1}>{m.away}</Text>
      </View>
      {metrics.hasData ? (
        <>
          <Text style={[sc.hlMetric, { color: c.primary }]}>{expectedLine(metrics)} · {favoriteText(m, metrics)}</Text>
          <Text style={[sc.hlSummary, { color: c.textSub }]}>{metrics.summary}</Text>
        </>
      ) : (
        <Text style={[sc.hlSummary, { color: c.textSub }]}>{metrics.summary}</Text>
      )}
    </TouchableOpacity>
  );
}

function DaySummaryCard({ summary }: { summary: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={[sc.daySummary, { backgroundColor: c.surface, borderColor: c.cardBorder }]}>
      <Text style={[sc.daySummaryTitle, { color: c.primary }]}>📊 BUGÜN NE BEKLENİYOR?</Text>
      <Text style={[sc.daySummaryText, { color: c.text }]}>{summary}</Text>
    </View>
  );
}

function MatchRow({ m, metrics, onPress }: { m: Match; metrics: Metrics; onPress: () => void }) {
  const { colors: c } = useTheme();
  const hasScore = m.finished && m.score;
  return (
    <TouchableOpacity style={[sc.matchCard, { backgroundColor: c.surface, borderColor: c.border }]} onPress={onPress} activeOpacity={0.8}>
      <View style={sc.matchTop}>
        <Text style={[sc.matchLeague, { color: c.primary }]}>{m.league}</Text>
        {hasScore ? (
          <Text style={[sc.scoreMs, { color: c.textFaint }]}>MS</Text>
        ) : (
          <Text style={[sc.matchTime, { color: c.textSub }]}>{m.time}</Text>
        )}
      </View>
      <View style={sc.matchTeams}>
        <Text style={[sc.matchTeam, { color: c.text }]} numberOfLines={1}>{m.home}</Text>
        {hasScore ? (
          <Text style={[sc.scoreText, { color: c.text, paddingHorizontal: 8 }]}>{m.score}</Text>
        ) : (
          <Text style={[sc.matchSep, { color: c.textVeryFaint }]}>—</Text>
        )}
        <Text style={[sc.matchTeam, { color: c.text, textAlign: 'right' }]} numberOfLines={1}>{m.away}</Text>
      </View>
      {metrics.hasData ? (
        <Text style={[sc.matchMetricLine, { color: c.primary }]}>
          {expectedLine(metrics)} · {favoriteText(m, metrics)}
        </Text>
      ) : (
        <Text style={[sc.matchMetricLineMuted, { color: c.textFaint }]}>{metrics.reason}</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { colors: c, isDark } = useTheme();
  const [activeFilter, setActiveFilter] = useState<string>('Scout');
  const [matches, setMatches]           = useState<Match[]>([]);
  const [standingsMap, setStandingsMap] = useState<Record<number, Standing[]>>({});
  const [nextDayPreview, setNextDayPreview] = useState<{ m: Match; metrics: Metrics } | null>(null);
  const [singleH2H, setSingleH2H] = useState<any[]>([]);
  const [featuredMatchCache, setFeaturedMatchCache] = useState<FeaturedMatchCache>({});
  const [backendFeaturedMatchId, setBackendFeaturedMatchId] = useState<number | null>(null);
  const [homeDataNotice, setHomeDataNotice] = useState<'stale' | 'warning' | 'error' | null>(null);
  const [homeDataWarningText, setHomeDataWarningText] = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateList          = getDateList();
  const initialFocusDone  = useRef(false);
  const loadSeq           = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(FEATURED_MATCH_CACHE_KEY)
      .then(raw => {
        if (raw) setFeaturedMatchCache(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMatches(selectedDate);
    // loadMatches reads the latest standings cache; selectedDate is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // 10 dakikada bir sessiz yenileme — bitmiş maçların skorlarını günceller
  useEffect(() => {
    if (!isToday(selectedDate)) return;
    const id = setInterval(() => loadMatches(selectedDate, true), 10 * 60 * 1000);
    return () => clearInterval(id);
    // loadMatches is intentionally not a timer dependency; selectedDate resets the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Uygulama arka plandan öne geldiğinde tarih değiştiyse yeni güne geç
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      const today = new Date();
      if (selectedDate.toDateString() !== today.toDateString()) {
        setSelectedDate(today);
      }
    });
    return () => sub.remove();
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      if (!initialFocusDone.current) initialFocusDone.current = true;
      else loadMatches(selectedDate, true);
      // loadMatches uses current screen state; focus refresh is keyed by selectedDate.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate])
  );

  useEffect(() => {
    let cancelled = false;
    async function loadSingleH2H() {
      if (activeFilter !== 'Scout' || matches.length !== 1) {
        setSingleH2H([]);
        return;
      }
      const match = matches[0];
      try {
        const data = match.leagueApiId === 203
          ? await getAllSportsH2H(match.home, match.away)
          : await getH2H(String(match.id), match.finished);
        if (!cancelled) setSingleH2H((data || []).slice(0, 3));
      } catch {
        if (!cancelled) setSingleH2H([]);
      }
    }
    loadSingleH2H();
    return () => { cancelled = true; };
  }, [activeFilter, matches]);

  async function loadMatches(date: Date, silent = false) {
    const requestId = ++loadSeq.current;
    if (!silent) {
      if (loading) setLoading(true);
      else setRefreshing(true);
    }
    try {
      const dateStr = formatDateParam(date);
      const homeData = await getHomeData(dateStr);
      if (homeData) {
        if (requestId !== loadSeq.current) return;
        applyHomeData(dateStr, homeData, {
          notice: homeData.stale ? 'stale' : homeData.sourceSeverity ?? null,
          persist: true,
        });
        return;
      }

      setBackendFeaturedMatchId(null);
      setHomeDataNotice('error');
      setHomeDataWarningText(null);
      try {
        const rawHome = await AsyncStorage.getItem(`${HOME_DATA_CACHE_KEY}:${dateStr}`);
        if (rawHome) {
          const cachedHome = JSON.parse(rawHome);
          if (requestId !== loadSeq.current) return;
          applyHomeData(dateStr, cachedHome, { notice: 'stale' });
          return;
        }
      } catch {}

      if (!__DEV__) {
        setStandingsMap({});
        setMatches([]);
        setNextDayPreview(null);
        return;
      }

      await loadDevFallbackMatches(date, dateStr, requestId, silent);
    } catch (e) {
      console.error('loadMatches hata:', e);
    } finally {
      if (requestId === loadSeq.current) {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    }
  }

  function applyHomeData(
    dateStr: string,
    homeData: HomeData,
    options: { notice: 'stale' | 'warning' | 'error' | null; persist?: boolean },
  ) {
    const homeStandings = homeData.standings || {};
    const visible = buildVisibleMatches(homeData.matches || [], homeData.superLigMatches || []);
    setStandingsMap(homeStandings);
    setMatches(visible);
    setBackendFeaturedMatchId(homeData.featuredMatchId ?? null);
    setHomeDataNotice(options.notice);
    setHomeDataWarningText(
      options.notice && options.notice !== 'stale'
        ? summarizeSourceWarnings(homeData.sourceWarnings, homeData.sourceSeverity)
        : null,
    );
    setNextDayPreview(visible.length <= 1 ? buildNextPreviewFromHomeData(homeData, homeStandings) : null);

    if (options.persist) {
      AsyncStorage.setItem(STANDINGS_CACHE_KEY, JSON.stringify({ cacheDate: dateStr, data: homeStandings })).catch(() => {});
      AsyncStorage.setItem(`${HOME_DATA_CACHE_KEY}:${dateStr}`, JSON.stringify(homeData)).catch(() => {});
    }
  }

  async function loadDevFallbackMatches(date: Date, dateStr: string, requestId: number, silent: boolean) {
      clearLastApiError();
      const syncFallbackNotice = () => {
        setHomeDataNotice(getLastApiError() ? 'error' : null);
        setHomeDataWarningText(null);
      };
      const needsStandings = Object.keys(standingsMap).length === 0;
      if (!silent && needsStandings) {
        // Cache'ten standings yükle (aynı gün ise ağa gitme — hero kararlı kalır)
        let map: Record<number, Standing[]> | null = null;
        try {
          const raw = await AsyncStorage.getItem(STANDINGS_CACHE_KEY);
          if (raw) {
            const { cacheDate, data: cached } = JSON.parse(raw);
            if (cacheDate === dateStr && hasUsableStandingsMap(cached)) map = cached;
          }
        } catch {}

        if (map) {
          // Cache var: eksik ligleri maçlarla aynı anda çek (background race condition'ı önlemek için)
          const missingLeagues = STANDINGS_LEAGUES.filter(({ leagueApiId }) => !map![leagueApiId]?.length);
          const [data, slData, ...missingResults] = await Promise.all([
            getTodayMatches(dateStr),
            getSuperLigMatches(dateStr),
            ...missingLeagues.map(({ apiId }) => getStandings(apiId)),
          ]);
          if (requestId !== loadSeq.current) return;
          // Eksik ligleri cache'e ekle
          const updatedMap = { ...map };
          missingLeagues.forEach((x, i) => {
            if (missingResults[i]?.length > 0) updatedMap[x.leagueApiId] = missingResults[i];
          });
          setStandingsMap(updatedMap);
          if (missingLeagues.some((x, i) => missingResults[i]?.length > 0)) {
            AsyncStorage.setItem(STANDINGS_CACHE_KEY, JSON.stringify({ cacheDate: dateStr, data: updatedMap })).catch(() => {});
          }
          const visible = buildVisibleMatches(data, slData);
          const rowsMap = await ensureStandingsForMatches(visible, dateStr, requestId, updatedMap);
          if (requestId !== loadSeq.current) return;
          setMatches(visible);
          if (visible.length === 1) {
            void loadNextDayPreview(date, requestId, rowsMap);
          } else {
            setNextDayPreview(null);
          }
          syncFallbackNotice();
        } else {
          // İlk yükleme: maç + standings birlikte çek, cache'e kaydet
          const [data, slData, fdResults, slStandings] = await Promise.all([
            getTodayMatches(dateStr),
            getSuperLigMatches(dateStr),
            Promise.all(STANDINGS_LEAGUES.map(({ apiId }) => getStandings(apiId))),
            getSuperLigStandings(),
          ]);
          if (requestId !== loadSeq.current) return;
          map = {};
          // Yalnızca dolu standings'i kaydet — boşları cache'e yazma
          STANDINGS_LEAGUES.forEach((x, i) => { if (fdResults[i]?.length > 0) map![x.leagueApiId] = fdResults[i]; });
          if (slStandings?.length > 0) map[203] = slStandings;
          AsyncStorage.setItem(STANDINGS_CACHE_KEY, JSON.stringify({ cacheDate: dateStr, data: map })).catch(() => {});
          setStandingsMap(map);
          const visible = buildVisibleMatches(data, slData);
          const rowsMap = await ensureStandingsForMatches(visible, dateStr, requestId, map);
          if (requestId !== loadSeq.current) return;
          setMatches(visible);
          if (visible.length === 1) {
            void loadNextDayPreview(date, requestId, rowsMap);
          } else {
            setNextDayPreview(null);
          }
          syncFallbackNotice();
        }
      } else {
        // Güncelle / sessiz yenileme: sadece maç skorları güncellenir, standings sabit kalır
        const [data, slData] = await Promise.all([
          getTodayMatches(dateStr), getSuperLigMatches(dateStr),
        ]);
        if (requestId !== loadSeq.current) return;
        const visible = buildVisibleMatches(data, slData);
        const rowsMap = await ensureStandingsForMatches(visible, dateStr, requestId, standingsMap);
        if (requestId !== loadSeq.current) return;
        setMatches(visible);
        if (visible.length === 1) {
          void loadNextDayPreview(date, requestId, rowsMap);
        } else {
          setNextDayPreview(null);
        }
        syncFallbackNotice();
      }
  }

  async function loadNextDayPreview(date: Date, requestId: number, rowsMap: Record<number, Standing[]>) {
    try {
      for (let offset = 1; offset <= NEXT_MATCH_LOOKAHEAD_DAYS; offset += 1) {
        const next = new Date(date);
        next.setDate(next.getDate() + offset);
        const nextStr = formatDateParam(next);
        const [data, slData] = await Promise.all([
          getTodayMatches(nextStr),
          getSuperLigMatches(nextStr),
        ]);
        if (requestId !== loadSeq.current) return;
        const visible = buildVisibleMatches(data, slData);
        if (visible.length === 0) continue;

        const completeRowsMap = await ensureStandingsForMatches(visible, nextStr, requestId, rowsMap);
        if (requestId !== loadSeq.current) return;
        const ranked = visible
          .map(m => {
            const rows = completeRowsMap[m.leagueApiId];
            const home = findStanding(rows, m.home, m.homeTeamId);
            const away = findStanding(rows, m.away, m.awayTeamId);
            const metrics = computeMetrics(home, away, rows, m.leagueApiId);
            return { m, metrics };
          })
          .sort((a, b) => scoutScore(b.m, b.metrics) - scoutScore(a.m, a.metrics));
        setNextDayPreview(ranked[0]);
        return;
      }
      if (requestId === loadSeq.current) setNextDayPreview(null);
    } catch {
      if (requestId === loadSeq.current) setNextDayPreview(null);
    }
  }

  async function ensureStandingsForMatches(visible: Match[], dateStr: string, requestId: number, baseMap: Record<number, Standing[]>) {
    const missing = uniqueLeagueIds(visible).filter(leagueApiId => !baseMap[leagueApiId]?.length);
    if (missing.length === 0) return baseMap;

    const leagueRows = await Promise.all(missing.map(async leagueApiId => {
      if (leagueApiId === 203) return [leagueApiId, await getSuperLigStandings()] as const;
      const cfg = STANDINGS_LEAGUES.find(item => item.leagueApiId === leagueApiId);
      if (!cfg) return [leagueApiId, [] as Standing[]] as const;
      return [leagueApiId, await getStandings(cfg.apiId)] as const;
    }));
    if (requestId !== loadSeq.current) return baseMap;

    const updated = { ...baseMap };
    leagueRows.forEach(([leagueApiId, rows]) => {
      if (rows.length > 0) updated[leagueApiId] = rows;
    });
    setStandingsMap(updated);
    AsyncStorage.setItem(STANDINGS_CACHE_KEY, JSON.stringify({ cacheDate: dateStr, data: updated })).catch(() => {});
    return updated;
  }

  const metricsMap = useMemo(() => {
    const map = new Map<number, Metrics>();
    for (const m of matches) {
      const rows = standingsMap[m.leagueApiId];
      const home = findStanding(rows, m.home, m.homeTeamId);
      const away = findStanding(rows, m.away, m.awayTeamId);
      map.set(m.id, computeMetrics(home, away, rows, m.leagueApiId));
    }
    return map;
  }, [matches, standingsMap]);

  // Bugünün bildirimleri — metricsMap hazır olduktan sonra çalışır
  useEffect(() => {
    if (!isToday(selectedDate) || matches.length === 0) return;
    (async () => {
      const prefs = await loadNotifPrefs();
      const anyEnabled = prefs.daily || prefs.favTeam || prefs.featured;
      if (!anyEnabled) return;

      // Scout pick: en yüksek skora sahip bitmemiş maç
      const ranked = [...matches]
        .filter(m => !m.finished)
        .sort((a, b) => {
          const ma = metricsMap.get(a.id) ?? NO_DATA;
          const mb = metricsMap.get(b.id) ?? NO_DATA;
          return scoutScore(b, mb) - scoutScore(a, ma);
        });
      const top = ranked[0];

      // Takım adını normalize et (Türkçe karakter desteği)
      const norm = (s: string) => s.toLowerCase()
        .replace(/[çÇ]/g,'c').replace(/[şŞ]/g,'s').replace(/[ğĞ]/g,'g')
        .replace(/[üÜ]/g,'u').replace(/[öÖ]/g,'o').replace(/[ıİ]/g,'i');

      const findTeamMatch = (teamName: string) => matches.find(m => {
        if (m.finished) return false;
        const n = norm(teamName);
        const h = norm(m.home), a = norm(m.away);
        return h.includes(n) || a.includes(n) || n.includes(h) || n.includes(a);
      });

      // Favori + watchlist takımlarının bugünkü maçları
      const watchedMatches: { home: string; away: string; time: string; date?: string }[] = [];
      if (prefs.favTeam) {
        const favRaw = await AsyncStorage.getItem('scout_fav_team');
        if (favRaw) {
          const fav = JSON.parse(favRaw);
          const m = findTeamMatch(fav.name);
          if (m) watchedMatches.push({ home: m.home, away: m.away, time: m.time, date: m.date });
        }
        const watchRaw = await AsyncStorage.getItem('scout_watchlist');
        if (watchRaw) {
          const watchlist: { name: string }[] = JSON.parse(watchRaw);
          for (const team of watchlist) {
            const m = findTeamMatch(team.name);
            if (m && !watchedMatches.some(w => w.home === m.home && w.away === m.away)) {
              watchedMatches.push({ home: m.home, away: m.away, time: m.time, date: m.date });
            }
          }
        }
      }

      await scheduleNotifications({
        matchCount: matches.filter(m => !m.finished).length,
        scoutPick:  top ? { home: top.home, away: top.away } : undefined,
        watchedMatches,
      }, prefs);
    })();
  }, [matches, metricsMap, selectedDate]);

  const filteredMatches = useMemo(() => {
    if (activeFilter === 'Scout') return matches;
    const lig = LIG_FILTERS.find(f => f.label === activeFilter);
    return lig ? matches.filter(m => m.leagueApiId === lig.id) : matches;
  }, [matches, activeFilter]);

  const sortedMatches = useMemo(
    () => [...filteredMatches].sort((a, b) => {
      const ma = metricsMap.get(a.id) ?? NO_DATA;
      const mb = metricsMap.get(b.id) ?? NO_DATA;
      return scoutScore(b, mb) - scoutScore(a, ma);
    }),
    [filteredMatches, metricsMap]
  );

  const featuredMatches = useMemo(() => {
    if (activeFilter !== 'Scout' || sortedMatches.length === 0) return sortedMatches;
    const backendFeatured = sortedMatches.find(m => m.id === backendFeaturedMatchId);
    if (backendFeatured) return [backendFeatured, ...sortedMatches.filter(m => m.id !== backendFeatured.id)];
    const dateKey = formatDateParam(selectedDate);
    const cacheKey = `${dateKey}:Scout`;
    const cachedId = featuredMatchCache[cacheKey];
    const cached = sortedMatches.find(m => m.id === cachedId);
    if (!cached) return sortedMatches;
    return [cached, ...sortedMatches.filter(m => m.id !== cached.id)];
  }, [activeFilter, sortedMatches, backendFeaturedMatchId, selectedDate, featuredMatchCache]);

  useEffect(() => {
    if (activeFilter !== 'Scout' || sortedMatches.length === 0) return;
    if (backendFeaturedMatchId && sortedMatches.some(m => m.id === backendFeaturedMatchId)) return;
    const dateKey = formatDateParam(selectedDate);
    const cacheKey = `${dateKey}:Scout`;
    if (featuredMatchCache[cacheKey]) return;
    const nextCache = { ...featuredMatchCache, [cacheKey]: sortedMatches[0].id };
    setFeaturedMatchCache(nextCache);
    AsyncStorage.setItem(FEATURED_MATCH_CACHE_KEY, JSON.stringify(nextCache)).catch(() => {});
  }, [activeFilter, sortedMatches, backendFeaturedMatchId, selectedDate, featuredMatchCache]);

  const listItems = useMemo<ListItem[]>(() => {
    const scoutMode = activeFilter === 'Scout' && featuredMatches.length > 0;
    const items: ListItem[] = [];
    if (activeFilter === 'Scout' && homeDataNotice) {
      items.push({ key: `notice-${homeDataNotice}`, type: 'notice', notice: homeDataNotice, warningText: homeDataWarningText });
    }

    if (scoutMode) {
      const hero = featuredMatches[0];
      const highlights = featuredMatches.slice(1, 4);
      const shownIds = new Set([hero?.id, ...highlights.map(m => m.id)]);
      const upcoming = featuredMatches.filter(m => !m.finished);
      const finished = featuredMatches.filter(m => m.finished && !shownIds.has(m.id));
      const summary = buildDaySummary(Array.from(metricsMap.values()));

      items.push({ key: 'h-gunun-maci', type: 'section-header', title: 'GÜNÜN MAÇI' });
      items.push({ key: 'hero', type: 'hero', m: hero, metrics: metricsMap.get(hero.id) ?? NO_DATA });

      if (featuredMatches.length === 1) {
        const heroMetrics = metricsMap.get(hero.id) ?? NO_DATA;
        items.push({ key: 'single-insight', type: 'single-insight', m: hero, metrics: heroMetrics });
        items.push({ key: 'single-trends', type: 'single-trends', m: hero, metrics: heroMetrics });
        items.push({ key: 'single-h2h', type: 'single-h2h', h2h: singleH2H });
        if (nextDayPreview && nextDayPreview.m.id !== hero.id) {
          items.push({ key: 'tomorrow-featured', type: 'tomorrow-featured', m: nextDayPreview.m, metrics: nextDayPreview.metrics });
        }
        return items;
      }

      if (highlights.length > 0) {
        items.push({ key: 'h-highlights', type: 'section-header', title: 'GÜNÜN ÖNE ÇIKANLARI' });
        highlights.forEach((m, i) => {
          items.push({ key: `hl-${m.id}`, type: 'highlight', m, rank: i, metrics: metricsMap.get(m.id) ?? NO_DATA });
        });
      }

      items.push({ key: 'day-summary', type: 'day-summary', summary });

      if (finished.length > 0) {
        items.push({ key: 'h-finished', type: 'section-header', title: 'TAMAMLANAN MAÇLAR' });
        finished.forEach(m => {
          items.push({ key: `fin-${m.id}`, type: 'match', m, metrics: metricsMap.get(m.id) ?? NO_DATA });
        });
      }

      items.push({ key: 'h-upcoming', type: 'section-header', title: 'GÜNÜN KALAN MAÇLARI', sub: 'Scout skoruna göre sıralandı' });
      upcoming.forEach(m => {
        items.push({ key: `up-${m.id}`, type: 'match', m, metrics: metricsMap.get(m.id) ?? NO_DATA });
      });
    } else {
      if (sortedMatches.length === 0) {
        items.push({ key: 'empty', type: activeFilter === 'Scout' ? 'empty-scout' : 'empty', filter: activeFilter });
      } else {
        const title = activeFilter !== 'Scout'
          ? `${activeFilter.toUpperCase()} MAÇLARI`
          : `${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]} MAÇLARI`;
        items.push({ key: 'h-list', type: 'section-header', title });
        sortedMatches.forEach(m => {
          items.push({ key: `m-${m.id}`, type: 'match', m, metrics: metricsMap.get(m.id) ?? NO_DATA });
        });
      }
    }

    return items;
  }, [featuredMatches, sortedMatches, metricsMap, activeFilter, selectedDate, nextDayPreview, singleH2H, homeDataNotice, homeDataWarningText]);

  function goToMatch(m: Match, metrics?: Metrics) {
    const metricParams = {
      homePos: metrics?.homePos != null ? String(metrics.homePos) : '',
      awayPos: metrics?.awayPos != null ? String(metrics.awayPos) : '',
      homePts: metrics?.homePts != null ? String(metrics.homePts) : '',
      awayPts: metrics?.awayPts != null ? String(metrics.awayPts) : '',
      homePlayed: metrics?.homePlayed != null ? String(metrics.homePlayed) : '',
      awayPlayed: metrics?.awayPlayed != null ? String(metrics.awayPlayed) : '',
      leaderPts: metrics?.leaderPts != null ? String(metrics.leaderPts) : '',
      totalTeams: metrics?.totalTeams != null ? String(metrics.totalTeams) : '',
      homeAbovePts: metrics?.homeAbovePts != null ? String(metrics.homeAbovePts) : '',
      homeBelowPts: metrics?.homeBelowPts != null ? String(metrics.homeBelowPts) : '',
      awayAbovePts: metrics?.awayAbovePts != null ? String(metrics.awayAbovePts) : '',
      awayBelowPts: metrics?.awayBelowPts != null ? String(metrics.awayBelowPts) : '',
      safetyPts: metrics?.safetyPts != null ? String(metrics.safetyPts) : '',
      leagueAvg: metrics?.leagueAvg != null ? String(metrics.leagueAvg) : '',
    };
    if (m.leagueApiId === 203) {
      const slMatchHref: Href = {
        pathname: '/sl_match_detail',
        params: {
          eventId: String(m.id),
          league: m.league,
          leagueApiId: String(m.leagueApiId),
          home: m.home, away: m.away,
          homeTeamId: String(m.homeTeamId),
          awayTeamId: String(m.awayTeamId),
          time: m.time, score: m.score || '', finished: m.finished ? '1' : '0',
          ...metricParams,
        },
      };
      router.push(slMatchHref);
      return;
    }
    router.push({
      pathname: '/match_detail',
      params: {
        id: m.id, home: m.home, away: m.away, league: m.league,
        leagueApiId: m.leagueApiId, city: m.city, utcDate: m.utcDate,
        homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
        live: '0', score: m.score || '', finished: m.finished ? '1' : '0',
        ...metricParams,
      },
    });
  }

  function goToNextPreviewDate() {
    if (!nextDayPreview) {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + 1);
      setSelectedDate(next);
      return;
    }
    const nextDate = new Date(nextDayPreview.m.utcDate);
    setSelectedDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()));
  }

  function renderListItem({ item }: { item: ListItem }) {
    switch (item.type) {
      case 'notice':
        return <DataNoticeCard type={item.notice || 'error'} message={item.warningText} />;
      case 'section-header':
        return (
          <View style={sc.sectionHeader}>
            <Text style={[sc.sectionTitle, { color: c.textMuted }]}>{item.title}</Text>
            {item.sub && <Text style={[sc.sectionSub, { color: c.textFaint }]}>{item.sub}</Text>}
          </View>
        );
      case 'hero':
        return (
          <View style={{ paddingHorizontal: 14, marginBottom: 4 }}>
            <HeroCard m={item.m!} metrics={item.metrics!} onPress={() => goToMatch(item.m!, item.metrics)} />
          </View>
        );
      case 'highlight':
        return <HighlightCard m={item.m!} rank={item.rank!} metrics={item.metrics!} onPress={() => goToMatch(item.m!, item.metrics)} />;
      case 'day-summary':
        return <DaySummaryCard summary={item.summary!} />;
      case 'match':
        return <MatchRow m={item.m!} metrics={item.metrics!} onPress={() => goToMatch(item.m!, item.metrics)} />;
      case 'single-insight':
        return <SingleInsightCard m={item.m!} metrics={item.metrics!} />;
      case 'single-trends':
        return <SingleTrendsCard m={item.m!} metrics={item.metrics!} />;
      case 'single-h2h':
        return <SingleH2HCard h2h={item.h2h || []} />;
      case 'tomorrow-featured':
        return <TomorrowFeaturedCard m={item.m!} metrics={item.metrics!} onPress={() => goToMatch(item.m!, item.metrics)} />;
      case 'empty-scout':
        return (
          <EmptyScoutState
            selectedDate={selectedDate}
            preview={nextDayPreview}
            onNextDate={goToNextPreviewDate}
            onRefresh={() => loadMatches(selectedDate)}
            onOpenLeagues={() => router.push('/leagues')}
            onOpenStats={() => router.push('/stats')}
            onOpenMatch={() => nextDayPreview && goToMatch(nextDayPreview.m, nextDayPreview.metrics)}
          />
        );
      case 'empty':
        return <Text style={[styles.emptyText, { color: c.textMuted }]}>{matchListEmptyMessage(item.filter!)}</Text>;
      default:
        return null;
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.topbar, { backgroundColor: c.surface }]}>
        <View style={styles.headerBrand}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        </View>
        <TouchableOpacity onPress={() => loadMatches(selectedDate)} disabled={refreshing}>
          <View style={styles.refreshContent}>
            {refreshing && <ActivityIndicator size="small" color={c.primary} />}
            <Text style={[styles.refreshBtn, { color: c.primary }]}>
              {refreshing ? 'Güncelleniyor' : '↻ Güncelle'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Tarih şeridi */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.dateRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8 }}>
        {dateList.map((date, i) => {
          const isSelected  = date.toDateString() === selectedDate.toDateString();
          const isTodayDate = isToday(date);
          return (
            <TouchableOpacity key={i}
              style={[styles.datePill, { borderColor: c.border }, isSelected && styles.datePillActive]}
              onPress={() => setSelectedDate(date)}>
              <Text style={[styles.dateDayName, { color: c.textMuted }, isSelected && styles.dateDayNameActive]}>
                {isTodayDate ? 'Bugün' : DAYS[date.getDay()]}
              </Text>
              <Text style={[styles.dateNum, { color: c.text }, isSelected && styles.dateNumActive]}>{date.getDate()}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Filtre şeridi */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.filterRow, { backgroundColor: c.surface, borderBottomColor: c.borderLight }]}
        contentContainerStyle={{ paddingHorizontal: 14, alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          style={[styles.scoutPill, { borderColor: c.primary }, activeFilter === 'Scout' && styles.scoutPillActive]}
          onPress={() => setActiveFilter('Scout')}>
          <Text style={[styles.scoutPillText, { color: c.primary }, activeFilter === 'Scout' && styles.scoutPillTextActive]}>
            🔍 Scout
          </Text>
        </TouchableOpacity>
        {LIG_FILTERS.map(f => (
          <TouchableOpacity key={f.id}
            style={[styles.filterPill, { borderColor: c.border }, activeFilter === f.label && styles.filterPillActive]}
            onPress={() => setActiveFilter(f.label)}>
            <Text style={[styles.filterText, { color: c.textMuted }, activeFilter === f.label && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {refreshing && !loading && (
        <View style={[styles.updateBar, { backgroundColor: c.surface, borderBottomColor: c.borderLight }]}>
          <ActivityIndicator size="small" color={c.primary} />
          <Text style={[styles.updateText, { color: c.textSub }]}>Veriler yenileniyor...</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <FlatList
          style={styles.scroll}
          data={listItems}
          keyExtractor={item => item.key}
          renderItem={renderListItem}
          contentContainerStyle={{ paddingBottom: 116 }}
          removeClippedSubviews
        />
      )}

      <View style={[styles.tabBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <TouchableOpacity style={styles.tab}>
          <Ionicons name="football" size={22} color={c.primary} />
          <Text style={[styles.tabText, styles.tabActive, { color: c.primary }]}>Maçlar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/leagues')}>
          <Ionicons name="trophy-outline" size={22} color={c.textMuted} />
          <Text style={[styles.tabText, { color: c.textMuted }]}>Ligler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/stats')}>
          <Ionicons name="stats-chart-outline" size={22} color={c.textMuted} />
          <Text style={[styles.tabText, { color: c.textMuted }]}>İstatistik</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/profile')}>
          <Ionicons name="person-outline" size={22} color={c.textMuted} />
          <Text style={[styles.tabText, { color: c.textMuted }]}>Profil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F8F9FB' },
  topbar:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8, backgroundColor: '#fff' },
  headerBrand:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo:         { width: 42, height: 42, resizeMode: 'contain' },
  appName:            { fontSize: 16, fontWeight: '600', color: '#00BAFF' },
  appNameBlue:        { color: '#2563EB' },
  refreshContent:     { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshBtn:         { fontSize: 13, color: '#185FA5' },
  dateRow:            { borderBottomWidth: 0.5, borderBottomColor: '#eee', flexGrow: 0, backgroundColor: '#fff' },
  datePill:           { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, marginRight: 6, borderRadius: 10, borderWidth: 0.5, borderColor: '#eee', minWidth: 52 },
  datePillActive:     { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  dateDayName:        { fontSize: 11, color: '#888', marginBottom: 4 },
  dateDayNameActive:  { color: '#fff' },
  dateNum:            { fontSize: 18, fontWeight: '500', color: '#111' },
  dateNumActive:      { color: '#fff' },
  filterRow:          { maxHeight: 46, flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  filterPill:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, borderColor: '#ccc' },
  filterPillActive:   { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  filterText:         { fontSize: 13, color: '#666' },
  filterTextActive:   { color: '#fff', fontWeight: '500' },
  scoutPill:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#185FA5' },
  scoutPillActive:    { backgroundColor: '#0C447C', borderColor: '#0C447C' },
  scoutPillText:      { fontSize: 13, color: '#185FA5', fontWeight: '700' },
  scoutPillTextActive:{ color: '#fff' },
  scroll:             { flex: 1 },
  updateBar:          { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderBottomWidth: 0.5 },
  updateText:         { fontSize: 12, fontWeight: '500' },
  loadingArea:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 116 },
  emptyText:          { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 13 },
  tabBar:             { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#eee', paddingBottom: 20, backgroundColor: '#fff' },
  tab:                { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabText:            { fontSize: 12, color: '#888' },
  tabActive:          { color: '#185FA5', fontWeight: '500' },
});

const sc = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 },
  sectionTitle:  { fontSize: 11, color: '#888', fontWeight: '700', letterSpacing: 0.6 },
  sectionSub:    { fontSize: 10, color: '#bbb' },

  heroCard:      { backgroundColor: '#0C447C', borderRadius: 16, padding: 16 },
  heroTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heroFireLabel: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.4 },
  heroLeague:    { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  heroTeamRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  heroTeam:      { flex: 1, fontSize: 15, fontWeight: '700', color: '#fff' },
  heroCenter:    { alignItems: 'center', paddingHorizontal: 10 },
  heroSubLabel:  { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
  heroTime:      { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroScore:     { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroMetricRow:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 4 },
  heroMetricPrimary: { fontSize: 13, fontWeight: '700', color: '#fff' },
  heroMetricDot:     { fontSize: 13, color: 'rgba(255,255,255,0.5)', paddingHorizontal: 6 },
  heroSummary:       { fontSize: 12, color: 'rgba(255,255,255,0.82)', lineHeight: 17, marginTop: 10 },

  singlePanel:    { marginHorizontal: 14, marginTop: 8, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  singlePanelLeft:{ flex: 1, minWidth: 0 },
  singleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  singleTitle:    { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  singleText:     { fontSize: 13, lineHeight: 20, marginTop: 10 },
  singleMetrics:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  miniMetric:     { flex: 1, minHeight: 58, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 7 },
  miniMetricLabel:{ fontSize: 10, marginTop: 5, textAlign: 'center' },
  miniMetricValue:{ fontSize: 13, fontWeight: '800', marginTop: 4, textAlign: 'center' },

  trendPanel:     { marginHorizontal: 14, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  progressRow:    { marginTop: 12 },
  progressTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  progressLabel:  { fontSize: 12 },
  progressValue:  { fontSize: 12, fontWeight: '800' },
  progressTrack:  { height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill:   { height: 6, borderRadius: 999 },
  trendFoot:      { fontSize: 11, marginTop: 12 },

  h2hPanel:       { marginHorizontal: 14, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  h2hEmpty:       { fontSize: 12, lineHeight: 18, marginTop: 10 },
  h2hMiniRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 0.5, paddingTop: 10, marginTop: 10, gap: 10 },
  h2hMiniTeams:   { flex: 1, minWidth: 0 },
  h2hMiniDate:    { fontSize: 10, marginBottom: 3 },
  h2hMiniText:    { fontSize: 12, fontWeight: '600' },
  h2hMiniScore:   { fontSize: 14, fontWeight: '800' },

  tomorrowCard:   { marginHorizontal: 14, marginBottom: 10, padding: 14, borderRadius: 12, borderWidth: 1 },

  emptyScoutWrap: { paddingTop: 34, paddingBottom: 14 },
  emptyHero:      { alignItems: 'center', paddingHorizontal: 24, marginBottom: 20 },
  emptyHeroTitle: { fontSize: 19, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  emptyHeroText:  { fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
  emptyHeroActions:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  emptyPrimaryBtn:{ minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyPrimaryText:{ fontSize: 13, fontWeight: '800' },
  emptyIconBtn:   { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  noticeCard:     { marginHorizontal: 14, marginTop: 12, marginBottom: 2, borderRadius: 10, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeText:     { flex: 1, fontSize: 12, lineHeight: 17 },
  emptyAction:    { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyActionIcon:{ width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyActionText:{ flex: 1, minWidth: 0 },
  emptyActionTitle:{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 5 },
  emptyActionBody:{ fontSize: 13, lineHeight: 18 },
  emptyNote:      { marginHorizontal: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1, padding: 14 },
  emptyNoteText:  { fontSize: 13, lineHeight: 19, marginTop: 9 },

  hlCard:        { marginHorizontal: 14, marginBottom: 8, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E4EEF8', borderLeftWidth: 3 },
  hlTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  hlRank:        { fontSize: 11, fontWeight: '700' },
  hlLeague:      { fontSize: 11, color: '#aaa' },
  hlTeams:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  hlTeam:        { flex: 1, fontSize: 14, fontWeight: '600', color: '#111' },
  hlTime:        { fontSize: 14, fontWeight: '700', color: '#333', paddingHorizontal: 8 },
  hlMetric:      { fontSize: 13, fontWeight: '600', color: '#0C447C', marginBottom: 4 },
  hlSummary:     { fontSize: 12, color: '#555', lineHeight: 17, marginTop: 2 },

  daySummary:      { marginHorizontal: 14, marginTop: 4, marginBottom: 4, padding: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E4EEF8' },
  daySummaryTitle: { fontSize: 11, color: '#185FA5', fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  daySummaryText:  { fontSize: 13, color: '#333', lineHeight: 19 },

  matchCard:     { marginHorizontal: 14, marginBottom: 8, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#EBEBEB', elevation: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  matchTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  matchLeague:   { fontSize: 11, color: '#185FA5', fontWeight: '600' },
  matchTime:     { fontSize: 12, color: '#444', fontWeight: '600' },
  scoreRow:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scoreText:     { fontSize: 13, fontWeight: '700', color: '#111' },
  scoreMs:       { fontSize: 10, color: '#aaa' },
  matchTeams:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  matchTeam:     { flex: 1, fontSize: 14, fontWeight: '600', color: '#111' },
  matchSep:      { paddingHorizontal: 8, color: '#ccc', fontSize: 14 },
  matchMetricLine:      { fontSize: 12, color: '#0C447C', marginTop: 4 },
  matchMetricLineMuted: { fontSize: 11, color: '#aaa', marginTop: 4, fontStyle: 'italic' },
});
