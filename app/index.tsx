import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Image, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  getCityForTeam, getStandings, getSuperLigMatches, getSuperLigStandings,
  getTodayMatches, Standing,
} from '../services/api';
import { loadNotifPrefs, scheduleNotifications } from '../services/notifications';
import { matchListEmptyMessage } from '../utils/emptyStates';

// ─── constants ───────────────────────────────────────────────────────────────

const STANDINGS_CACHE_KEY = 'scout_standings_cache_v2';

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

// ─── types ───────────────────────────────────────────────────────────────────

type Match = {
  id: number; leagueApiId: number; league: string;
  home: string; away: string; time: string;
  score: string | null; finished: boolean;
  city: string; utcDate: string;
  homeTeamId: number; awayTeamId: number;
};

type Metrics = {
  hasData: boolean;
  expectedGoals: number;   // toplam beklenen gol (xG proxy)
  homePpg: number;         // puan / maç
  awayPpg: number;
  diff: number;            // homePpg - awayPpg
  favorite: 'home' | 'away' | 'balanced';
  confidence: 'low' | 'medium' | 'high';
  tempo: number;           // toplam gol ortalaması (iki takım birleşik)
  homePos?: number;        // lig sırası (prestij bonusu için)
  awayPos?: number;
  reason?: string;         // hasData=false ise neden
  summary: string;         // kart altındaki açıklama cümlesi
};

// ─── metrics engine ──────────────────────────────────────────────────────────

function normalizeTeam(name: string): string {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİ]/g, 'i')
    .replace(/\s+/g, ' ').trim();
}

function findStanding(standings: Standing[] | undefined, teamName: string, teamId: number): Standing | null {
  if (!standings || standings.length === 0) return null;
  if (teamId > 0) {
    const byId = standings.find(s => s.teamId === teamId);
    if (byId) return byId;
  }
  const target = normalizeTeam(teamName);
  if (!target) return null;
  const exact = standings.find(s => normalizeTeam(s.team) === target);
  if (exact) return exact;
  return standings.find(s => {
    const norm = normalizeTeam(s.team);
    return norm.includes(target) || target.includes(norm);
  }) || null;
}

function hasUsableStandingsMap(map: Record<number, Standing[]> | null): map is Record<number, Standing[]> {
  if (!map) return false;
  if (Array.isArray(map[203]) && map[203].length > 0) return true;
  return STANDINGS_LEAGUES.some(({ leagueApiId }) => Array.isArray(map[leagueApiId]) && map[leagueApiId].length > 0);
}

const NO_DATA: Metrics = {
  hasData: false, expectedGoals: 0,
  homePpg: 0, awayPpg: 0, diff: 0, favorite: 'balanced',
  confidence: 'low', tempo: 0,
  reason: 'Sezon verisi bulunamadı',
  summary: 'Analiz için sezon verisi henüz mevcut değil.',
};

function computeMetrics(home: Standing | null, away: Standing | null): Metrics {
  if (!home || !away) return { ...NO_DATA, reason: 'Takım tablo satırı eşleşmedi' };
  if (home.played < MIN_PLAYED || away.played < MIN_PLAYED) {
    return {
      ...NO_DATA,
      reason: 'Erken sezon — yeterli veri yok',
      summary: 'Sezon erken; takım ortalamaları henüz güvenilir değil.',
    };
  }

  const homeAtk = home.gf / home.played;
  const homeDef = home.ga / home.played;
  const awayAtk = away.gf / away.played;
  const awayDef = away.ga / away.played;

  const expectedGoals = (homeAtk + awayDef) / 2 + (awayAtk + homeDef) / 2;

  const homePpg = home.pts / home.played;
  const awayPpg = away.pts / away.played;
  const diff = homePpg - awayPpg;
  const absDiff = Math.abs(diff);

  const favorite: Metrics['favorite'] = diff > 0.3 ? 'home' : diff < -0.3 ? 'away' : 'balanced';
  const confidence: Metrics['confidence'] = absDiff > 1.0 ? 'high' : absDiff > 0.5 ? 'medium' : 'low';
  const tempo = (home.gf + home.ga + away.gf + away.ga) / (home.played + away.played);

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    hasData: true,
    expectedGoals: round1(expectedGoals),
    homePpg: round1(homePpg),
    awayPpg: round1(awayPpg),
    diff: round1(diff),
    favorite, confidence,
    tempo: round1(tempo),
    homePos: home.pos,
    awayPos: away.pos,
    summary: buildMatchSummary({ expectedGoals, favorite, confidence, tempo, homePpg, awayPpg }),
  };
}

