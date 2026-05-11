import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, Image, RefreshControl, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import BottomTabBar from '../components/BottomTabBar';
import EmptyStateCard from '../components/EmptyStateCard';
import RefreshStatusBar, { REFRESH_STATUS_MESSAGES } from '../components/RefreshStatusBar';
import { SkeletonMatchCard, SkeletonSectionHeader } from '../components/SkeletonLoader';
import { useTheme } from '../context/ThemeContext';
import {
  H2HRawItem, HomeData, checkBackendHealth, clearLastApiError, getAllSportsH2H, getH2H, getHomeData, getLastApiError, getStandings, getSuperLigMatches, getSuperLigStandings, getTodayMatches, preloadMatchContext, preloadSuperLigMatchContext, Standing,
} from '../services/api';
import { loadNotifPrefs, scheduleNotifications } from '../services/notifications';
import { filterPicksForWeek, getCurrentWeekRange, loadPickHistory, pickAccuracy, savePick } from '../utils/pickHistory';
import { dataNoticeMessage, matchListEmptyMessage } from '../utils/emptyStates';
import { teamsMatch } from '../utils/teamStats';
import {
  FeaturedMatchCache, ListItem, Match, Metrics,
  LEAGUE_NAMES, STANDINGS_LEAGUES,
  buildDaySummary, buildHomeCardAnalysis, buildNextPreviewFromHomeData, buildVisibleMatches,
  buildMatchContextScoutAnalysis, computeMetrics, confidenceText, expectedLine, favoriteText,
  findStanding, getPickFromMetrics, hasUsableStandingsMap, levelFromExpectedGoals,
  NO_DATA,
  readH2HMatch,
  scoutScore, selectPreviewMatch, singleMatchScoutText, trendBarPercent,
  uniqueLeagueIds,
} from '../utils/matchMetrics';

// ─── constants ───────────────────────────────────────────────────────────────

const STANDINGS_CACHE_KEY = 'scout_standings_cache_v5';
const FEATURED_MATCH_CACHE_KEY = 'scout_featured_match_cache_v3';
const HOME_DATA_CACHE_KEY = 'scout_home_data_cache_v4';
const STANDINGS_TTL = 60 * 60 * 1000; // 1 saat — aynı gün içinde de bayat puan tablosunu yenile
type HomeDataNotice = 'stale' | 'cache' | 'warning' | 'error';

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

const LEAGUE_FLAG: Record<number, string> = {
  2021: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 2014: '🇪🇸', 2002: '🇩🇪', 2019: '🇮🇹', 2015: '🇫🇷', 2001: '🌍', 203: '🇹🇷',
};

const NEXT_MATCH_LOOKAHEAD_DAYS = 7;
const FOCUS_REFRESH_MIN_INTERVAL_MS = 10 * 60 * 1000;
const DETAIL_CONTEXT_PREFETCH_LIMIT = 12;
const DETAIL_CONTEXT_PREFETCH_BATCH_SIZE = 3;
const LAUNCH_SPLASH_MIN_MS = 2500;
const LAUNCH_SPLASH_MAX_MS = 5500;
const PENDING_METRICS: Metrics = {
  ...NO_DATA,
  reason: 'Analiz hazırlanıyor...',
  summary: 'Analiz hazırlanıyor...',
};

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

function isToday(date: Date) { return date.toDateString() === new Date().toDateString(); }

function metricsForMatch(m: Match, standingsMap: Record<number, Standing[]>): Metrics {
  const rows = standingsMap[m.leagueApiId];
  if (!rows?.length) return PENDING_METRICS;
  const home = findStanding(rows, m.home, m.homeTeamId);
  const away = findStanding(rows, m.away, m.awayTeamId);
  return computeMetrics(home, away, rows, m.leagueApiId);
}

// ─── components ──────────────────────────────────────────────────────────────

function HeroCard({ m, metrics, onPress }: { m: Match; metrics: Metrics; onPress: () => void }) {
  const cardAnalysis = buildHomeCardAnalysis(m, metrics);
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
            <Text style={sc.heroMetricPrimary} numberOfLines={1}>{cardAnalysis.headline}</Text>
          </View>
          <Text style={sc.heroSummary}>{cardAnalysis.summary}</Text>
        </>
      ) : (
        <Text style={sc.heroSummary}>{cardAnalysis.summary}</Text>
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
  const [contextAnalysis, setContextAnalysis] = useState<ReturnType<typeof buildMatchContextScoutAnalysis>>(null);

  useEffect(() => {
    let alive = true;
    setContextAnalysis(null);
    preloadMatchContext(String(m.id), m.finished, { silent: true })
      .then(context => {
        if (!alive) return;
        setContextAnalysis(buildMatchContextScoutAnalysis(m, context, metrics.leagueAvg));
      })
      .catch(() => {
        if (alive) setContextAnalysis(null);
      });
    return () => { alive = false; };
  }, [m.id, m.finished, m.homeTeamId, m.awayTeamId, metrics.leagueAvg]);
  return (
    <View style={[sc.singlePanel, { backgroundColor: c.surface, borderColor: c.cardBorder }]}>
      <View style={sc.singleTitleRow}>
        <Ionicons name="sparkles-outline" size={17} color={c.primary} />
        <Text style={[sc.singleTitle, { color: c.primary }]}>SCOUT NE DİYOR?</Text>
      </View>
      <Text style={[sc.singleText, { color: c.text }]}>{singleMatchScoutText(m, metrics)}</Text>
      {contextAnalysis && (
        <View style={sc.singleMetrics}>
          <MiniMetric icon="flash-outline" label="Tempo" value={contextAnalysis.tempo} tone="hot" />
          <MiniMetric icon="stats-chart-outline" label="Gol Bek." value={contextAnalysis.gol} tone="hot" />
          <MiniMetric icon="shield-outline" label="Risk" value={contextAnalysis.risk} tone="warn" />
        </View>
      )}
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
      <ProgressRow label="Gol beklentisi" value={`~${metrics.expectedGoals.toFixed(1)} gol · ${goalLevel}`} percent={trendBarPercent(goalLevel)} />
      <ProgressRow label="Taraf okuması" value={sideValue || 'Dengeli'} percent={metrics.favorite === 'balanced' ? 52 : 70} />
      <ProgressRow label="Veri güveni" value={confidence} percent={trendBarPercent(confidence)} />
      <Text style={[sc.trendFoot, { color: c.textMuted }]}>Beklenen gol, lig tablosu ve form eşleşmesinden türetilen özet sinyal.</Text>
    </View>
  );
}

