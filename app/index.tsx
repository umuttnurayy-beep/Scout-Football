import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { getCityForTeam, getSuperLigMatches, getTodayMatches } from '../services/api';

// ─── constants ───────────────────────────────────────────────────────────────

const SUPPORTED_LEAGUES = [2021, 2014, 2002, 2019, 2015, 2001];

const LEAGUE_NAMES: Record<number, string> = {
  2021: 'Premier Lig', 2014: 'La Liga', 2002: 'Bundesliga',
  2019: 'Serie A', 2015: 'Ligue 1', 2001: 'UCL', 203: 'Süper Lig',
};

const LEAGUE_WEIGHT: Record<number, number> = {
  2001: 10, 2021: 9, 2014: 8, 2002: 7, 2019: 7, 2015: 6, 203: 5,
};

const LEAGUE_BASE: Record<number, { stil: Stil; gol: Level; tempo: Level; risk: Level }> = {
  2021: { stil: 'Dengeli',    gol: 'Orta',   tempo: 'Yüksek', risk: 'Düşük'  },
  2014: { stil: 'Savunmacı', gol: 'Orta',   tempo: 'Orta',   risk: 'Düşük'  },
  2002: { stil: 'Hücumcu',   gol: 'Yüksek', tempo: 'Yüksek', risk: 'Orta'   },
  2019: { stil: 'Savunmacı', gol: 'Düşük',  tempo: 'Düşük',  risk: 'Orta'   },
  2015: { stil: 'Dengeli',   gol: 'Orta',   tempo: 'Orta',   risk: 'Yüksek' },
  2001: { stil: 'Dengeli',   gol: 'Orta',   tempo: 'Orta',   risk: 'Düşük'  },
  203:  { stil: 'Dengeli',   gol: 'Orta',   tempo: 'Yüksek', risk: 'Yüksek' },
};

const LIG_FILTERS = [
  { label: 'Premier Lig', id: 2021 },
  { label: 'La Liga',     id: 2014 },
  { label: 'Bundesliga',  id: 2002 },
  { label: 'Serie A',     id: 2019 },
  { label: 'Ligue 1',     id: 2015 },
  { label: 'UCL',         id: 2001 },
  { label: 'Süper Lig',   id: 203  },
];

const CATEGORIES: { icon: string; label: string; filter: (a: Analysis) => boolean }[] = [
  { icon: '⚽', label: 'Gol Beklentisi\nYüksek', filter: a => a.gol === 'Yüksek' },
  { icon: '⚖️', label: 'En Dengeli',              filter: a => a.stil === 'Dengeli' && a.risk !== 'Yüksek' },
  { icon: '⚠️', label: 'Sürpriz Riski',           filter: a => a.risk === 'Yüksek' },
  { icon: '🧱', label: 'Düşük Tempo',             filter: a => a.tempo === 'Düşük' },
  { icon: '⭐', label: 'Favoriler',               filter: a => a.risk === 'Düşük' },
];

const DAYS   = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// ─── types ───────────────────────────────────────────────────────────────────

type Level = 'Düşük' | 'Orta' | 'Yüksek';
type Stil  = 'Hücumcu' | 'Savunmacı' | 'Dengeli';

type Match = {
  id: number; leagueApiId: number; league: string;
  home: string; away: string; time: string;
  score: string | null; finished: boolean;
  city: string; utcDate: string;
  homeTeamId: number; awayTeamId: number;
};

type Analysis = { stil: Stil; gol: Level; tempo: Level; risk: Level; summary: string; };

// ─── analysis engine ─────────────────────────────────────────────────────────

const LEVELS: Level[] = ['Düşük', 'Orta', 'Yüksek'];
const DELTA = [0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 0];

function shiftLevel(base: Level, delta: number): Level {
  return LEVELS[Math.max(0, Math.min(2, LEVELS.indexOf(base) + delta))];
}