function buildMatchSummary(m: {
  expectedGoals: number; favorite: 'home' | 'away' | 'balanced';
  confidence: 'low' | 'medium' | 'high'; tempo: number; homePpg: number; awayPpg: number;
}): string {
  const bits: string[] = [];
  if (m.expectedGoals >= 3.2)      bits.push('gol beklentisi yüksek');
  else if (m.expectedGoals >= 2.5) bits.push('orta düzey gol beklentisi');
  else if (m.expectedGoals < 2.0)  bits.push('az gollü bir akış bekleniyor');

  if (m.confidence === 'high') bits.push('belirgin bir favori var');
  else if (m.favorite === 'balanced' && m.homePpg >= 1.8 && m.awayPpg >= 1.8)
    bits.push('iki güçlü ekip dengeli profilde');
  else if (m.favorite === 'balanced')
    bits.push('iki takım dengeli profilde');

  if (m.tempo >= 3.0) bits.push('tempolu bir maç profili');

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
  const [loading, setLoading]           = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateList          = getDateList();
  const initialFocusDone  = useRef(false);

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

  async function loadMatches(date: Date, silent = false) {
    if (!silent) setLoading(true);
    try {
      const dateStr = formatDateParam(date);
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
          // Cache var: sadece maçları çek, standings sabit
          const [data, slData] = await Promise.all([
            getTodayMatches(dateStr), getSuperLigMatches(dateStr),
          ]);
          setStandingsMap(map);
          const mainMatches = data
            .filter((m: any) => SUPPORTED_LEAGUES.includes(m.competition?.id))
            .map(mapMatch);
          setMatches([...mainMatches, ...slData.map(mapSLMatch)]);
        } else {
          // İlk yükleme: maç + standings birlikte çek, cache'e kaydet
          const [data, slData, fdResults, slStandings] = await Promise.all([
            getTodayMatches(dateStr),
            getSuperLigMatches(dateStr),
            Promise.all(STANDINGS_LEAGUES.map(({ apiId }) => getStandings(apiId))),
            getSuperLigStandings(),
          ]);
          map = {};
          STANDINGS_LEAGUES.forEach((x, i) => { map![x.leagueApiId] = fdResults[i] || []; });
          map[203] = slStandings || [];
          AsyncStorage.setItem(STANDINGS_CACHE_KEY, JSON.stringify({ cacheDate: dateStr, data: map })).catch(() => {});
          setStandingsMap(map);
          const mainMatches = data
            .filter((m: any) => SUPPORTED_LEAGUES.includes(m.competition?.id))
            .map(mapMatch);
          setMatches([...mainMatches, ...slData.map(mapSLMatch)]);
        }
      } else {
        // Güncelle / sessiz yenileme: sadece maç skorları güncellenir, standings sabit kalır
        const [data, slData] = await Promise.all([
          getTodayMatches(dateStr), getSuperLigMatches(dateStr),
        ]);
        const mainMatches = data
          .filter((m: any) => SUPPORTED_LEAGUES.includes(m.competition?.id))
          .map(mapMatch);
        setMatches([...mainMatches, ...slData.map(mapSLMatch)]);
      }
    } catch (e) {
      console.log('loadMatches hata:', e);
    }
    setLoading(false);
  }

  const metricsMap = useMemo(() => {
    const map = new Map<number, Metrics>();
    for (const m of matches) {
      const rows = standingsMap[m.leagueApiId];
      const home = findStanding(rows, m.home, m.homeTeamId);
      const away = findStanding(rows, m.away, m.awayTeamId);
      map.set(m.id, computeMetrics(home, away));
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
      const watchedMatches: { home: string; away: string; time: string }[] = [];
      if (prefs.favTeam) {
        const favRaw = await AsyncStorage.getItem('scout_fav_team');
        if (favRaw) {
          const fav = JSON.parse(favRaw);
          const m = findTeamMatch(fav.name);
          if (m) watchedMatches.push({ home: m.home, away: m.away, time: m.time });
        }
        const watchRaw = await AsyncStorage.getItem('scout_watchlist');
        if (watchRaw) {
          const watchlist: { name: string }[] = JSON.parse(watchRaw);
          for (const team of watchlist) {
            const m = findTeamMatch(team.name);
            if (m && !watchedMatches.some(w => w.home === m.home && w.away === m.away)) {
              watchedMatches.push({ home: m.home, away: m.away, time: m.time });
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

  const isScoutMode = activeFilter === 'Scout' && isToday(selectedDate) && sortedMatches.length > 0;

  const hero       = isScoutMode ? sortedMatches[0] : null;
  const highlights = isScoutMode ? sortedMatches.slice(1, 4) : [];
  const daySummary = isScoutMode ? buildDaySummary(Array.from(metricsMap.values())) : '';
  const shownIds   = isScoutMode ? new Set([hero?.id, ...highlights.map(m => m.id)]) : new Set<string|number>();
  const upcomingMatches = isScoutMode ? sortedMatches.filter(m => !m.finished) : [];
  const finishedMatches = isScoutMode ? sortedMatches.filter(m => m.finished && !shownIds.has(m.id)) : [];

  function goToMatch(m: Match) {
    if (m.leagueApiId === 203) {
      router.push({
        pathname: '/sl_match_detail' as any,
        params: {
          eventId: String(m.id),
          home: m.home, away: m.away,
          homeTeamId: String(m.homeTeamId),
          awayTeamId: String(m.awayTeamId),
          time: m.time, score: m.score || '',
        },
      });
      return;
    }
    router.push({
      pathname: '/match_detail',
      params: {
        id: m.id, home: m.home, away: m.away, league: m.league,
        leagueApiId: m.leagueApiId, city: m.city, utcDate: m.utcDate,
        homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
        live: '0', score: m.score || '', finished: m.finished ? '1' : '0',
      },
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.topbar, { backgroundColor: c.surface }]}>
        <View style={styles.headerBrand}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        </View>
        <TouchableOpacity onPress={() => loadMatches(selectedDate)}>
          <Text style={[styles.refreshBtn, { color: c.primary }]}>↻ Güncelle</Text>
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

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>

          {/* ── SCOUT MODU ── */}
          {isScoutMode && hero && (() => {
            const heroM = metricsMap.get(hero.id) ?? NO_DATA;
            return (
              <>
                {/* 1. Hero */}
                <View style={sc.sectionHeader}>
                  <Text style={[sc.sectionTitle, { color: c.textMuted }]}>GÜNÜN MAÇI</Text>
                </View>
                <View style={{ paddingHorizontal: 14, marginBottom: 4 }}>
                  <HeroCard m={hero} metrics={heroM} onPress={() => goToMatch(hero)} />
                </View>

                {/* 2. Günün Öne Çıkanları */}
                {highlights.length > 0 && (
                  <>
                    <View style={sc.sectionHeader}>
                      <Text style={[sc.sectionTitle, { color: c.textMuted }]}>GÜNÜN ÖNE ÇIKANLARI</Text>
                    </View>
                    {highlights.map((m, i) => {
                      const mm = metricsMap.get(m.id) ?? NO_DATA;
                      return <HighlightCard key={m.id} m={m} rank={i} metrics={mm} onPress={() => goToMatch(m)} />;
                    })}
                  </>
                )}

                {/* 3. Bugün Ne Bekleniyor? */}
                <DaySummaryCard summary={daySummary} />

                {/* 4. Tamamlanan Maçlar */}
                {finishedMatches.length > 0 && (
                  <>
                    <View style={sc.sectionHeader}>
                      <Text style={[sc.sectionTitle, { color: c.textMuted }]}>TAMAMLANAN MAÇLAR</Text>
                    </View>
                    {finishedMatches.map(m => {
                      const mm = metricsMap.get(m.id) ?? NO_DATA;
                      return <MatchRow key={m.id} m={m} metrics={mm} onPress={() => goToMatch(m)} />;
                    })}
                  </>
                )}

                {/* 5. Yaklaşan Maçlar */}
                <View style={sc.sectionHeader}>
                  <Text style={[sc.sectionTitle, { color: c.textMuted }]}>GÜNÜN KALAN MAÇLARI</Text>
                  <Text style={[sc.sectionSub, { color: c.textFaint }]}>Scout skoruna göre sıralandı</Text>
                </View>
                {upcomingMatches.map(m => {
                  const mm = metricsMap.get(m.id) ?? NO_DATA;
                  return <MatchRow key={m.id} m={m} metrics={mm} onPress={() => goToMatch(m)} />;
                })}
              </>
            );
          })()}

          {/* ── LİG FİLTRESİ / BAŞKA GÜN ── */}
          {!isScoutMode && (
            sortedMatches.length === 0 ? (
              <Text style={[styles.emptyText, { color: c.textMuted }]}>
                {matchListEmptyMessage(activeFilter)}
              </Text>
            ) : (
              <>
                <View style={sc.sectionHeader}>
                  <Text style={[sc.sectionTitle, { color: c.textMuted }]}>
                    {activeFilter !== 'Scout'
                      ? `${activeFilter.toUpperCase()} MAÇLARI`
                      : `${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]} MAÇLARI`}
                  </Text>
                </View>
                {sortedMatches.map(m => {
                  const mm = metricsMap.get(m.id) ?? NO_DATA;
                  return <MatchRow key={m.id} m={m} metrics={mm} onPress={() => goToMatch(m)} />;
                })}
              </>
            )
          )}

        </ScrollView>
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
  emptyText:          { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 13 },
  tabBar:             { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#eee', paddingBottom: 20, backgroundColor: '#fff' },
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
