import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import {
  getCityForTeam, getStandings, getSuperLigMatches, getSuperLigStandings,
  getTodayMatches, Standing,
} from '../services/api';

// ─── constants ───────────────────────────────────────────────────────────────

const SUPPORTED_LEAGUES = [2021, 2014, 2002, 2019, 2015, 2001];

const LEAGUE_NAMES: Record<number, string> = {
  2021: 'Premier Lig', 2014: 'La Liga', 2002: 'Bundesliga',
  2019: 'Serie A', 2015: 'Ligue 1', 2001: 'UCL', 203: 'Süper Lig',
};

const LEAGUE_WEIGHT: Record<number, number> = {
  2001: 10, 2021: 9, 2014: 8, 2002: 7, 2019: 7, 2015: 6, 203: 5,
};

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

function formatDateParam(date: Date) { return date.toISOString().split('T')[0]; }

function formatTime(utcDate: string) {
  const d = new Date(utcDate);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
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
  let s = LEAGUE_WEIGHT[m.leagueApiId] ?? 4;
  const mins = timeToMins(m.time);
  if (mins >= 20 * 60)      s += 2;
  else if (mins >= 18 * 60) s += 1;
  if (!m.finished) s += 1;

  if (metrics.hasData) {
    if (metrics.expectedGoals > 3.0)                                          s += 2;
    else if (metrics.expectedGoals > 2.5)                                     s += 1;
    if (metrics.favorite === 'balanced' && metrics.homePpg >= 1.8 && metrics.awayPpg >= 1.8) s += 2;
    if (metrics.confidence === 'high' && metrics.tempo < 2.3)                 s -= 1;
  }
  return s;
}

// ─── data mapping ────────────────────────────────────────────────────────────