function buildSummary(stil: Stil, gol: Level, tempo: Level, risk: Level): string {
  if (stil === 'Hücumcu'   && gol === 'Yüksek')  return 'İki hücumcu ekip arasında gollü ve tempolu bir maç bekleniyor.';
  if (stil === 'Savunmacı' && gol === 'Düşük')    return 'Savunma odaklı bir karşılaşma — ilk gol belirleyici olacak.';
  if (stil === 'Savunmacı' && tempo === 'Düşük')  return 'Düşük tempolu ve sıkışık bir mücadele — alt 2.5 güçlü sinyal.';
  if (gol === 'Yüksek'     && risk === 'Düşük')   return 'Favori belirgin, gol beklentisi yüksek — güçlü over sinyali.';
  if (risk === 'Yüksek'    && gol === 'Düşük')    return 'Sonuç belirsiz ve az gollü — sürpriz ihtimali yüksek.';
  if (risk === 'Yüksek')                          return 'Sonuç tahmini güç; sürpriz ihtimali göz ardı edilmemeli.';
  if (tempo === 'Yüksek'   && gol === 'Yüksek')   return 'Yüksek tempo ve gol beklentisi — heyecanlı bir maç sinyali.';
  if (tempo === 'Düşük')                          return 'Kontrollü ve düşük tempolu bir maç öngörülüyor.';
  return 'Dengeli iki takım karşı karşıya — maç akışına göre şekillenecek.';
}

function analyzeMatch(m: Match): Analysis {
  const base = LEAGUE_BASE[m.leagueApiId] ?? { stil: 'Dengeli' as Stil, gol: 'Orta' as Level, tempo: 'Orta' as Level, risk: 'Orta' as Level };
  const h    = strHash(m.home + m.away);
  const gol   = shiftLevel(base.gol,   DELTA[h % 11]);
  const tempo = shiftLevel(base.tempo, DELTA[(h + 3) % 11]);
  const risk  = shiftLevel(base.risk,  DELTA[(h + 7) % 11]);
  return { stil: base.stil, gol, tempo, risk, summary: buildSummary(base.stil, gol, tempo, risk) };
}