function SingleH2HCard({ h2h }: { h2h: H2HRawItem[] }) {
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
  const cardAnalysis = buildHomeCardAnalysis(m, metrics);
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
      <Text style={[sc.hlMetric, { color: c.primary }]}>{metrics.hasData ? `${expectedLine(metrics)} · ${cardAnalysis.headline}` : cardAnalysis.summary}</Text>
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

function DataNoticeCard({ type, message, onRetry }: { type: HomeDataNotice; message?: string | null; onRetry?: () => void }) {
  const { colors: c, isDark } = useTheme();
  const isStale = type === 'stale';
  const isCache = type === 'cache';
  const isWarning = type === 'warning';
  const accentColor = isStale ? c.primary : isCache ? '#8B949E' : isWarning ? '#E3B341' : '#E16F3D';
  const backgroundColor = isDark
    ? isWarning ? '#2A2416' : type === 'error' ? '#2B1F1A' : isCache ? '#1C2128' : '#18202A'
    : isWarning ? '#FFF7E5' : type === 'error' ? '#FFF1EC' : isCache ? '#F1F3F5' : '#F3F7FC';
  const borderColor = isWarning
    ? (isDark ? '#6E5A1F' : '#F3D07B')
    : type === 'error'
      ? (isDark ? '#7B4A37' : '#F2B39A')
      : isCache
        ? c.border
      : c.cardBorder;
  return (
    <View style={[sc.noticeCard, { backgroundColor, borderColor }]}>
      <Ionicons
        name={isStale ? 'time-outline' : isCache ? 'archive-outline' : isWarning ? 'alert-circle-outline' : 'cloud-offline-outline'}
        size={18}
        color={accentColor}
      />
      <Text style={[sc.noticeText, { color: c.textSub, flex: 1 }]}>
        {message || dataNoticeMessage(type)}
      </Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} style={[sc.noticeRetryBtn, { borderColor: accentColor }]} activeOpacity={0.75}>
          <Ionicons name="refresh" size={13} color={accentColor} />
          <Text style={[sc.noticeRetryText, { color: accentColor }]}>Tekrar Dene</Text>
        </TouchableOpacity>
      )}
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
  standingsMap = {},
}: {
  selectedDate: Date;
  preview: { m: Match; metrics: Metrics } | null;
  onNextDate: () => void;
  onRefresh: () => void;
  onOpenLeagues: () => void;
  onOpenStats: () => void;
  onOpenMatch: () => void;
  standingsMap?: Record<number, Standing[]>;
}) {
  const { colors: c } = useTheme();
  const dateText = `${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]}`;
  const [favTeamName, setFavTeamName] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('scout_fav_team').then(raw => {
      if (!raw) return;
      try { setFavTeamName(JSON.parse(raw)?.name || null); } catch {}
    }).catch(() => {});
  }, []);

  const favStanding = useMemo(() => {
    if (!favTeamName) return null;
    for (const rows of Object.values(standingsMap)) {
      const found = rows.find(r => teamsMatch(r.team, favTeamName));
      if (found) return found;
    }
    return null;
  }, [favTeamName, standingsMap]);

  const leaders = useMemo(() => {
    const leagueOrder = [2021, 2014, 2002, 2019, 2015, 203];
    return leagueOrder.flatMap(id => {
      const rows = standingsMap[id];
      if (!rows || rows.length === 0) return [];
      const leader = rows.find(r => r.pos === 1) || rows[0];
      return [{ leagueId: id, leader }];
    });
  }, [standingsMap]);

  const leagueGoalsPerGame = useMemo(() => {
    const map: Record<number, number> = {};
    for (const [idStr, rows] of Object.entries(standingsMap)) {
      const id = Number(idStr);
      if (!rows || rows.length < 2) continue;
      const totalGf = rows.reduce((s, r) => s + r.gf, 0);
      const totalPlayed = rows.reduce((s, r) => s + r.played, 0);
      if (totalPlayed > 0) map[id] = totalGf / (totalPlayed / 2);
    }
    return map;
  }, [standingsMap]);

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

      {favStanding && (
        <>
          <View style={sc.sectionHeader}>
            <Text style={[sc.sectionTitle, { color: c.textMuted }]}>FAVORİ TAKIM</Text>
          </View>
          <View style={[sc.emptyFavCard, { backgroundColor: c.surface, borderColor: c.cardBorder }]}>
            <View style={sc.emptyFavLeft}>
              <Text style={[sc.emptyFavName, { color: c.text }]} numberOfLines={1}>{favTeamName}</Text>
              <Text style={[sc.emptyFavSub, { color: c.textSub }]}>{favStanding.win}G {favStanding.draw}B {favStanding.loss}M · {favStanding.played} maç</Text>
            </View>
            <View style={sc.emptyFavRight}>
              <Text style={[sc.emptyFavPos, { color: c.textFaint }]}>{favStanding.pos}. sıra</Text>
              <Text style={[sc.emptyFavPts, { color: c.primary }]}>{favStanding.pts} puan</Text>
            </View>
          </View>
        </>
      )}

      {leaders.length > 0 && (
        <>
          <View style={sc.sectionHeader}>
            <Text style={[sc.sectionTitle, { color: c.textMuted }]}>LİG LİDERLERİ</Text>
          </View>
          <View style={[sc.emptyLeadersCard, { backgroundColor: c.surface, borderColor: c.cardBorder }]}>
            {leaders.map(({ leagueId, leader }) => {
              const gpg = leagueGoalsPerGame[leagueId];
              return (
                <View key={leagueId} style={[sc.emptyLeaderRow, { borderBottomColor: c.border }]}>
                  <Text style={sc.emptyLeaderFlag}>{LEAGUE_FLAG[leagueId] || '🌍'}</Text>
                  <View style={sc.emptyLeaderMid}>
                    <Text style={[sc.emptyLeaderLeague, { color: c.textSub }]} numberOfLines={1}>{LEAGUE_NAMES[leagueId]}</Text>
                    {gpg != null && <Text style={[sc.emptyLeaderGpg, { color: c.textFaint }]}>{gpg.toFixed(1)} gol/maç</Text>}
                  </View>
                  <Text style={[sc.emptyLeaderTeam, { color: c.text }]} numberOfLines={1}>{leader.team}</Text>
                  <Text style={[sc.emptyLeaderPts, { color: c.primary }]}>{leader.pts}p</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

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
  const cardAnalysis = buildHomeCardAnalysis(m, metrics);
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
          <Text style={[sc.hlMetric, { color: c.primary }]}>{expectedLine(metrics)} · {cardAnalysis.headline}</Text>
          <Text style={[sc.hlSummary, { color: c.textSub }]}>{cardAnalysis.summary}</Text>
        </>
      ) : (
        <Text style={[sc.hlSummary, { color: c.textSub }]}>{cardAnalysis.summary}</Text>
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
  const cardAnalysis = buildHomeCardAnalysis(m, metrics);
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
          {expectedLine(metrics)} · {cardAnalysis.headline}
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
  const [matchesDateStr, setMatchesDateStr] = useState<string | null>(null);
  const [standingsMap, setStandingsMap] = useState<Record<number, Standing[]>>({});
  const [nextDayPreview, setNextDayPreview] = useState<{ m: Match; metrics: Metrics } | null>(null);
  const [singleH2H, setSingleH2H] = useState<H2HRawItem[]>([]);
  const [featuredMatchCache, setFeaturedMatchCache] = useState<FeaturedMatchCache>({});
  const [featuredCacheLoaded, setFeaturedCacheLoaded] = useState(false);
  const [backendFeaturedMatchId, setBackendFeaturedMatchId] = useState<number | null>(null);
  const [homeDataNotice, setHomeDataNotice] = useState<HomeDataNotice | null>(null);
  const [homeDataWarningText, setHomeDataWarningText] = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [, setBackendOffline] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateList          = useMemo(getDateList, []);
  const selectedDateKey   = formatDateParam(selectedDate);
  const matchesReadyForSelectedDate = matchesDateStr === selectedDateKey;
  const initialFocusDone  = useRef(false);
  const loadSeq           = useRef(0);
  const lastGoodVisibleByDate = useRef<Record<string, Match[]>>({});
  const latestMatchesRef = useRef<Match[]>([]);
  const latestMatchesDateStrRef = useRef<string | null>(null);
  const latestStandingsMapRef = useRef<Record<number, Standing[]>>({});
  const lastHomeLoadAtByDate = useRef<Record<string, number>>({});
  const warmedDetailContextsRef = useRef<Set<string>>(new Set());
  const [weeklyAcc, setWeeklyAcc] = useState<{ correct: number; total: number; pct: number; allTotal: number; label: string } | null>(null);
  const launchSplashStartedAt = useRef(Date.now());
  const launchSplashHiddenRef = useRef(false);
  const wasOnTodayBeforeBackground = useRef(true);

  useEffect(() => { latestMatchesRef.current = matches; }, [matches]);
  useEffect(() => { latestMatchesDateStrRef.current = matchesDateStr; }, [matchesDateStr]);
  useEffect(() => { latestStandingsMapRef.current = standingsMap; }, [standingsMap]);

  const hideLaunchSplash = useCallback(() => {
    if (launchSplashHiddenRef.current) return;
    launchSplashHiddenRef.current = true;
    const elapsed = Date.now() - launchSplashStartedAt.current;
    const delay = Math.max(0, LAUNCH_SPLASH_MIN_MS - elapsed);
    setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, delay);
  }, []);

  useEffect(() => {
    const timer = setTimeout(hideLaunchSplash, LAUNCH_SPLASH_MAX_MS);
    return () => clearTimeout(timer);
  }, [hideLaunchSplash]);

  useEffect(() => {
    if (!loading && featuredCacheLoaded && matchesReadyForSelectedDate) {
      hideLaunchSplash();
    }
  }, [featuredCacheLoaded, hideLaunchSplash, loading, matchesReadyForSelectedDate]);

  useEffect(() => {
    AsyncStorage.getItem(FEATURED_MATCH_CACHE_KEY)
      .then(raw => {
        if (raw) setFeaturedMatchCache(prev => ({ ...JSON.parse(raw), ...prev }));
      })
      .catch(() => {})
      .finally(() => setFeaturedCacheLoaded(true));
  }, []);

  useEffect(() => {
    checkBackendHealth().then(ok => setBackendOffline(!ok));
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

  // Arka plana geçerken "today'deydim mi" not al; öne gelince sadece öyleyse bugüne geç
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') {
        wasOnTodayBeforeBackground.current = isToday(selectedDate);
      }
      if (state === 'active') {
        const today = new Date();
        if (wasOnTodayBeforeBackground.current && selectedDate.toDateString() !== today.toDateString()) {
          setSelectedDate(today);
        }
      }
    });
    return () => sub.remove();
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      if (!initialFocusDone.current) initialFocusDone.current = true;
      else {
        const dateKey = formatDateParam(selectedDate);
        const lastLoadAt = lastHomeLoadAtByDate.current[dateKey] || 0;
        if (Date.now() - lastLoadAt > FOCUS_REFRESH_MIN_INTERVAL_MS) {
          loadMatches(selectedDate, true);
        }
      }
      // loadMatches uses current screen state; focus refresh is keyed by selectedDate.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate])
  );

  // Load weekly pick accuracy for Scout mode card — son tamamlanmış hafta
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const range = getCurrentWeekRange(); // devam eden bu hafta
        const picks = await loadPickHistory();
        const weekPicks = filterPicksForWeek(picks, range.start, range.end)
          .filter(p => p.pickTone !== 'caution');
        if (weekPicks.length > 0) {
          const acc = pickAccuracy(weekPicks);
          setWeeklyAcc({ ...acc, allTotal: weekPicks.length, label: range.label });
        } else {
          setWeeklyAcc(null);
        }
      })();
    }, [])
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

  async function readHomeDataCache(dateStr: string): Promise<HomeData | null> {
    try {
      const rawHome = await AsyncStorage.getItem(`${HOME_DATA_CACHE_KEY}:${dateStr}`);
      if (!rawHome) return null;
      const cachedHome = JSON.parse(rawHome) as HomeData;
      if (!Array.isArray(cachedHome.matches) || !Array.isArray(cachedHome.superLigMatches)) return null;
      return cachedHome;
    } catch {
      return null;
    }
  }

  async function loadMatches(date: Date, silent = false) {
    const requestId = ++loadSeq.current;
    const dateStr = formatDateParam(date);
    let showedCachedHome = false;
    if (!silent) {
      if (loading) setLoading(true);
      else setRefreshing(true);

      const cachedHome = await readHomeDataCache(dateStr);
      if (cachedHome && requestId === loadSeq.current) {
        applyHomeData(dateStr, cachedHome, { notice: null });
        setLoading(false);
        showedCachedHome = true;
      }
    }
    try {
      clearLastApiError();
      const homeData = await getHomeData(dateStr);
      if (homeData) {
        if (requestId !== loadSeq.current) return;
        setBackendOffline(false);
        const hydratedHomeData = await hydratePartialHomeData(dateStr, homeData);
        if (requestId !== loadSeq.current) return;
        applyHomeData(dateStr, hydratedHomeData, {
          notice: null,
          persist: true,
        });
        return;
      }

      const homeRequestError = getLastApiError();
      if (homeRequestError) setBackendOffline(true);
      if (showedCachedHome) {
        setHomeDataNotice(null);
        setHomeDataWarningText(null);
        return;
      }
      setBackendFeaturedMatchId(null);
      setHomeDataNotice('error');
      setHomeDataWarningText(null);
      const cachedHome = await readHomeDataCache(dateStr);
      if (cachedHome) {
        if (requestId !== loadSeq.current) return;
        applyHomeData(dateStr, cachedHome, { notice: null });
        return;
      }

      if (!__DEV__) {
        setStandingsMap({});
        setMatches([]);
        setMatchesDateStr(dateStr);
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
    options: { notice: HomeDataNotice | null; persist?: boolean },
  ) {
    const homeStandings = homeData.standings || {};
    const payloadVisible = buildVisibleMatches(homeData.matches || [], homeData.superLigMatches || []);
    const currentMatches = latestMatchesDateStrRef.current === dateStr ? latestMatchesRef.current : [];
    const currentStandingsMap = latestStandingsMapRef.current;
    const preservedVisible = lastGoodVisibleByDate.current[dateStr] || currentMatches;
    const hasPreservedMainMatches = preservedVisible.some(m => m.leagueApiId !== 203);
    const mainSourceMissing = (
      (homeData.sourceSeverity === 'warning' || homeData.sourceSeverity === 'error') ||
      hasPreservedMainMatches
    ) &&
      (homeData.matches?.length ?? 0) === 0 &&
      (homeData.superLigMatches?.length ?? 0) > 0;
    const visible = mainSourceMissing && preservedVisible.some(m => m.leagueApiId !== 203)
      ? [
        ...preservedVisible.filter(m => m.leagueApiId !== 203),
        ...payloadVisible.filter(m => m.leagueApiId === 203),
      ]
      : payloadVisible;
    const nextStandingsMap = mergeStandingsMaps(currentStandingsMap, homeStandings);
    setStandingsMap(nextStandingsMap);
    latestStandingsMapRef.current = nextStandingsMap;
    setMatches(visible);
    latestMatchesRef.current = visible;
    setMatchesDateStr(dateStr);
    latestMatchesDateStrRef.current = dateStr;
    lastHomeLoadAtByDate.current[dateStr] = Date.now();
    setBackendFeaturedMatchId(homeData.featuredMatchId ?? null);
    setHomeDataNotice(options.notice);
    setHomeDataWarningText(null);
    setNextDayPreview(visible.length <= 1 ? buildNextPreviewFromHomeData(homeData, nextStandingsMap) : null);

    if (!mainSourceMissing && visible.some(m => m.leagueApiId !== 203)) {
      lastGoodVisibleByDate.current[dateStr] = visible;
    }

    if (options.persist && !mainSourceMissing) {
      persistStandingsCache(dateStr, nextStandingsMap);
      AsyncStorage.setItem(`${HOME_DATA_CACHE_KEY}:${dateStr}`, JSON.stringify({
        ...homeData,
        standings: nextStandingsMap,
      })).catch(() => {});
    }
  }

  async function hydratePartialHomeData(dateStr: string, homeData: HomeData): Promise<HomeData> {
    const mainSourceMissing = (homeData.sourceSeverity === 'warning' || homeData.sourceSeverity === 'error') &&
      (homeData.matches?.length ?? 0) === 0 &&
      (homeData.superLigMatches?.length ?? 0) > 0;
    if (!mainSourceMissing) return homeData;
    try {
      const rawHome = await AsyncStorage.getItem(`${HOME_DATA_CACHE_KEY}:${dateStr}`);
      if (!rawHome) return homeData;
      const cached = JSON.parse(rawHome) as HomeData;
      if (!Array.isArray(cached.matches) || cached.matches.length === 0) return homeData;
      return {
        ...homeData,
        matches: cached.matches,
        standings: mergeStandingsMaps(cached.standings || {}, homeData.standings || {}),
        featuredMatchId: homeData.featuredMatchId ?? cached.featuredMatchId ?? null,
        nextPreview: homeData.nextPreview ?? cached.nextPreview ?? null,
      };
    } catch {
      return homeData;
    }
  }

  async function readStandingsCache(dateStr: string): Promise<Record<number, Standing[]> | null> {
    try {
      const raw = await AsyncStorage.getItem(STANDINGS_CACHE_KEY);
      if (!raw) return null;
      const { cacheDate, cacheTs, data: cached } = JSON.parse(raw);
      if (cacheDate !== dateStr) return null;
      if (cacheTs && Date.now() - cacheTs > STANDINGS_TTL) return null;
      if (!hasUsableStandingsMap(cached)) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function persistStandingsCache(dateStr: string, map: Record<number, Standing[]>) {
    AsyncStorage.setItem(STANDINGS_CACHE_KEY, JSON.stringify({ cacheDate: dateStr, cacheTs: Date.now(), data: map })).catch(() => {});
  }

  function applyFallbackNoticeFromApiState() {
    setHomeDataNotice(null);
    setHomeDataWarningText(null);
  }

  function mergeStandingsMaps(
    base: Record<number, Standing[]> = {},
    incoming: Record<number, Standing[]> = {},
  ) {
    const merged = { ...base };
    Object.entries(incoming).forEach(([leagueApiId, rows]) => {
      if (Array.isArray(rows) && rows.length > 0) {
        merged[Number(leagueApiId)] = rows;
      }
    });
    return merged;
  }

  async function applyVisibleMatchesForFallback(
    visible: Match[],
    date: Date,
    dateStr: string,
    requestId: number,
    baseMap: Record<number, Standing[]>,
  ) {
    const rowsMap = await ensureStandingsForMatches(visible, dateStr, requestId, baseMap);
    if (requestId !== loadSeq.current) return;
    setMatches(visible);
    setMatchesDateStr(dateStr);
    if (visible.length === 1) {
      void loadNextDayPreview(date, requestId, rowsMap);
    } else {
      setNextDayPreview(null);
    }
  }

  async function loadFallbackWithStandings(date: Date, dateStr: string, requestId: number) {
    let map: Record<number, Standing[]> | null = await readStandingsCache(dateStr);

    if (map) {
      const missingLeagues = STANDINGS_LEAGUES.filter(({ leagueApiId }) => !map![leagueApiId]?.length);
      const [data, slData, ...missingResults] = await Promise.all([
        getTodayMatches(dateStr),
        getSuperLigMatches(dateStr),
        ...missingLeagues.map(({ apiId }) => getStandings(apiId)),
      ]);
      if (requestId !== loadSeq.current) return;

      const updatedMap = { ...map };
      missingLeagues.forEach((x, i) => {
        if (missingResults[i]?.length > 0) updatedMap[x.leagueApiId] = missingResults[i];
      });
      setStandingsMap(updatedMap);
      if (missingLeagues.some((x, i) => missingResults[i]?.length > 0)) {
        persistStandingsCache(dateStr, updatedMap);
      }

      const visible = buildVisibleMatches(data, slData);
      await applyVisibleMatchesForFallback(visible, date, dateStr, requestId, updatedMap);
      if (requestId !== loadSeq.current) return;
      applyFallbackNoticeFromApiState();
      return;
    }

    const [data, slData, fdResults, slStandings] = await Promise.all([
      getTodayMatches(dateStr),
      getSuperLigMatches(dateStr),
      Promise.all(STANDINGS_LEAGUES.map(({ apiId }) => getStandings(apiId))),
      getSuperLigStandings(),
    ]);
    if (requestId !== loadSeq.current) return;

    map = {};
    STANDINGS_LEAGUES.forEach((x, i) => {
      if (fdResults[i]?.length > 0) map![x.leagueApiId] = fdResults[i];
    });
    if (slStandings?.length > 0) map[203] = slStandings;
    persistStandingsCache(dateStr, map);
    setStandingsMap(map);

    const visible = buildVisibleMatches(data, slData);
    await applyVisibleMatchesForFallback(visible, date, dateStr, requestId, map);
    if (requestId !== loadSeq.current) return;
    applyFallbackNoticeFromApiState();
  }

  async function loadFallbackRefreshOnly(date: Date, dateStr: string, requestId: number) {
    const [data, slData] = await Promise.all([
      getTodayMatches(dateStr),
      getSuperLigMatches(dateStr),
    ]);
    if (requestId !== loadSeq.current) return;

    const visible = buildVisibleMatches(data, slData);
    await applyVisibleMatchesForFallback(visible, date, dateStr, requestId, latestStandingsMapRef.current);
    if (requestId !== loadSeq.current) return;
    applyFallbackNoticeFromApiState();
  }

  async function loadDevFallbackMatches(date: Date, dateStr: string, requestId: number, silent: boolean) {
    clearLastApiError();
    const needsStandings = Object.keys(standingsMap).length === 0;
    if (!silent && needsStandings) {
      await loadFallbackWithStandings(date, dateStr, requestId);
      return;
    }
    await loadFallbackRefreshOnly(date, dateStr, requestId);
  }

  async function loadPreviewCandidateForDate(
    nextStr: string,
    requestId: number,
    rowsMap: Record<number, Standing[]>,
  ) {
    const [data, slData] = await Promise.all([
      getTodayMatches(nextStr),
      getSuperLigMatches(nextStr),
    ]);
    if (requestId !== loadSeq.current) return null;

    const visible = buildVisibleMatches(data, slData);
    if (visible.length === 0) return null;

    const completeRowsMap = await ensureStandingsForMatches(visible, nextStr, requestId, rowsMap);
    if (requestId !== loadSeq.current) return null;
    return selectPreviewMatch(visible, completeRowsMap);
  }

  async function loadNextDayPreview(date: Date, requestId: number, rowsMap: Record<number, Standing[]>) {
    try {
      for (let offset = 1; offset <= NEXT_MATCH_LOOKAHEAD_DAYS; offset += 1) {
        const next = new Date(date);
        next.setDate(next.getDate() + offset);
        const nextStr = formatDateParam(next);
        const preview = await loadPreviewCandidateForDate(nextStr, requestId, rowsMap);
        if (requestId !== loadSeq.current) return;
        if (!preview) continue;
        setNextDayPreview(preview);
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
    let changed = false;
    leagueRows.forEach(([leagueApiId, rows]) => {
      if (rows.length > 0) {
        updated[leagueApiId] = rows;
        changed = true;
      }
    });
    if (!changed) return baseMap;
    setStandingsMap(updated);
    persistStandingsCache(dateStr, updated);
    return updated;
  }

  useEffect(() => {
    if (!matchesReadyForSelectedDate || matches.length === 0 || !matchesDateStr) return;
    const missing = uniqueLeagueIds(matches).filter(leagueApiId => !standingsMap[leagueApiId]?.length);
    if (missing.length === 0) return;
    const requestId = loadSeq.current;
    void ensureStandingsForMatches(matches, matchesDateStr, requestId, standingsMap);
  }, [matches, matchesDateStr, matchesReadyForSelectedDate, standingsMap]);

  const metricsMap = useMemo(() => {
    const map = new Map<number, Metrics>();
    for (const m of matches) {
      map.set(m.id, metricsForMatch(m, standingsMap));
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

      // Uygulamadaki Günün Maçı seçimiyle tutarlı: önce backendFeaturedMatchId, yoksa scoutScore en yüksek
      const unfinished = matches.filter(m => !m.finished);
      const ranked = [...unfinished].sort((a, b) =>
        scoutScore(b, metricsMap.get(b.id) ?? NO_DATA) - scoutScore(a, metricsMap.get(a.id) ?? NO_DATA)
      );
      const top = (backendFeaturedMatchId && ranked.find(m => m.id === backendFeaturedMatchId))
        ?? ranked[0];

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
  }, [matches, metricsMap, selectedDate, backendFeaturedMatchId]);

  // Ana ekrandan bu haftaki pick'leri otomatik kaydet — maç detayına girmeye gerek yok
  useEffect(() => {
    if (!matchesDateStr || matches.length === 0 || metricsMap.size === 0) return;
    const range = getCurrentWeekRange();
    if (matchesDateStr < range.start || matchesDateStr > range.end) return;
    (async () => {
      let anyNew = false;
      for (const m of matches) {
        if (m.finished) continue;
        const metrics = metricsMap.get(m.id);
        if (!metrics) continue;
        const pick = getPickFromMetrics(m, metrics);
        if (!pick || pick.tone === 'caution') continue;
        const saved = await savePick({
          id: String(m.id),
          date: matchesDateStr,
          homeTeam: m.home,
          awayTeam: m.away,
          pickLabel: pick.label,
          pickTone: pick.tone,
          isSuperLig: m.leagueApiId === 203,
          savedAt: new Date().toISOString(),
        });
        if (saved) anyNew = true;
      }
      if (anyNew) {
        const updatedPicks = await loadPickHistory();
        const weekPicks = filterPicksForWeek(updatedPicks, range.start, range.end);
        if (weekPicks.length > 0) {
          const acc = pickAccuracy(weekPicks);
          setWeeklyAcc({ ...acc, allTotal: weekPicks.length, label: range.label });
        }
      }
    })();
  }, [matches, matchesDateStr, metricsMap]);

  const filteredMatches = useMemo(() => {
    if (!matchesReadyForSelectedDate) return [];
    if (activeFilter === 'Scout') return matches;
    const lig = LIG_FILTERS.find(f => f.label === activeFilter);
    return lig ? matches.filter(m => m.leagueApiId === lig.id) : matches;
  }, [matches, activeFilter, matchesReadyForSelectedDate]);

  const sortedMatches = useMemo(
    () => [...filteredMatches].sort((a, b) => {
      const ma = metricsMap.get(a.id) ?? NO_DATA;
      const mb = metricsMap.get(b.id) ?? NO_DATA;
      return scoutScore(b, mb) - scoutScore(a, ma);
    }),
    [filteredMatches, metricsMap]
  );

  useEffect(() => {
    if (!matchesReadyForSelectedDate || sortedMatches.length === 0) return;
    const requestId = loadSeq.current;
    let cancelled = false;
    const candidates = sortedMatches.slice(0, DETAIL_CONTEXT_PREFETCH_LIMIT);

    async function warmDetailContexts() {
      for (let i = 0; i < candidates.length; i += DETAIL_CONTEXT_PREFETCH_BATCH_SIZE) {
        if (cancelled || requestId !== loadSeq.current) return;
        const batch = candidates.slice(i, i + DETAIL_CONTEXT_PREFETCH_BATCH_SIZE);
        await Promise.allSettled(batch.map(m => {
          const key = `${selectedDateKey}:${m.leagueApiId}:${m.id}:${m.finished ? 'finished' : 'active'}`;
          if (warmedDetailContextsRef.current.has(key)) return Promise.resolve(null);
          warmedDetailContextsRef.current.add(key);
          if (m.leagueApiId === 203) {
            return preloadSuperLigMatchContext({
              eventId: String(m.id),
              homeTeamId: m.homeTeamId,
              awayTeamId: m.awayTeamId,
              home: m.home,
              away: m.away,
              silent: true,
            });
          }
          return preloadMatchContext(String(m.id), m.finished, { silent: true });
        }));
      }
    }

    void warmDetailContexts();
    return () => { cancelled = true; };
  }, [matchesReadyForSelectedDate, selectedDateKey, sortedMatches]);

  const featuredMatches = useMemo(() => {
    if (activeFilter !== 'Scout' || sortedMatches.length === 0) return sortedMatches;
    if (!featuredCacheLoaded || !matchesReadyForSelectedDate) return [];
    const cacheKey = `${selectedDateKey}:Scout`;
    const backendFeatured = sortedMatches.find(m => m.id === backendFeaturedMatchId);
    const cachedId = featuredMatchCache[cacheKey];
    const cached = sortedMatches.find(m => m.id === cachedId);
    const stableFeatured = backendFeatured || cached;
    if (!stableFeatured) return sortedMatches;
    return [stableFeatured, ...sortedMatches.filter(m => m.id !== stableFeatured.id)];
  }, [activeFilter, sortedMatches, backendFeaturedMatchId, selectedDateKey, featuredMatchCache, featuredCacheLoaded, matchesReadyForSelectedDate]);

  useEffect(() => {
    if (activeFilter !== 'Scout' || sortedMatches.length === 0) return;
    if (!featuredCacheLoaded || !matchesReadyForSelectedDate) return;
    const cacheKey = `${selectedDateKey}:Scout`;
    const backendFeatured = sortedMatches.find(m => m.id === backendFeaturedMatchId);
    if (featuredMatchCache[cacheKey] === backendFeatured?.id) return;
    if (!backendFeatured && featuredMatchCache[cacheKey]) return;
    const nextCache = { ...featuredMatchCache, [cacheKey]: (backendFeatured || sortedMatches[0]).id };
    setFeaturedMatchCache(nextCache);
    AsyncStorage.setItem(FEATURED_MATCH_CACHE_KEY, JSON.stringify(nextCache)).catch(() => {});
  }, [activeFilter, sortedMatches, backendFeaturedMatchId, selectedDateKey, featuredMatchCache, featuredCacheLoaded, matchesReadyForSelectedDate]);

  const listItems = useMemo<ListItem[]>(() => {
    const scoutMode = activeFilter === 'Scout' && featuredMatches.length > 0;
    const items: ListItem[] = [];
    if (activeFilter === 'Scout' && homeDataNotice === 'error' && featuredMatches.length === 0) {
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

      // Show weekly card always in Scout mode (placeholder if no picks yet)
      items.push({
        key: 'weekly-card',
        type: 'weekly-card',
        weeklyCorrect: weeklyAcc?.correct ?? 0,
        weeklyTotal: weeklyAcc?.total ?? 0,
        weeklyPct: weeklyAcc?.pct ?? 0,
        weeklyLabel: weeklyAcc?.label ?? getCurrentWeekRange().label,
        weeklyAllTotal: weeklyAcc?.allTotal ?? 0,
      });

      if (finished.length > 0) {
        items.push({ key: 'h-finished', type: 'section-header', title: 'TAMAMLANAN MAÇLAR' });
        finished.forEach(m => {
          items.push({ key: `fin-${m.id}`, type: 'match', m, metrics: metricsMap.get(m.id) ?? NO_DATA });
        });
      }

      if (upcoming.length > 0) {
        items.push({ key: 'h-upcoming', type: 'section-header', title: 'GÜNÜN KALAN MAÇLARI', sub: 'Scout skoruna göre sıralandı' });
        upcoming.forEach(m => {
          items.push({ key: `up-${m.id}`, type: 'match', m, metrics: metricsMap.get(m.id) ?? NO_DATA });
        });
      }
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
  }, [featuredMatches, sortedMatches, metricsMap, activeFilter, selectedDate, nextDayPreview, singleH2H, homeDataNotice, homeDataWarningText, weeklyAcc]);

  const goToMatch = useCallback((m: Match, metrics?: Metrics) => {
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
      void preloadSuperLigMatchContext({
        eventId: String(m.id),
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        home: m.home,
        away: m.away,
      });
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
    void preloadMatchContext(String(m.id), m.finished, { silent: true });
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
  }, [router]);

  const goToNextPreviewDate = useCallback(() => {
    if (!nextDayPreview) {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + 1);
      setSelectedDate(next);
      return;
    }
    const nextDate = new Date(nextDayPreview.m.utcDate);
    setSelectedDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()));
  }, [nextDayPreview, selectedDate]);

  const refreshSelectedDate = useCallback(() => {
    loadMatches(selectedDate);
    // loadMatches intentionally reads latest screen state while selectedDate is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const openLeagues = useCallback(() => {
    router.push('/leagues');
  }, [router]);

  const openStats = useCallback(() => {
    router.push('/stats');
  }, [router]);

  const openWeeklyPerformance = useCallback(() => {
    router.push('/scout_performance' as Parameters<typeof router.push>[0]);
  }, [router]);

  const openNextPreviewMatch = useCallback(() => {
    if (nextDayPreview) goToMatch(nextDayPreview.m, nextDayPreview.metrics);
  }, [goToMatch, nextDayPreview]);

  const keyExtractor = useCallback((item: ListItem) => item.key, []);
  const listContentStyle = useMemo(() => ({ paddingBottom: 16 }), []);

  const renderListItem = useCallback(({ item }: { item: ListItem }) => {
    switch (item.type) {
      case 'notice':
        return (
          <DataNoticeCard
            type={item.notice || 'error'}
            message={item.warningText}
            onRetry={item.notice === 'error' || item.notice === 'cache' ? refreshSelectedDate : undefined}
          />
        );
      case 'section-header':
        return (
          <View style={sc.sectionHeader}>
            <Text style={[sc.sectionTitle, { color: c.textMuted }]}>{item.title}</Text>
            {item.sub && <Text style={[sc.sectionSub, { color: c.textFaint }]}>{item.sub}</Text>}
          </View>
        );
      case 'hero': {
        const { m, metrics } = item;
        if (!m || !metrics) return null;
        return (
          <View style={styles.heroListItem}>
            <HeroCard m={m} metrics={metrics} onPress={() => goToMatch(m, metrics)} />
          </View>
        );
      }
      case 'highlight': {
        const { m, metrics, rank } = item;
        if (!m || !metrics || rank === undefined) return null;
        return <HighlightCard m={m} rank={rank} metrics={metrics} onPress={() => goToMatch(m, metrics)} />;
      }
      case 'day-summary':
        return item.summary ? <DaySummaryCard summary={item.summary} /> : null;
      case 'match': {
        const { m, metrics } = item;
        if (!m || !metrics) return null;
        return <MatchRow m={m} metrics={metrics} onPress={() => goToMatch(m, metrics)} />;
      }
      case 'single-insight': {
        const { m, metrics } = item;
        if (!m || !metrics) return null;
        return <SingleInsightCard m={m} metrics={metrics} />;
      }
      case 'single-trends': {
        const { m, metrics } = item;
        if (!m || !metrics) return null;
        return <SingleTrendsCard m={m} metrics={metrics} />;
      }
      case 'single-h2h':
        return <SingleH2HCard h2h={item.h2h || []} />;
      case 'tomorrow-featured': {
        const { m, metrics } = item;
        if (!m || !metrics) return null;
        return <TomorrowFeaturedCard m={m} metrics={metrics} onPress={() => goToMatch(m, metrics)} />;
      }
      case 'empty-scout':
        return (
          <EmptyScoutState
            selectedDate={selectedDate}
            preview={nextDayPreview}
            onNextDate={goToNextPreviewDate}
            onRefresh={refreshSelectedDate}
            onOpenLeagues={openLeagues}
            onOpenStats={openStats}
            onOpenMatch={openNextPreviewMatch}
            standingsMap={standingsMap}
          />
        );
      case 'weekly-card': {
        const { weeklyCorrect = 0, weeklyTotal = 0, weeklyPct = 0, weeklyLabel = '', weeklyAllTotal = 0 } = item;
        const pending = weeklyAllTotal - weeklyTotal;
        const hasResolved = weeklyTotal > 0;
        const isEmpty = weeklyAllTotal === 0;
        const barColor = weeklyPct >= 60 ? c.win : weeklyPct >= 40 ? '#B7791F' : c.loss;
        return (
          <TouchableOpacity onPress={openWeeklyPerformance} activeOpacity={0.82}>
            <View style={[sc.weeklyCard, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
              <View style={sc.weeklyCardTop}>
                <View style={sc.weeklyCardTitleRow}>
                  <Text style={sc.weeklyCardEmoji}>🏆</Text>
                  <Text style={[sc.weeklyCardTitle, { color: c.primary }]}>SCOUT PERFORMANSI</Text>
                </View>
                <Text style={[sc.weeklyCardChevron, { color: c.primary }]}>›</Text>
              </View>
              {isEmpty ? (
                <Text style={[sc.weeklyCardSub, { color: c.textSub }]}>
                  {weeklyLabel} — geçen hafta pick bulunamadı
                </Text>
              ) : hasResolved ? (
                <>
                  <View style={sc.weeklyCardRow}>
                    <View>
                      <Text style={[sc.weeklyCardScore, { color: c.text }]}>
                        {weeklyCorrect}<Text style={[sc.weeklyCardOf, { color: c.textMuted }]}>/{weeklyTotal}</Text>
                      </Text>
                      <Text style={[sc.weeklyCardSub, { color: c.textSub }]}>isabetli tahmin</Text>
                    </View>
                    <Text style={[sc.weeklyCardPct, { color: barColor }]}>%{weeklyPct}</Text>
                  </View>
                  <View style={[sc.weeklyBarBg, { backgroundColor: c.border }]}>
                    <View style={[sc.weeklyBarFill, { width: `${weeklyPct}%`, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[sc.weeklyCardSub, { color: c.textSub, marginTop: 6 }]}>
                    {weeklyLabel}{pending > 0 ? ` · ${pending} sonuç bekleniyor` : ''} · Tümünü Gör →
                  </Text>
                </>
              ) : (
                <>
                  <View style={sc.weeklyCardRow}>
                    <View>
                      <Text style={[sc.weeklyCardScore, { color: c.text }]}>{weeklyAllTotal}</Text>
                      <Text style={[sc.weeklyCardSub, { color: c.textSub }]}>pick kaydedildi</Text>
                    </View>
                    <Text style={[sc.weeklyCardPct, { color: c.textMuted }]}>⏳</Text>
                  </View>
                  <Text style={[sc.weeklyCardSub, { color: c.textSub, marginTop: 4 }]}>
                    {weeklyLabel} · Maçlar tamamlandıkça sonuçlar gelir · Tümünü Gör →
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        );
      }
      case 'empty':
        return (
          <EmptyStateCard
            icon="📅"
            title={matchListEmptyMessage(item.filter!)}
            subtitle="Farklı bir tarih veya lig filtresi seçebilirsin."
          />
        );
      default:
        return null;
    }
  }, [c.textFaint, c.textMuted, c.text, c.surface, c.win, c.loss, c.borderLight, goToMatch, goToNextPreviewDate, nextDayPreview, openLeagues, openNextPreviewMatch, openStats, openWeeklyPerformance, refreshSelectedDate, selectedDate, standingsMap]);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.topbar, { backgroundColor: c.surface }]}>
        <View style={styles.headerBrand}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        </View>
        <TouchableOpacity onPress={refreshSelectedDate} disabled={refreshing}>
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
        <RefreshStatusBar message={REFRESH_STATUS_MESSAGES.matches} />
      )}

      {loading || !featuredCacheLoaded || !matchesReadyForSelectedDate ? (
        <ScrollView style={styles.scroll} contentContainerStyle={listContentStyle}>
          <SkeletonSectionHeader />
          {[0, 1, 2].map(i => <SkeletonMatchCard key={i} />)}
          <SkeletonSectionHeader />
          {[3, 4, 5].map(i => <SkeletonMatchCard key={i} />)}
        </ScrollView>
      ) : (
        <FlatList
          style={styles.scroll}
          data={listItems}
          keyExtractor={keyExtractor}
          renderItem={renderListItem}
          contentContainerStyle={listContentStyle}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={40}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshSelectedDate}
              tintColor={c.primary}
              colors={[c.primary]}
            />
          }
        />
      )}

      <BottomTabBar activeTab="matches" />
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1 },
  offlineBanner:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1 },
  offlineBannerText:  { flex: 1, fontSize: 12 },
  offlineRetry:       { fontSize: 12, fontWeight: '700' },
  topbar:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8 },
  headerBrand:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo:         { width: 42, height: 42, resizeMode: 'contain' },
  appName:            { fontSize: 16, fontWeight: '600', color: '#00BAFF' },
  appNameBlue:        { color: '#2563EB' },
  refreshContent:     { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshBtn:         { fontSize: 13, color: '#185FA5' },
  dateRow:            { borderBottomWidth: 0.5, flexGrow: 0 },
  datePill:           { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, marginRight: 6, borderRadius: 10, borderWidth: 0.5, borderColor: '#eee', minWidth: 52 },
  datePillActive:     { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  dateDayName:        { fontSize: 11, marginBottom: 4 },
  dateDayNameActive:  { color: '#fff' },
  dateNum:            { fontSize: 18, fontWeight: '500' },
  dateNumActive:      { color: '#fff' },
  filterRow:          { maxHeight: 46, flexGrow: 0, borderBottomWidth: 0.5 },
  filterPill:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, borderColor: '#ccc' },
  filterPillActive:   { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  filterText:         { fontSize: 13 },
  filterTextActive:   { color: '#fff', fontWeight: '500' },
  scoutPill:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#185FA5' },
  scoutPillActive:    { backgroundColor: '#0C447C', borderColor: '#0C447C' },
  scoutPillText:      { fontSize: 13, color: '#185FA5', fontWeight: '700' },
  scoutPillTextActive:{ color: '#fff' },
  scroll:             { flex: 1 },
  heroListItem:       { paddingHorizontal: 14, marginBottom: 4 },
  loadingArea:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

const sc = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 },
  sectionTitle:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  sectionSub:    { fontSize: 10 },

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
  noticeCard:        { marginHorizontal: 14, marginTop: 12, marginBottom: 2, borderRadius: 10, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeText:        { flex: 1, fontSize: 12, lineHeight: 17 },
  noticeRetryBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, minHeight: 28 },
  noticeRetryText:   { fontSize: 12, fontWeight: '600' },
  emptyAction:    { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyActionIcon:{ width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyActionText:{ flex: 1, minWidth: 0 },
  emptyActionTitle:{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 5 },
  emptyActionBody:{ fontSize: 13, lineHeight: 18 },
  emptyNote:      { marginHorizontal: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1, padding: 14 },
  emptyNoteText:  { fontSize: 13, lineHeight: 19, marginTop: 9 },

  emptyFavCard:   { marginHorizontal: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center' },
  emptyFavLeft:   { flex: 1, minWidth: 0 },
  emptyFavName:   { fontSize: 15, fontWeight: '800' },
  emptyFavSub:    { fontSize: 12, marginTop: 3 },
  emptyFavRight:  { alignItems: 'flex-end', marginLeft: 12 },
  emptyFavPos:    { fontSize: 12, fontWeight: '600' },
  emptyFavPts:    { fontSize: 18, fontWeight: '800', marginTop: 2 },

  emptyLeadersCard:  { marginHorizontal: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  emptyLeaderRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  emptyLeaderFlag:   { fontSize: 17, width: 24, textAlign: 'center' },
  emptyLeaderMid:    { width: 80 },
  emptyLeaderLeague: { fontSize: 11, fontWeight: '600' },
  emptyLeaderGpg:    { fontSize: 10, marginTop: 1 },
  emptyLeaderTeam:   { flex: 1, fontSize: 13, fontWeight: '700' },
  emptyLeaderPts:    { fontSize: 13, fontWeight: '800' },

  hlCard:        { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, padding: 14, borderWidth: 1, borderLeftWidth: 3 },
  hlTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  hlRank:        { fontSize: 11, fontWeight: '700' },
  hlLeague:      { fontSize: 11 },
  hlTeams:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  hlTeam:        { flex: 1, fontSize: 14, fontWeight: '600' },
  hlTime:        { fontSize: 14, fontWeight: '700', paddingHorizontal: 8 },
  hlMetric:      { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  hlSummary:     { fontSize: 12, lineHeight: 17, marginTop: 2 },

  daySummary:      { marginHorizontal: 14, marginTop: 4, marginBottom: 4, padding: 14, borderRadius: 12, borderWidth: 1 },
  daySummaryTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  daySummaryText:  { fontSize: 13, lineHeight: 19 },

  matchCard:     { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, padding: 14, borderWidth: 1, elevation: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  matchTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  matchLeague:   { fontSize: 11, fontWeight: '600' },
  matchTime:     { fontSize: 12, fontWeight: '600' },
  scoreRow:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scoreText:     { fontSize: 13, fontWeight: '700' },
  scoreMs:       { fontSize: 10 },
  matchTeams:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  matchTeam:     { flex: 1, fontSize: 14, fontWeight: '600' },
  matchSep:      { paddingHorizontal: 8, fontSize: 14 },
  matchMetricLine:      { fontSize: 12, marginTop: 4 },
  matchMetricLineMuted: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },

  // Weekly performance card
  weeklyCard:        { marginHorizontal:14, marginBottom:10, borderRadius:14, padding:14, borderLeftWidth:4 },
  weeklyCardTop:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  weeklyCardTitleRow:{ flexDirection:'row', alignItems:'center', gap:6 },
  weeklyCardEmoji:   { fontSize:16 },
  weeklyCardTitle:   { fontSize:11, fontWeight:'800', letterSpacing:0.6 },
  weeklyCardChevron: { fontSize:22, fontWeight:'300' },
  weeklyCardRow:     { flexDirection:'row', alignItems:'flex-end', justifyContent:'space-between', marginBottom:10 },
  weeklyCardScore:   { fontSize:32, fontWeight:'800', lineHeight:36 },
  weeklyCardOf:      { fontSize:20, fontWeight:'600' },
  weeklyCardPct:     { fontSize:28, fontWeight:'800' },
  weeklyBarBg:       { height:7, borderRadius:4, overflow:'hidden' },
  weeklyBarFill:     { height:7, borderRadius:4 },
  weeklyCardSub:     { fontSize:11, lineHeight:15 },
});