function mapSLMatch(m: any): Match {
  const hasScore   = m.homeScore !== null && m.homeScore !== undefined;
  const isFinished = m.status === 'Match Finished' || hasScore;
  return {
    id:          parseInt(m.id) || strHash(m.home + m.away + m.date),
    leagueApiId: 203,
    league:      'Süper Lig',
    home:        m.home,
    away:        m.away,
    time:        m.time ? m.time.substring(0, 5) : '?',
    score:       hasScore ? `${m.homeScore} - ${m.awayScore}` : null,
    finished:    isFinished,
    city:        getCityForTeam(m.home),
    utcDate:     `${m.date}T${m.time || '00:00:00'}`,
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
  const label = rank === 0 ? '⭐ Öne Çıkan' : rank === 1 ? '🎯 İzlenecek' : '📌 Dikkat';
  const borderColor = rank === 0 ? '#185FA5' : rank === 1 ? '#E6A817' : '#aaa';
  return (
    <TouchableOpacity style={[sc.hlCard, { borderLeftColor: borderColor }]} onPress={onPress} activeOpacity={0.85}>
      <View style={sc.hlTop}>
        <Text style={[sc.hlRank, { color: borderColor }]}>{label}</Text>
        <Text style={sc.hlLeague}>{m.league}</Text>
      </View>
      <View style={sc.hlTeams}>
        <Text style={sc.hlTeam} numberOfLines={1}>{m.home}</Text>
        <Text style={sc.hlTime}>{m.finished && m.score ? m.score : m.time}</Text>
        <Text style={[sc.hlTeam, { textAlign: 'right' }]} numberOfLines={1}>{m.away}</Text>
      </View>
      {metrics.hasData ? (
        <>
          <Text style={sc.hlMetric}>{expectedLine(metrics)} · {favoriteText(m, metrics)}</Text>
          <Text style={sc.hlSummary}>{metrics.summary}</Text>
        </>
      ) : (
        <Text style={sc.hlSummary}>{metrics.summary}</Text>
      )}
    </TouchableOpacity>
  );
}

function DaySummaryCard({ summary }: { summary: string }) {
  return (
    <View style={sc.daySummary}>
      <Text style={sc.daySummaryTitle}>📊 BUGÜN NE BEKLENİYOR?</Text>
      <Text style={sc.daySummaryText}>{summary}</Text>
    </View>
  );
}

function MatchRow({ m, metrics, onPress }: { m: Match; metrics: Metrics; onPress: () => void }) {
  return (
    <TouchableOpacity style={sc.matchCard} onPress={onPress} activeOpacity={0.8}>
      <View style={sc.matchTop}>
        <Text style={sc.matchLeague}>{m.league}</Text>
        {m.finished && m.score ? (
          <View style={sc.scoreRow}>
            <Text style={sc.scoreText}>{m.score}</Text>
            <Text style={sc.scoreMs}>MS</Text>
          </View>
        ) : (
          <Text style={sc.matchTime}>{m.time}</Text>
        )}
      </View>
      <View style={sc.matchTeams}>
        <Text style={sc.matchTeam} numberOfLines={1}>{m.home}</Text>
        <Text style={sc.matchSep}>—</Text>
        <Text style={[sc.matchTeam, { textAlign: 'right' }]} numberOfLines={1}>{m.away}</Text>
      </View>
      {metrics.hasData ? (
        <Text style={sc.matchMetricLine}>
          {expectedLine(metrics)} · {favoriteText(m, metrics)}
        </Text>
      ) : (
        <Text style={sc.matchMetricLineMuted}>{metrics.reason}</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<string>('Scout');
  const [matches, setMatches]           = useState<Match[]>([]);
  const [standingsMap, setStandingsMap] = useState<Record<number, Standing[]>>({});
  const [loading, setLoading]           = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateList          = getDateList();
  const initialFocusDone  = useRef(false);

  useEffect(() => { loadMatches(selectedDate); }, [selectedDate]);
  useEffect(() => { loadStandings(); }, []);

  useFocusEffect(
    useCallback(() => {
      if (!initialFocusDone.current) initialFocusDone.current = true;
      else loadMatches(selectedDate, true);
    }, [selectedDate])
  );

  async function loadStandings() {
    try {
      const [fdResults, slResult] = await Promise.all([
        Promise.all(STANDINGS_LEAGUES.map(({ apiId }) => getStandings(apiId))),
        getSuperLigStandings(),
      ]);
      const map: Record<number, Standing[]> = {};
      STANDINGS_LEAGUES.forEach((x, i) => { map[x.leagueApiId] = fdResults[i] || []; });
      map[203] = slResult || [];
      setStandingsMap(map);
    } catch (e) {
      console.log('loadStandings hata:', e);
    }
  }

  async function loadMatches(date: Date, silent = false) {
    if (!silent) setLoading(true);
    try {
      const dateStr = formatDateParam(date);
      const [data, slData] = await Promise.all([
        getTodayMatches(dateStr), getSuperLigMatches(dateStr),
      ]);
      const mainMatches = data
        .filter((m: any) => SUPPORTED_LEAGUES.includes(m.competition?.id))
        .map(mapMatch);
      setMatches([...mainMatches, ...slData.map(mapSLMatch)]);
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
  const daySummary = isScoutMode
    ? buildDaySummary(Array.from(metricsMap.values()))
    : '';

  function goToMatch(m: Match) {
    if (m.leagueApiId === 203) return;
    router.push({
      pathname: '/match_detail',
      params: {
        id: m.id, home: m.home, away: m.away, league: m.league,
        leagueApiId: m.leagueApiId, city: m.city, utcDate: m.utcDate,
        homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
        live: '0', score: m.score || '',
      },
    });
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topbar}>
        <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        <TouchableOpacity onPress={() => { loadMatches(selectedDate); loadStandings(); }}>
          <Text style={styles.refreshBtn}>↻ Güncelle</Text>
        </TouchableOpacity>
      </View>

      {/* Tarih şeridi */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRow}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8 }}>
        {dateList.map((date, i) => {
          const isSelected  = date.toDateString() === selectedDate.toDateString();
          const isTodayDate = isToday(date);
          return (
            <TouchableOpacity key={i}
              style={[styles.datePill, isSelected && styles.datePillActive]}
              onPress={() => setSelectedDate(date)}>
              <Text style={[styles.dateDayName, isSelected && styles.dateDayNameActive]}>
                {isTodayDate ? 'Bugün' : DAYS[date.getDay()]}
              </Text>
              <Text style={[styles.dateNum, isSelected && styles.dateNumActive]}>{date.getDate()}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Filtre şeridi */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: 14, alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          style={[styles.scoutPill, activeFilter === 'Scout' && styles.scoutPillActive]}
          onPress={() => setActiveFilter('Scout')}>
          <Text style={[styles.scoutPillText, activeFilter === 'Scout' && styles.scoutPillTextActive]}>
            🔍 Scout
          </Text>
        </TouchableOpacity>
        {LIG_FILTERS.map(f => (
          <TouchableOpacity key={f.id}
            style={[styles.filterPill, activeFilter === f.label && styles.filterPillActive]}
            onPress={() => setActiveFilter(f.label)}>
            <Text style={[styles.filterText, activeFilter === f.label && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#185FA5" />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>

          {/* ── SCOUT MODU ── */}
          {isScoutMode && hero && (() => {
            const heroM = metricsMap.get(hero.id) ?? NO_DATA;
            return (
              <>
                {/* 1. Hero */}
                <View style={sc.sectionHeader}>
                  <Text style={sc.sectionTitle}>GÜNÜN MAÇI</Text>
                </View>
                <View style={{ paddingHorizontal: 14, marginBottom: 4 }}>
                  <HeroCard m={hero} metrics={heroM} onPress={() => goToMatch(hero)} />
                </View>

                {/* 2. Günün Öne Çıkanları */}
                {highlights.length > 0 && (
                  <>
                    <View style={sc.sectionHeader}>
                      <Text style={sc.sectionTitle}>GÜNÜN ÖNE ÇIKANLARI</Text>
                    </View>
                    {highlights.map((m, i) => {
                      const mm = metricsMap.get(m.id) ?? NO_DATA;
                      return <HighlightCard key={m.id} m={m} rank={i} metrics={mm} onPress={() => goToMatch(m)} />;
                    })}
                  </>
                )}

                {/* 3. Bugün Ne Bekleniyor? */}
                <DaySummaryCard summary={daySummary} />

                {/* 4. Tüm Maçlar */}
                <View style={sc.sectionHeader}>
                  <Text style={sc.sectionTitle}>TÜM MAÇLAR</Text>
                  <Text style={sc.sectionSub}>Scout skoruna göre sıralandı</Text>
                </View>
                {sortedMatches.map(m => {
                  const mm = metricsMap.get(m.id) ?? NO_DATA;
                  return <MatchRow key={m.id} m={m} metrics={mm} onPress={() => goToMatch(m)} />;
                })}
              </>
            );
          })()}

          {/* ── LİG FİLTRESİ / BAŞKA GÜN ── */}
          {!isScoutMode && (
            sortedMatches.length === 0 ? (
              <Text style={styles.emptyText}>
                {activeFilter !== 'Scout' ? `${activeFilter} için maç bulunamadı` : 'Bu tarihte maç bulunamadı'}
              </Text>
            ) : (
              <>
                <View style={sc.sectionHeader}>
                  <Text style={sc.sectionTitle}>
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

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tab}>
          <Text style={[styles.tabText, styles.tabActive]}>Maçlar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/leagues')}>
          <Text style={styles.tabText}>Ligler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/stats')}>
          <Text style={styles.tabText}>İstatistik</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => router.push('/profile')}>
          <Text style={styles.tabText}>Profil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F8F9FB' },
  topbar:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8, backgroundColor: '#fff' },
  appName:            { fontSize: 20, fontWeight: '500', color: '#111' },
  appNameBlue:        { color: '#185FA5' },
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
  tab:                { flex: 1, paddingVertical: 12, alignItems: 'center' },
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