function buildDaySummary(matches: Match[], analysisMap: Map<number, Analysis>): string {
  const all      = matches.map(m => analysisMap.get(m.id)).filter(Boolean) as Analysis[];
  const total    = all.length;
  if (!total) return 'Bugün maç analizi için yeterli veri yok.';
  const highGol  = all.filter(a => a.gol   === 'Yüksek').length;
  const highRisk = all.filter(a => a.risk  === 'Yüksek').length;
  const lowTempo = all.filter(a => a.tempo === 'Düşük').length;
  if (highGol  > total * 0.45) return `${highGol} maçta yüksek gol beklentisi var — over için aktif bir gün.`;
  if (highRisk > total * 0.40) return `Sonuç belirsizliği yüksek — sürpriz gün, tahminlerde dikkatli ol.`;
  if (lowTempo > total * 0.40) return `Düşük tempolu maçlar ağırlıkta — alt 2.5 için elverişli bir gün.`;
  return 'Dengeli ve orta tempolu maçlar öne çıkıyor. Analiz için her kartı incele.';
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getDateList() {
  const dates = [];
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

function scoutScore(m: Match): number {
  let s = LEAGUE_WEIGHT[m.leagueApiId] ?? 4;
  const mins = timeToMins(m.time);
  if (mins >= 20 * 60) s += 2;
  else if (mins >= 18 * 60) s += 1;
  if (!m.finished) s += 1;
  return s;
}

function getTagColor(type: 'stil' | 'gol' | 'risk', value: string): { bg: string; text: string } {
  if (type === 'gol') {
    if (value.startsWith('Yüksek')) return { bg: '#E8F5E9', text: '#2E7D32' };
    if (value.startsWith('Düşük'))  return { bg: '#F5F5F5', text: '#888' };
    return { bg: '#FFF8E1', text: '#E65100' };
  }
  if (type === 'risk') {
    if (value.startsWith('Yüksek')) return { bg: '#FFEBEE', text: '#C62828' };
    if (value.startsWith('Düşük'))  return { bg: '#E8F5E9', text: '#2E7D32' };
    return { bg: '#FFF8E1', text: '#E65100' };
  }
  if (value === 'Hücumcu')   return { bg: '#FFEBEE', text: '#C62828' };
  if (value === 'Savunmacı') return { bg: '#E8F5E9', text: '#2E7D32' };
  return { bg: '#E6F1FB', text: '#185FA5' };
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

function AnalysisTag({ type, value, onDark = false }: {
  type: 'stil' | 'gol' | 'risk'; value: string; onDark?: boolean;
}) {
  if (onDark) {
    return (
      <View style={[sc.tag, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
        <Text style={[sc.tagText, { color: '#fff' }]}>{value}</Text>
      </View>
    );
  }
  const c = getTagColor(type, value);
  return (
    <View style={[sc.tag, { backgroundColor: c.bg }]}>
      <Text style={[sc.tagText, { color: c.text }]}>{value}</Text>
    </View>
  );
}

function HeroCard({ m, analysis, onPress }: { m: Match; analysis: Analysis; onPress: () => void }) {
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
      <View style={sc.tagRow}>
        <AnalysisTag type="stil" value={analysis.stil}                onDark />
        <AnalysisTag type="gol"  value={`${analysis.gol} Gol`}       onDark />
        <AnalysisTag type="risk" value={`${analysis.risk} Risk`}      onDark />
      </View>
      <Text style={sc.heroSummary}>{analysis.summary}</Text>
    </TouchableOpacity>
  );
}

function CategoryCard({ icon, label, matches, onBestPress }: {
  icon: string; label: string; matches: Match[]; onBestPress: (m: Match) => void;
}) {
  const best = matches[0];
  if (!best) return null;
  return (
    <TouchableOpacity style={sc.catCard} onPress={() => onBestPress(best)} activeOpacity={0.85}>
      <Text style={sc.catIcon}>{icon}</Text>
      <Text style={sc.catLabel}>{label}</Text>
      <Text style={sc.catCount}>{matches.length} maç</Text>
      <Text style={sc.catTeam} numberOfLines={1}>{best.home}</Text>
      <Text style={sc.catVs}>vs</Text>
      <Text style={sc.catTeam} numberOfLines={1}>{best.away}</Text>
      <Text style={sc.catTime}>{best.finished && best.score ? best.score : best.time}</Text>
    </TouchableOpacity>
  );
}

function HighlightCard({ m, rank, analysis, onPress }: {
  m: Match; rank: number; analysis: Analysis; onPress: () => void;
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
      <Text style={sc.hlSummary}>{analysis.summary}</Text>
      <View style={sc.tagRow}>
        <AnalysisTag type="stil" value={analysis.stil} />
        <AnalysisTag type="gol"  value={`${analysis.gol} Gol`} />
        <AnalysisTag type="risk" value={`${analysis.risk} Risk`} />
      </View>
    </TouchableOpacity>
  );
}

function DaySummaryCard({ summary }: { summary: string }) {
  return (
    <View style={sc.daySummary}>
      <Text style={sc.daySummaryTitle}>🧠 BUGÜN NE BEKLENİYOR?</Text>
      <Text style={sc.daySummaryText}>{summary}</Text>
    </View>
  );
}

function MatchRow({ m, analysis, onPress }: { m: Match; analysis: Analysis; onPress: () => void }) {
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
      <View style={sc.tagRow}>
        <AnalysisTag type="stil" value={analysis.stil} />
        <AnalysisTag type="gol"  value={`${analysis.gol} Gol`} />
        <AnalysisTag type="risk" value={`${analysis.risk} Risk`} />
      </View>
      <Text style={sc.matchSummary}>{analysis.summary}</Text>
    </TouchableOpacity>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<string>('Scout');
  const [matches, setMatches]           = useState<Match[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateList          = getDateList();
  const initialFocusDone  = useRef(false);

  useEffect(() => { loadMatches(selectedDate); }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      if (!initialFocusDone.current) {
        initialFocusDone.current = true;
      } else {
        loadMatches(selectedDate, true);
      }
    }, [selectedDate])
  );

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

  const analysisMap = useMemo(() => {
    const map = new Map<number, Analysis>();
    matches.forEach(m => map.set(m.id, analyzeMatch(m)));
    return map;
  }, [matches]);

  const filteredMatches = useMemo(() => {
    if (activeFilter === 'Scout') return matches;
    const lig = LIG_FILTERS.find(f => f.label === activeFilter);
    return lig ? matches.filter(m => m.leagueApiId === lig.id) : matches;
  }, [matches, activeFilter]);

  const sortedMatches = useMemo(
    () => [...filteredMatches].sort((a, b) => scoutScore(b) - scoutScore(a)),
    [filteredMatches]
  );

  const isScoutMode = activeFilter === 'Scout' && isToday(selectedDate) && sortedMatches.length > 0;

  const hero       = isScoutMode ? sortedMatches[0] : null;
  const highlights = isScoutMode ? sortedMatches.slice(1, 4) : [];
  const daySummary = isScoutMode ? buildDaySummary(matches, analysisMap) : '';

  const categoryMatches = useMemo(() =>
    CATEGORIES.map(cat =>
      sortedMatches.filter(m => { const a = analysisMap.get(m.id); return a ? cat.filter(a) : false; })
    ),
    [sortedMatches, analysisMap]
  );

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
        <TouchableOpacity onPress={() => loadMatches(selectedDate)}>
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

      {/* Filtre şeridi: Scout + lig filtreleri */}
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
            const heroA = analysisMap.get(hero.id)!;
            return (
              <>
                {/* 1. Hero */}
                <View style={sc.sectionHeader}>
                  <Text style={sc.sectionTitle}>GÜNÜN MAÇI</Text>
                </View>
                <View style={{ paddingHorizontal: 14, marginBottom: 4 }}>
                  <HeroCard m={hero} analysis={heroA} onPress={() => goToMatch(hero)} />
                </View>

                {/* 2. Kategori şeritleri */}
                {categoryMatches.some(cm => cm.length > 0) && (
                  <>
                    <View style={sc.sectionHeader}>
                      <Text style={sc.sectionTitle}>HIZLI KATEGORİLER</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 10, gap: 10 }}>
                      {CATEGORIES.map((cat, i) =>
                        categoryMatches[i].length > 0 ? (
                          <CategoryCard
                            key={i} icon={cat.icon} label={cat.label}
                            matches={categoryMatches[i]} onBestPress={goToMatch}
                          />
                        ) : null
                      )}
                    </ScrollView>
                  </>
                )}

                {/* 3. Günün Öne Çıkanları */}
                {highlights.length > 0 && (
                  <>
                    <View style={sc.sectionHeader}>
                      <Text style={sc.sectionTitle}>GÜNÜN ÖNE ÇIKANLARI</Text>
                    </View>
                    {highlights.map((m, i) => {
                      const a = analysisMap.get(m.id);
                      return a ? <HighlightCard key={m.id} m={m} rank={i} analysis={a} onPress={() => goToMatch(m)} /> : null;
                    })}
                  </>
                )}

                {/* 4. Bugün Ne Bekleniyor? */}
                <DaySummaryCard summary={daySummary} />

                {/* 5. Tüm Maçlar */}
                <View style={sc.sectionHeader}>
                  <Text style={sc.sectionTitle}>TÜM MAÇLAR</Text>
                  <Text style={sc.sectionSub}>Scout değerine göre sıralandı</Text>
                </View>
                {sortedMatches.map(m => {
                  const a = analysisMap.get(m.id);
                  return a ? <MatchRow key={m.id} m={m} analysis={a} onPress={() => goToMatch(m)} /> : null;
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
                  const a = analysisMap.get(m.id);
                  return a ? <MatchRow key={m.id} m={m} analysis={a} onPress={() => goToMatch(m)} /> : null;
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
  heroSummary:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic', lineHeight: 17, marginTop: 10 },

  catCard:       { width: 118, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E4EEF8' },
  catIcon:       { fontSize: 20, marginBottom: 6 },
  catLabel:      { fontSize: 11, color: '#185FA5', fontWeight: '700', letterSpacing: 0.3, marginBottom: 6, lineHeight: 15 },
  catCount:      { fontSize: 10, color: '#aaa', marginBottom: 8 },
  catTeam:       { fontSize: 12, fontWeight: '600', color: '#111', marginVertical: 1 },
  catVs:         { fontSize: 10, color: '#ccc', marginVertical: 1 },
  catTime:       { fontSize: 12, fontWeight: '600', color: '#185FA5', marginTop: 6 },

  hlCard:        { marginHorizontal: 14, marginBottom: 8, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E4EEF8', borderLeftWidth: 3 },
  hlTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  hlRank:        { fontSize: 11, fontWeight: '700' },
  hlLeague:      { fontSize: 11, color: '#aaa' },
  hlTeams:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  hlTeam:        { flex: 1, fontSize: 14, fontWeight: '600', color: '#111' },
  hlTime:        { fontSize: 14, fontWeight: '700', color: '#333', paddingHorizontal: 8 },
  hlSummary:     { fontSize: 12, color: '#555', fontStyle: 'italic', lineHeight: 17, marginBottom: 8 },

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
  matchTeams:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  matchTeam:     { flex: 1, fontSize: 14, fontWeight: '600', color: '#111' },
  matchSep:      { paddingHorizontal: 8, color: '#ccc', fontSize: 14 },
  matchSummary:  { fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 7, lineHeight: 16 },

  tagRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:           { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagText:       { fontSize: 11, fontWeight: '500' },
});
