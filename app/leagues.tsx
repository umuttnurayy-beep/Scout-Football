import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import BottomTabBar from '../components/BottomTabBar';
import EmptyStateCard from '../components/EmptyStateCard';
import RefreshStatusBar, { REFRESH_STATUS_MESSAGES } from '../components/RefreshStatusBar';
import { SkeletonLeagueTable } from '../components/SkeletonLoader';
import TieCard from '../components/TieCard';
import { useTheme } from '../context/ThemeContext';
import { CURRENT_FOOTBALL_SEASON, DISPLAY_FOOTBALL_SEASON } from '../constants/seasons';
import { UCLKnockouts, getStandings, getSuperLigStandings, getUclKnockouts } from '../services/api';
import { isStanding } from '../services/apiNormalizers';
import { leagueDataEmptyMessage } from '../utils/emptyStates';
import scoutStyles, { cardShadow } from '../utils/scoutStyles';
import { tapLight } from '../services/haptics';
import { isArrayOf, readTimedCache, writeTimedCache } from '../utils/timedCache';
import {
  LeagueStanding,
  computeLeagueStats, getTagColor, getTeamLabel, getTeamPersonality, groupTies,
} from '../utils/leagueAnalysis';

const leagues = [
  { id: 1, apiId: 39,  name: 'Premier Lig', country: 'İngiltere', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 2, apiId: 140, name: 'La Liga',     country: 'İspanya',   flag: '🇪🇸' },
  { id: 3, apiId: 78,  name: 'Bundesliga',  country: 'Almanya',   flag: '🇩🇪' },
  { id: 4, apiId: 135, name: 'Serie A',     country: 'İtalya',    flag: '🇮🇹' },
  { id: 5, apiId: 61,  name: 'Ligue 1',     country: 'Fransa',    flag: '🇫🇷' },
  { id: 6, apiId: 2,   name: 'UCL',         country: 'Avrupa',    flag: '🌍' },
  { id: 7, apiId: 203, name: 'Süper Lig',   country: 'Türkiye',   flag: '🇹🇷' },
];

const configuredLeagues = leagues.map(league => ({
  ...league,
  season: DISPLAY_FOOTBALL_SEASON,
}));

const LEAGUE_STANDINGS_TTL = 60 * 60 * 1000;

function standingsCacheKey(apiId: number) {
  return `league_standings_v2_${apiId}`;
}

const UCL_STAGES = [
  { key: 'KNOCKOUT_ROUND_PLAY_OFF', label: 'Play-off'     },
  { key: 'ROUND_OF_16',             label: 'Son 16'       },
  { key: 'QUARTER_FINALS',          label: 'Çeyrek Final' },
  { key: 'SEMI_FINALS',             label: 'Yarı Final'   },
  { key: 'FINAL',                   label: 'Final'        },
];

const SUB_TABS = [
  { key: 'genel',    label: 'Genel'        },
  { key: 'tablo',    label: 'Puan Tablosu' },
  { key: 'takimlar', label: 'Takımlar'     },
  { key: 'trendler', label: 'Trendler'     },
] as const;
type SubTab = typeof SUB_TABS[number]['key'];

type League   = typeof configuredLeagues[0];
type Standing = LeagueStanding;

const TABLE_COLORS = {
  champions: '#185FA5',
  championsQual: '#3B82F6',
  europa: '#E6A817',
  europaQual: '#F97316',
  conference: '#27AE60',
  relegationPlayoff: '#8E1B13',
  relegation: '#C0392B',
};

function getBadgeStyle(pos: number, total: number, apiId: number) {
  if (apiId === 2) {
    if (pos <= 8) return styles.posTop;
    if (pos <= 24) return styles.posMid;
    return styles.posNormal;
  }
  if (apiId === 39) {
    if (pos <= 5) return styles.posTop;
    if (pos === 6) return styles.posMid;
    if (pos >= 18) return styles.posRel;
    return styles.posNormal;
  }
  if (apiId === 61) {
    if (pos <= 3) return styles.posTop;
    if (pos === 4) return styles.posUclQual;
    if (pos === 5) return styles.posMid;
    if (pos === 6) return styles.posConf;
    if (pos === 16) return styles.posRelPlayoff;
    if (pos >= 17) return styles.posRel;
    return styles.posNormal;
  }
  if (apiId === 203) {
    if (pos === 1) return styles.posTop;
    if (pos === 2) return styles.posUclQual;
    if (pos === 3) return styles.posEuropaQual;
    if (pos === 4) return styles.posConf;
    if (pos >= 16) return styles.posRel;
    return styles.posNormal;
  }
  if (apiId === 78) {
    if (pos <= 4) return styles.posTop;
    if (pos === 5) return styles.posMid;
    if (pos === 6) return styles.posConf;
    if (pos === 16) return styles.posRelPlayoff;
    if (pos >= 17) return styles.posRel;
    return styles.posNormal;
  }
  if (apiId === 140 || apiId === 135) {
    if (pos <= 4) return styles.posTop;
    if (pos === 5) return styles.posMid;
    if (pos === 6) return styles.posConf;
    if (pos >= 18) return styles.posRel;
    return styles.posNormal;
  }
  if (pos <= 4) return styles.posTop;
  if (pos === 5) return styles.posMid;
  if (pos === 6) return styles.posConf;
  return styles.posNormal;
}

function getLeagueLegend(apiId: number) {
  if (apiId === 2) {
    return [
      { color: TABLE_COLORS.champions, label: 'Direkt Son 16' },
      { color: TABLE_COLORS.europa, label: 'Play-off' },
    ];
  }
  if (apiId === 39) {
    return [
      { color: TABLE_COLORS.champions, label: 'Şampiyonlar Ligi' },
      { color: TABLE_COLORS.europa, label: 'Avrupa Ligi' },
      { color: TABLE_COLORS.relegation, label: 'Küme Düşme' },
    ];
  }
  if (apiId === 61) {
    return [
      { color: TABLE_COLORS.champions, label: 'Şampiyonlar Ligi' },
      { color: TABLE_COLORS.championsQual, label: 'Şampiyonlar Ligi Eleme' },
      { color: TABLE_COLORS.europa, label: 'Avrupa Ligi' },
      { color: TABLE_COLORS.conference, label: 'Konferans Ligi Eleme' },
      { color: TABLE_COLORS.relegationPlayoff, label: 'Küme Düşme Play-off' },
      { color: TABLE_COLORS.relegation, label: 'Küme Düşme' },
    ];
  }
  if (apiId === 203) {
    return [
      { color: TABLE_COLORS.champions, label: 'Şampiyonlar Ligi' },
      { color: TABLE_COLORS.championsQual, label: 'Şampiyonlar Ligi Eleme' },
      { color: TABLE_COLORS.europaQual, label: 'Avrupa Ligi Eleme' },
      { color: TABLE_COLORS.conference, label: 'Konferans Ligi Eleme' },
      { color: TABLE_COLORS.relegation, label: 'Küme Düşme' },
    ];
  }
  if (apiId === 78) {
    return [
      { color: TABLE_COLORS.champions, label: 'Şampiyonlar Ligi' },
      { color: TABLE_COLORS.europa, label: 'Avrupa Ligi' },
      { color: TABLE_COLORS.conference, label: 'Konferans Ligi Eleme' },
      { color: TABLE_COLORS.relegationPlayoff, label: 'Küme Düşme Play-off' },
      { color: TABLE_COLORS.relegation, label: 'Küme Düşme' },
    ];
  }
  return [
    { color: TABLE_COLORS.champions, label: 'Şampiyonlar Ligi' },
    { color: TABLE_COLORS.europa, label: 'Avrupa Ligi' },
    { color: TABLE_COLORS.conference, label: 'Konferans Ligi Eleme' },
    { color: TABLE_COLORS.relegation, label: 'Küme Düşme' },
  ];
}

const SL_TLA_BY_ID: Record<number, string> = {
  133804: 'GS',  133807: 'FB',  133794: 'BJK', 133796: 'TS',
  134589: 'IBB', 133797: 'SAM', 135891: 'GZT', 133885: 'RİZ',
  133835: 'KON', 138092: 'GFK', 133870: 'KOC', 135676: 'ALA',
  133799: 'ANT', 133798: 'GNB', 138977: 'EYP', 133802: 'KAY',
  138983: 'FKG', 133834: 'KSP', 133800: 'SİV', 137630: 'HAT',
  134199: 'ADS', 138094: 'ÜMR', 135534: 'PEN', 133879: 'SAK',
  139327: 'BDR', 139328: 'ÇRK',
};

function teamAbbrev(name: string, tla?: string, teamId?: number): string {
  if (teamId && SL_TLA_BY_ID[teamId]) return SL_TLA_BY_ID[teamId];
  if (tla && tla.length > 0) return tla.toUpperCase();
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words.map(w => w[0] || '').join('').slice(0, 3).toUpperCase();
}

const API_ID_TO_FD_ID: Record<number, number> = {
  39: 2021, 140: 2014, 78: 2002, 135: 2019, 61: 2015, 2: 2001, 203: 0,
};

type TeamSort  = 'puan' | 'scout' | 'hucum' | 'savunma' | 'alfa';
type TrendTab  = 'hucum' | 'savunma' | 'tempo' | 'beraberlik';

const TREND_TABS: { key: TrendTab; label: string; sub: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'hucum',      label: 'Hücum Gücü',       sub: 'Gol/Maç',         icon: 'football-outline'  },
  { key: 'savunma',    label: 'Savunma Direnci',   sub: 'Yenilen/Maç',     icon: 'shield-outline'    },
  { key: 'tempo',      label: 'Tempo Endeksi',     sub: 'Toplam Gol/Maç',  icon: 'flash-outline'     },
  { key: 'beraberlik', label: 'Beraberlik Eğilimi', sub: 'Maç Sonucu',     icon: 'remove-outline'    },
];

function getZoneBarColor(pos: number, apiId: number): string | null {
  if (apiId === 2) {
    if (pos <= 8)  return TABLE_COLORS.champions;
    if (pos <= 24) return TABLE_COLORS.europa;
    return null;
  }
  if (apiId === 39) {
    if (pos <= 5)  return TABLE_COLORS.champions;
    if (pos === 6) return TABLE_COLORS.europa;
    if (pos >= 18) return TABLE_COLORS.relegation;
    return null;
  }
  if (apiId === 61) {
    if (pos <= 3)   return TABLE_COLORS.champions;
    if (pos === 4)  return TABLE_COLORS.championsQual;
    if (pos === 5)  return TABLE_COLORS.europa;
    if (pos === 6)  return TABLE_COLORS.conference;
    if (pos === 16) return TABLE_COLORS.relegationPlayoff;
    if (pos >= 17)  return TABLE_COLORS.relegation;
    return null;
  }
  if (apiId === 203) {
    if (pos === 1)  return TABLE_COLORS.champions;
    if (pos === 2)  return TABLE_COLORS.championsQual;
    if (pos === 3)  return TABLE_COLORS.europaQual;
    if (pos === 4)  return TABLE_COLORS.conference;
    if (pos >= 16)  return TABLE_COLORS.relegation;
    return null;
  }
  if (apiId === 78) {
    if (pos <= 4)   return TABLE_COLORS.champions;
    if (pos === 5)  return TABLE_COLORS.europa;
    if (pos === 6)  return TABLE_COLORS.conference;
    if (pos === 16) return TABLE_COLORS.relegationPlayoff;
    if (pos >= 17)  return TABLE_COLORS.relegation;
    return null;
  }
  if (apiId === 140 || apiId === 135) {
    if (pos <= 4)   return TABLE_COLORS.champions;
    if (pos === 5)  return TABLE_COLORS.europa;
    if (pos === 6)  return TABLE_COLORS.conference;
    if (pos >= 18)  return TABLE_COLORS.relegation;
    return null;
  }
  if (pos <= 4)   return TABLE_COLORS.champions;
  if (pos === 5)  return TABLE_COLORS.europa;
  if (pos === 6)  return TABLE_COLORS.conference;
  return null;
}

// ── SCREEN ────────────────────────────────────────────────────

export default function LeaguesScreen() {
  const { colors: c, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const router    = useRouter();
  const pagerRef  = useRef<ScrollView>(null);
  const [activeLeague, setActiveLeague] = useState<League>(configuredLeagues[0]);
  const [subTab, setSubTab]             = useState<SubTab>('genel');
  const [uclView, setUclView]           = useState<'standings' | 'bracket'>('standings');
  const [activeStage, setActiveStage]   = useState(UCL_STAGES[1].key);
  const [standings, setStandings]               = useState<Standing[]>([]);
  const [knockouts, setKnockouts]               = useState<UCLKnockouts | null>(null);
  const [loading, setLoading]                   = useState(false);
  const [refreshing, setRefreshing]             = useState(false);
  const [loadError, setLoadError]               = useState(false);
  const [knockoutsLoading, setKnockoutsLoading] = useState(false);
  const [knockoutsLoadError, setKnockoutsLoadError] = useState(false);
  const [teamSearch, setTeamSearch]     = useState('');
  const [teamSort, setTeamSort]         = useState<TeamSort>('puan');
  const [trendTab, setTrendTab]         = useState<TrendTab>('hucum');
  const [trendExpanded, setTrendExpanded] = useState(false);

  function goToTab(key: SubTab) {
    tapLight();
    const idx = SUB_TABS.findIndex(t => t.key === key);
    setSubTab(key);
    pagerRef.current?.scrollTo({ x: idx * screenWidth, animated: true });
  }

  useEffect(() => {
    setSubTab('genel');
    pagerRef.current?.scrollTo({ x: 0, animated: false });
    setUclView('standings');
    setLoadError(false);
    setKnockoutsLoadError(false);
    loadStandings(activeLeague.apiId);
    if (activeLeague.apiId === 2) loadKnockouts();
  }, [activeLeague]);

  async function onRefresh() {
    setRefreshing(true);
    setLoadError(false);
    setKnockoutsLoadError(false);
    try {
      await loadStandings(activeLeague.apiId, false);
      if (activeLeague.apiId === 2) await loadKnockouts(false);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadStandings(apiId: number, showLoader = true) {
    if (showLoader) setLoading(true);
    setLoadError(false);
    const cacheKey = standingsCacheKey(apiId);
    const cached = await readTimedCache(cacheKey, LEAGUE_STANDINGS_TTL, isArrayOf(isStanding));
    if (cached && cached.length > 0) {
      setStandings(cached);
      if (showLoader) setLoading(false);
    }
    try {
      const data = apiId === 203
        ? await getSuperLigStandings()
        : await getStandings(apiId, { silent: Boolean(cached?.length) });
      if (data && data.length > 0) {
        setStandings(data);
        writeTimedCache(cacheKey, data);
      } else if (!cached?.length) {
        setStandings([]);
        setLoadError(true);
      }
    } catch {
      if (!cached?.length) {
        setStandings([]);
        setLoadError(true);
      }
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function loadKnockouts(showLoader = true) {
    if (showLoader) setKnockoutsLoading(true);
    setKnockoutsLoadError(false);
    try {
      const data = await getUclKnockouts(CURRENT_FOOTBALL_SEASON);
      setKnockouts(data);
    } catch {
      setKnockouts(null);
      setKnockoutsLoadError(true);
    } finally {
      if (showLoader) setKnockoutsLoading(false);
    }
  }

  const retryStandings = useCallback(() => loadStandings(activeLeague.apiId), [activeLeague.apiId]);
  const retryKnockouts = useCallback(() => loadKnockouts(), []);
  const showUclStandings = useCallback(() => setUclView('standings'), []);
  const showUclBracket = useCallback(() => setUclView('bracket'), []);

  const groupedTies = useMemo(
    () => knockouts ? groupTies(knockouts[activeStage] || []) : [],
    [knockouts, activeStage],
  );

  const standingsByGf    = useMemo(() => [...standings].sort((a, b) => b.gf - a.gf), [standings]);
  const standingsAlpha   = useMemo(() => [...standings].sort((a, b) => a.team.localeCompare(b.team, 'tr')), [standings]);

  const {
    totalGames, totalGoals, avgGoals, leader, leaderGap, drawRate,
    ligChar, leaderNarr, avgLeagueGfPer, avgLeagueGaPer,
    attackScore, defenseScore,
    attackPower, defPower,
    goalScore, tempoScore, compScore, surpriseScore,
    mostGoals, bestDef, mostTempo, bestWinRate, surpriseTeam, liderTags,
  } = useMemo(() => computeLeagueStats(standings, isDark), [standings, isDark]);

  const sortedTeams = useMemo(() => {
    let list = [...standings];
    if (teamSearch.trim()) {
      const q = teamSearch.toLowerCase();
      list = list.filter(r => r.team.toLowerCase().includes(q));
    }
    switch (teamSort) {
      case 'scout':   return list.sort((a, b) => ((attackScore(b) + defenseScore(b)) / 2) - ((attackScore(a) + defenseScore(a)) / 2));
      case 'hucum':   return list.sort((a, b) => attackScore(b)  - attackScore(a));
      case 'savunma': return list.sort((a, b) => defenseScore(b) - defenseScore(a));
      case 'alfa':    return list.sort((a, b) => a.team.localeCompare(b.team, 'tr'));
      default:        return list;
    }
  }, [standings, teamSearch, teamSort, attackScore, defenseScore]);

  const teamTagMap = useMemo(() => {
    const map = new Map<string, { label: string; bg: string; color: string }>();
    const blue   = { bg: isDark ? 'rgba(88,166,255,0.13)' : '#E6F1FB', color: isDark ? '#58A6FF' : '#185FA5' };
    const green  = { bg: isDark ? 'rgba(63,185,80,0.13)'  : '#E8F8F0', color: isDark ? '#3FB950' : '#27500A' };
    const orange = { bg: isDark ? 'rgba(230,168,23,0.13)' : '#FFF3E0', color: isDark ? '#E6A817' : '#B37800' };
    const purple = { bg: isDark ? 'rgba(139,92,246,0.13)' : '#F3E8FF', color: isDark ? '#A78BFA' : '#6D28D9' };
    const red    = { bg: isDark ? 'rgba(248,81,73,0.13)'  : '#FFF0F0', color: isDark ? '#F85149' : '#A32D2D' };
    if (mostGoals)                                         map.set(mostGoals.team,    { ...blue,   label: 'En golcü'        });
    if (bestDef)                                           map.set(bestDef.team,      { ...green,  label: 'En iyi savunma'  });
    if (mostTempo && !map.has(mostTempo.team))             map.set(mostTempo.team,    { ...orange, label: 'En tempolu'      });
    if (bestWinRate && !map.has(bestWinRate.team))         map.set(bestWinRate.team,  { ...purple, label: 'En formda'       });
    if (surpriseTeam && !map.has(surpriseTeam.team))       map.set(surpriseTeam.team, { ...red,    label: 'Sürpriz'         });
    return map;
  }, [mostGoals, bestDef, mostTempo, bestWinRate, surpriseTeam, isDark]);

  const trendProfiles = useMemo(() => {
    const withRates = standings.map(r => ({
      ...r,
      gfPer:    r.played > 0 ? r.gf / r.played : 0,
      gaPer:    r.played > 0 ? r.ga / r.played : 0,
      tempoPer: r.played > 0 ? (r.gf + r.ga) / r.played : 0,
      drawPer:  r.played > 0 ? r.draw / r.played : 0,
    }));

    const attackTop = [...withRates].sort((a, b) => b.gfPer - a.gfPer).slice(0, 10);
    const defTop    = [...withRates].sort((a, b) => a.gaPer - b.gaPer).slice(0, 10);
    const tempoTop  = [...withRates].sort((a, b) => b.tempoPer - a.tempoPer).slice(0, 10);
    const drawTop   = [...withRates].sort((a, b) => b.drawPer - a.drawPer).slice(0, 10);
    const maxDef    = defTop[defTop.length - 1]?.gaPer || 1;
    const minDef    = defTop[0]?.gaPer || 0;

    return {
      attackTop,
      defTop,
      tempoTop,
      drawTop,
      maxAtk: attackTop[0]?.gfPer || 1,
      maxDef,
      defRange: maxDef - minDef || 1,
      maxTempo: tempoTop[0]?.tempoPer || 1,
      maxDraw: drawTop[0]?.drawPer || 1,
    };
  }, [standings]);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.topbar, { backgroundColor: c.surface }]}>
        <View style={styles.headerBrand}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={styles.appName}><Text style={styles.appNameBlue}>Scout</Text>Football</Text>
        </View>
        <Text style={[styles.pageTitle, { color: c.textMuted }]}>Ligler</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.leagueNav, { borderBottomColor: c.border, backgroundColor: c.surface }]}
        contentContainerStyle={styles.leagueNavContent}>
        {configuredLeagues.map(l => (
          <TouchableOpacity key={l.id}
            style={[styles.leaguePill, { borderColor: c.border }, activeLeague.id === l.id && styles.leaguePillActive]}
            onPress={() => { tapLight(); setActiveLeague(l); }}>
            <Text style={styles.leagueFlag}>{l.flag}</Text>
            <Text style={[styles.leaguePillText, { color: c.textMuted }, activeLeague.id === l.id && styles.leaguePillTextActive]}>{l.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[styles.leagueHeader, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <Text style={styles.leagueHeaderFlag}>{activeLeague.flag}</Text>
        <View style={styles.flexOne}>
          <Text style={[styles.leagueHeaderName, { color: c.text }]}>{activeLeague.name}</Text>
          <Text style={[styles.leagueHeaderSub, { color: c.textMuted }]}>{activeLeague.country} · {activeLeague.season}</Text>
        </View>
        {ligChar && (
          <View style={[stStyles.ligCharBadge, { backgroundColor: ligChar.bg }]}>
            <Text style={[stStyles.ligCharBadgeText, { color: ligChar.color }]}>{ligChar.label}</Text>
          </View>
        )}
      </View>

      <View style={[stStyles.subTabBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={[stStyles.subTabTrack, { backgroundColor: c.surfaceAlt }]}>
          {SUB_TABS.map(t => {
            const isActive = subTab === t.key;
            return (
              <TouchableOpacity key={t.key}
                style={[stStyles.subTabPill, isActive && { backgroundColor: c.surface }]}
                onPress={() => goToTab(t.key)}
                activeOpacity={0.75}>
                <Text style={[stStyles.subTabText, { color: isActive ? c.primary : c.textMuted }, isActive && stStyles.subTabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {refreshing && !loading && (
        <RefreshStatusBar message={REFRESH_STATUS_MESSAGES.leagues} />
      )}

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          const tab = SUB_TABS[idx]?.key;
          if (tab) setSubTab(tab);
        }}
        style={styles.scroll}
      >
        {/* ===== PAGE 0: GENEL ===== */}
        <ScrollView
          style={[styles.page, { width: screenWidth }]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
        >
        {loading ? (
          <View style={styles.stateFrame}>
            <SkeletonLeagueTable />
          </View>
        ) : (
          <>
            {true && (
              standings.length === 0 ? (
                <View style={styles.stateFrame}>
                  <EmptyStateCard
                    icon="wifi-outline"
                    title={loadError ? 'Lig verisi yüklenemedi' : 'Veri bulunamadı'}
                    subtitle={leagueDataEmptyMessage(activeLeague.name)}
                    onRetry={retryStandings}
                  />
                </View>
              ) : (
                <>
                  {/* ── HERO ── */}
                  <View style={[genStyles.hero, { backgroundColor: isDark ? '#0D2F4F' : '#0C447C' }]}>
                    <Text style={genStyles.heroCountry}>{activeLeague.flag}  {activeLeague.country.toUpperCase()} · {activeLeague.season}</Text>
                    <Text style={genStyles.heroName}>{activeLeague.name.toUpperCase()}</Text>
                    {ligChar && <Text style={genStyles.heroOzet} numberOfLines={2}>{ligChar.ozet}</Text>}
                    {ligChar && (
                      <View style={genStyles.heroStyleRow}>
                        <View style={genStyles.heroStylePill}>
                          <Text style={genStyles.heroStyleText}>{ligChar.stil}</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* ── LİG DNA ── */}
                  {ligChar && (() => {
                    const surpriseLvl = (surpriseScore >= 60 ? 'Yüksek' : surpriseScore >= 35 ? 'Orta' : 'Düşük') as 'Yüksek' | 'Orta' | 'Düşük';
                    const dnaItems = [
                      { icon: 'flash-outline' as const,    label: 'TEMPO',       value: ligChar.tempo, sub: `${tempoScore}/100` },
                      { icon: 'shield-outline' as const,   label: 'RİSK',        value: ligChar.risk,  sub: `${compScore}/100`  },
                      { icon: 'football-outline' as const, label: 'GOL PROFİLİ', value: ligChar.gol,   sub: `${avgGoals.toFixed(1)} / maç` },
                      { icon: 'shuffle-outline' as const,  label: 'SÜRPRİZ',     value: surpriseLvl,   sub: `${surpriseScore}/100` },
                    ];
                    return (
                      <>
                        <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>LİG DNA</Text>
                        {[dnaItems.slice(0, 2), dnaItems.slice(2, 4)].map((row, ri) => (
                          <View key={ri} style={[genStyles.dnaRow, ri === 0 && { marginBottom: 8 }]}>
                            {row.map((item, i) => {
                              const tc = getTagColor(item.value, isDark);
                              return (
                                <View key={i} style={[genStyles.dnaCard, { backgroundColor: c.surface }]}>
                                  <Ionicons name={item.icon} size={18} color={tc.color} />
                                  <Text style={[genStyles.dnaLabel, { color: c.textMuted }]}>{item.label}</Text>
                                  <Text style={[genStyles.dnaValue, { color: tc.color }]}>{item.value}</Text>
                                  <Text style={[genStyles.dnaSub, { color: c.textFaint }]}>{item.sub}</Text>
                                </View>
                              );
                            })}
                          </View>
                        ))}
                      </>
                    );
                  })()}

                  {/* ── LİDER ── */}
                  {leader && (
                    <>
                      <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>LİDER</Text>
                      <View style={[genStyles.leaderCard, { backgroundColor: c.surface, borderColor: c.cardBorder }]}>
                        <View style={genStyles.leaderTopRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Ionicons name="trophy" size={13} color={c.amber} />
                            <Text style={[genStyles.leaderBadgeText, { color: c.amber }]}>LİDER</Text>
                          </View>
                          {leaderGap > 0 && (
                            <View style={[genStyles.leaderGapPill, { backgroundColor: c.primaryLight }]}>
                              <Text style={[genStyles.leaderGapText, { color: c.primary }]}>+{leaderGap} puan önde</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[genStyles.leaderTeamName, { color: c.text }]}>{leader.team}</Text>
                        <Text style={[genStyles.leaderNarr, { color: c.textSub }]}>{leaderNarr}</Text>
                        {liderTags.length > 0 && (
                          <View style={genStyles.tagRow}>
                            {liderTags.map((t, i) => (
                              <View key={i} style={[genStyles.tag, { backgroundColor: t.bg }]}>
                                <Text style={[genStyles.tagText, { color: t.color }]}>{t.label}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        <View style={[genStyles.leaderStatsRow, { borderTopColor: c.border }]}>
                          {[
                            { v: leader.pts.toString(), l: 'Puan' },
                            { v: `${Math.round(leader.win / Math.max(leader.played, 1) * 100)}%`, l: 'Galibiyet' },
                            { v: leader.gf.toString(), l: 'Gol' },
                            { v: leader.ga.toString(), l: 'Yenilen' },
                          ].map(s => (
                            <View key={s.l} style={genStyles.leaderStat}>
                              <Text style={[genStyles.leaderStatVal, { color: c.primary }]}>{s.v}</Text>
                              <Text style={[genStyles.leaderStatLbl, { color: c.textMuted }]}>{s.l}</Text>
                            </View>
                          ))}
                        </View>
                        <View style={[genStyles.powerRow, { borderTopColor: c.border }]}>
                          <View style={genStyles.powerItem}>
                            <Text style={[genStyles.powerLbl, { color: c.textMuted }]}>Hücum Gücü</Text>
                            <Text style={[genStyles.powerVal, { color: c.primary }]}>{attackPower.toFixed(2)}/10</Text>
                          </View>
                          <View style={[genStyles.powerDiv, { backgroundColor: c.border }]} />
                          <View style={genStyles.powerItem}>
                            <Text style={[genStyles.powerLbl, { color: c.textMuted }]}>Savunma Gücü</Text>
                            <Text style={[genStyles.powerVal, { color: c.primary }]}>{defPower.toFixed(2)}/10</Text>
                          </View>
                        </View>
                      </View>
                    </>
                  )}

                  {/* ── ÖNE ÇIKAN PROFİLLER ── */}
                  {(mostGoals || bestDef || mostTempo || bestWinRate) && (() => {
                    const profiles = [
                      mostGoals   ? { icon: 'football-outline' as const,    label: 'En Golcü',        team: mostGoals,    stat: `${(mostGoals.gf / Math.max(mostGoals.played, 1)).toFixed(1)} gol/maç` }       : null,
                      bestDef     ? { icon: 'shield-outline' as const,      label: 'En İyi Savunma',  team: bestDef,      stat: `${(bestDef.ga / Math.max(bestDef.played, 1)).toFixed(1)} yenilen/maç` }     : null,
                      mostTempo   ? { icon: 'flash-outline' as const,       label: 'En Tempolu',      team: mostTempo,    stat: `${((mostTempo.gf + mostTempo.ga) / Math.max(mostTempo.played, 1)).toFixed(1)} gol/maç` } : null,
                      bestWinRate ? { icon: 'trending-up-outline' as const, label: 'En Formda',       team: bestWinRate,  stat: `${Math.round(bestWinRate.win / Math.max(bestWinRate.played, 1) * 100)}% galibiyet` } : null,
                    ].filter((x): x is NonNullable<typeof x> => x !== null);
                    return (
                      <>
                        <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>ÖNE ÇIKAN PROFİLLER</Text>
                        {[profiles.slice(0, 2), profiles.slice(2, 4)].map((row, ri) => (
                          <View key={ri} style={[genStyles.dnaRow, ri === 0 && { marginBottom: 8 }]}>
                            {row.map((p, i) => (
                              <View key={i} style={[genStyles.profileCard, { backgroundColor: c.surface }]}>
                                <View style={[genStyles.profileIconWrap, { backgroundColor: c.primaryLight }]}>
                                  <Ionicons name={p.icon} size={16} color={c.primary} />
                                </View>
                                <Text style={[genStyles.profileLabel, { color: c.textMuted }]}>{p.label}</Text>
                                <Text style={[genStyles.profileTeam, { color: c.text }]} numberOfLines={1}>{p.team.team}</Text>
                                <Text style={[genStyles.profileStat, { color: c.primary }]}>{p.stat}</Text>
                              </View>
                            ))}
                            {row.length < 2 && <View style={{ flex: 1 }} />}
                          </View>
                        ))}
                      </>
                    );
                  })()}

                  {/* ── DİĞER ÖNEMLİ VERİLER ── */}
                  <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>DİĞER ÖNEMLİ VERİLER</Text>
                  <View style={genStyles.statsRow}>
                    {[
                      { val: totalGoals.toString(),             lbl: 'Toplam Gol' },
                      { val: avgGoals.toFixed(2),               lbl: 'Gol/Maç'   },
                      { val: Math.round(totalGames).toString(), lbl: 'Toplam Maç' },
                    ].map(s => (
                      <View key={s.lbl} style={[genStyles.statCard, { backgroundColor: c.surface }]}>
                        <Text style={[genStyles.statBig, { color: c.text }]}>{s.val}</Text>
                        <Text style={[genStyles.statSub, { color: c.textMuted }]}>{s.lbl}</Text>
                      </View>
                    ))}
                  </View>

                  {/* ── GOL VERİMLİLİĞİ ── */}
                  {(() => {
                    const sorted = standingsByGf;
                    const maxGf = sorted[0]?.gf || 1;
                    return (
                      <>
                        <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>GOL VERİMLİLİĞİ</Text>
                        <Text style={[genStyles.effSubtitle, { color: c.textFaint }]}>En fazla gol atan takımlar (100 birim üzerinden)</Text>
                        <View style={[genStyles.effCard, { backgroundColor: c.surface }]}>
                          {sorted.slice(0, 8).map((row, i) => {
                            const ratio = row.gf / maxGf;
                            const isTop = i === 0;
                            const barCol = isTop ? c.primary : i < 3 ? c.textSub : c.textMuted;
                            return (
                              <View key={i} style={[genStyles.effRow, i > 0 && { borderTopColor: c.borderLight, borderTopWidth: 0.5 }]}>
                                <Text style={[genStyles.effRank, { color: isTop ? c.primary : c.textMuted }]}>{i + 1}</Text>
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <Text style={[genStyles.effTeam, { color: c.text }]} numberOfLines={1}>{row.team}</Text>
                                    <Text style={[genStyles.effVal, { color: isTop ? c.primary : c.textSub }]}>{row.gf}</Text>
                                  </View>
                                  <View style={[genStyles.effBarBg, { backgroundColor: c.border }]}>
                                    <View style={[genStyles.effBarFill, { width: `${ratio * 100}%`, backgroundColor: barCol }]} />
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </>
                    );
                  })()}

                  {/* ── BU LİGDE NE OYNANIR? ── */}
                  {ligChar && (
                    <>
                      <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>BU LİGDE NE OYNANIR?</Text>
                      <View style={[genStyles.insightCard, { backgroundColor: c.surface }]}>
                        {[
                          {
                            ok: avgGoals >= 2.3,
                            title: `Gol ort. ${avgGoals.toFixed(1)}/maç`,
                            desc: avgGoals >= 2.8 ? 'Over 2.5 eğilimi güçlü' : avgGoals >= 2.3 ? 'Orta gol beklentisi' : 'Alt 2.5 eğilimi baskın',
                          },
                          {
                            ok: leaderGap >= 6,
                            title: leaderGap >= 8 ? 'Favoriler genelde kazanıyor' : leaderGap >= 4 ? 'Favoriler avantajlı' : 'Favoriler her zaman kazanamıyor',
                            desc: leaderGap >= 6 ? 'Lider farkı belirgin' : 'Rekabet çok yüksek',
                          },
                          {
                            ok: drawRate < 0.28,
                            title: `Beraberlik oranı %${Math.round(drawRate * 100)}`,
                            desc: drawRate >= 0.28 ? 'Yüksek, çift şans değerli' : 'Düşük, net sonuçlar baskın',
                          },
                          { ok: true, title: 'Maç bazında değerlendirme yapılmalı', desc: ligChar.rec },
                        ].map((b, i) => (
                          <View key={i} style={[genStyles.insightRow, i > 0 && { borderTopColor: c.borderLight, borderTopWidth: 0.5 }]}>
                            <View style={[genStyles.insightIconWrap, { backgroundColor: b.ok ? (isDark ? 'rgba(63,185,80,0.15)' : '#E8F8F0') : (isDark ? 'rgba(227,179,65,0.15)' : '#FFF8E1') }]}>
                              <Ionicons name={b.ok ? 'checkmark' : 'warning-outline'} size={13} color={b.ok ? c.win : c.amber} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[genStyles.insightTitle, { color: c.text }]}>{b.title}</Text>
                              <Text style={[genStyles.insightDesc, { color: c.textMuted }]}>{b.desc}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </>
              )
            )}

          </>
        )}
        <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* ===== PAGE 1: PUAN TABLOSU ===== */}
        <ScrollView style={[styles.page, { width: screenWidth }]} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        {loading ? (
          <View style={styles.stateFrame}><SkeletonLeagueTable /></View>
        ) : (
          <>
            {true && (
              <>
                {activeLeague.apiId === 2 && (
                  <View style={[styles.uclToggle, { borderColor: c.border }]}>
                    <TouchableOpacity
                      style={[styles.uclToggleBtn, uclView === 'standings' && styles.uclToggleBtnActive]}
                      onPress={showUclStandings}>
                      <Text style={[styles.uclToggleText, { color: c.textMuted }, uclView === 'standings' && styles.uclToggleTextActive]}>Puan Tablosu</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.uclToggleBtn, uclView === 'bracket' && styles.uclToggleBtnActive]}
                      onPress={showUclBracket}>
                      <Text style={[styles.uclToggleText, { color: c.textMuted }, uclView === 'bracket' && styles.uclToggleTextActive]}>Eşleşmeler</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {activeLeague.apiId === 2 && uclView === 'bracket' && (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      style={[styles.stageNav, { borderBottomColor: c.border }]} contentContainerStyle={styles.stageNavContent}>
                      {UCL_STAGES.map(s => (
                        <TouchableOpacity key={s.key}
                          style={[styles.stagePill, { borderColor: c.border }, activeStage === s.key && styles.stagePillActive]}
                          onPress={() => setActiveStage(s.key)}>
                          <Text style={[styles.stagePillText, { color: c.textMuted }, activeStage === s.key && styles.stagePillTextActive]}>
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {knockoutsLoading ? (
                      <View style={styles.stateFrame}>
                        <SkeletonLeagueTable />
                      </View>
                    ) : knockoutsLoadError ? (
                      <View style={styles.stateFrame}>
                        <EmptyStateCard icon="wifi-outline" title="Eşleşme verisi yüklenemedi" onRetry={retryKnockouts} />
                      </View>
                    ) : knockouts == null ? (
                      <View style={styles.stateFrame}>
                        <EmptyStateCard icon="trophy-outline" title="UCL eşleşme verisi bulunamadı" onRetry={retryKnockouts} />
                      </View>
                    ) : (knockouts[activeStage] || []).length === 0 ? (
                      <View style={styles.stateFrame}>
                        <EmptyStateCard icon="trophy-outline" title="Bu tura ait veri bulunamadı" onRetry={retryKnockouts} />
                      </View>
                    ) : (
                      groupedTies.map((tie, i) => (
                        <TieCard key={i} tie={tie} isFinal={activeStage === 'FINAL'} />
                      ))
                    )}
                  </>
                )}

                {(activeLeague.apiId !== 2 || uclView === 'standings') && (
                  standings.length === 0 ? (
                    <View style={styles.stateFrame}>
                      <EmptyStateCard
                        icon="wifi-outline"
                        title={loadError ? 'Puan tablosu yüklenemedi' : 'Veri bulunamadı'}
                        subtitle={leagueDataEmptyMessage(activeLeague.name)}
                        onRetry={retryStandings}
                      />
                    </View>
                  ) : (
                    <>
                      {/* ── İSTATİSTİK ŞERİDİ ── */}
                      {(() => {
                        const totalPlayed = standings.reduce((s, r) => s + r.played, 0);
                        const totalWins   = standings.reduce((s, r) => s + r.win, 0);
                        const winPct      = totalPlayed > 0 ? Math.round(totalWins / totalPlayed * 100) : 0;
                        return (
                          <View style={stStyles.standStatStrip}>
                            {[
                              { val: avgGoals.toFixed(2), lbl: 'Gol / Maç\nOrtalama' },
                              { val: `${Math.round(drawRate * 100)}%`, lbl: 'Beraberlik\nOrtalama' },
                              { val: `${winPct}%`, lbl: 'Galibiyet\nOrtalama' },
                              { val: `${surpriseScore}%`, lbl: 'Sürpriz Sonuç\nOrtalama' },
                            ].map(s => (
                              <View key={s.lbl} style={[stStyles.standStatCard, { backgroundColor: c.surface }]}>
                                <Text style={[stStyles.standStatVal, { color: c.text }]}>{s.val}</Text>
                                <Text style={[stStyles.standStatLbl, { color: c.textMuted }]}>{s.lbl}</Text>
                              </View>
                            ))}
                          </View>
                        );
                      })()}

                      {/* ── LİG İÇGÖRÜSÜ ── */}
                      {(() => {
                        const compLabel = compScore >= 70 ? 'Çok çekişmeli' : compScore >= 50 ? 'Rekabetçi' : 'Belirgin favori';
                        const compOk    = compScore >= 50;
                        const goalTrend = avgGoals >= 2.8 ? 'Yüksek' : avgGoals >= 2.3 ? 'Stabil' : 'Düşük';
                        const goalOk    = avgGoals >= 2.3;
                        // Küme düşme hattı: 3. sonuncunun 4. sonuncuya puan farkı ne kadar dar?
                        const safetyPts    = standings.length >= 4 ? standings[standings.length - 4]?.pts ?? 0 : 0;
                        const thirdLastPts = standings.length >= 4 ? standings[standings.length - 3]?.pts ?? 0 : 0;
                        const relGap       = safetyPts - thirdLastPts;
                        const relLabel     = relGap <= 3 ? 'Kritik' : relGap <= 7 ? 'Sıkı' : 'Rahat';
                        const relOk        = relGap > 7;
                        const relWarn      = relGap <= 3;
                        const insights = [
                          { icon: 'trophy-outline'       as const, label: 'Şampiyonluk',    value: compLabel, ok: compOk,  warn: false   },
                          { icon: 'stats-chart-outline'  as const, label: 'Gol trendi',      value: goalTrend, ok: goalOk,  warn: false   },
                          { icon: 'warning-outline'      as const, label: 'Küme düşme hattı',value: relLabel,  ok: relOk,   warn: relWarn },
                        ];
                        return (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}
                            style={stStyles.insightBarScroll}
                            contentContainerStyle={stStyles.insightBarContent}>
                            <View style={[stStyles.insightBarBrain, { backgroundColor: c.primaryLight }]}>
                              <Ionicons name="analytics-outline" size={16} color={c.primary} />
                              <Text style={[stStyles.insightBarBrainText, { color: c.primary }]}>{'LİG\nİÇGÖRÜSÜ'}</Text>
                            </View>
                            {insights.map((item, idx) => (
                              <View key={idx} style={[stStyles.insightBarItem, { backgroundColor: c.surface }]}>
                                <Ionicons name={item.icon} size={14} color={item.warn ? c.loss : item.ok ? c.win : c.amber} style={{ marginBottom: 3 }} />
                                <Text style={[stStyles.insightBarLabel, { color: c.textMuted }]}>{item.label}</Text>
                                <Text style={[stStyles.insightBarValue, { color: item.warn ? c.loss : item.ok ? c.win : c.amber }]}>{item.value}</Text>
                              </View>
                            ))}
                          </ScrollView>
                        );
                      })()}

                      {/* ── TABLO ── */}
                      <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>PUAN TABLOSU</Text>
                      <View style={[styles.tableHeader, { backgroundColor: c.surfaceAlt, borderBottomColor: c.border, paddingLeft: 16 }]}>
                        <Text style={[styles.rankCell, { color: c.textMuted }]}>#</Text>
                        <Text style={[styles.teamCell, { color: c.textMuted }]}>Takım</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>O</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>G</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>B</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>M</Text>
                        <Text style={[styles.dataCell, { color: c.textMuted }]}>AG</Text>
                        <Text style={[styles.dataCell, { color: c.primary, fontWeight: '600' }]}>P</Text>
                      </View>
                      {standings.map((row, i) => {
                        const zoneColor = getZoneBarColor(row.pos, activeLeague.apiId);
                        const teamTag   = teamTagMap.get(row.team);
                        return (
                          <View key={i} style={[stStyles.standRow, i < standings.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderLight }]}>
                            <View style={[stStyles.zoneBar, { backgroundColor: zoneColor ?? 'transparent' }]} />
                            <View style={[styles.posBadge, getBadgeStyle(row.pos, standings.length, activeLeague.apiId)]}>
                              <Text style={styles.posText}>{row.pos}</Text>
                            </View>
                            <View style={stStyles.teamInfoCol}>
                              <Text style={[stStyles.teamNameMain, { color: c.text }]} numberOfLines={1}>{row.team}</Text>
                              {teamTag && (
                                <View style={[stStyles.teamTagPill, { backgroundColor: teamTag.bg }]}>
                                  <Text style={[stStyles.teamTagText, { color: teamTag.color }]} numberOfLines={1}>{teamTag.label}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.played}</Text>
                            <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.win}</Text>
                            <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.draw}</Text>
                            <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.loss}</Text>
                            <Text style={[styles.dataCell, { color: c.textMuted }]}>{row.gf - row.ga > 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</Text>
                            <Text style={[styles.dataCell, { color: c.primary, fontWeight: '600' }]}>{row.pts}</Text>
                          </View>
                        );
                      })}
                      <View style={styles.legendBox}>
                        {getLeagueLegend(activeLeague.apiId).map(item => (
                          <View key={item.label} style={styles.legendRow}>
                            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                            <Text style={[styles.legendText, { color: c.textMuted }]}>{item.label}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )
                )}
              </>
            )}
          </>
        )}
        <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* ===== PAGE 2: TAKIMLAR ===== */}
        <ScrollView style={[styles.page, { width: screenWidth }]} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {loading ? (
          <View style={styles.stateFrame}><SkeletonLeagueTable /></View>
        ) : standings.length === 0 ? (
          <View style={styles.stateFrame}>
            <EmptyStateCard
              icon="people-outline"
              title={loadError ? 'Takım verisi yüklenemedi' : 'Veri bulunamadı'}
              subtitle={leagueDataEmptyMessage(activeLeague.name)}
              onRetry={retryStandings}
            />
          </View>
        ) : (
          <>
            {/* ── STATS ŞERİDİ ── */}
            {(() => {
              const totalPlayed = standings.reduce((s, r) => s + r.played, 0);
              const totalWins   = standings.reduce((s, r) => s + r.win, 0);
              const winPct      = totalPlayed > 0 ? Math.round(totalWins / totalPlayed * 100) : 0;
              return (
                <View style={stStyles.standStatStrip}>
                  {[
                    { val: standings.length.toString(), lbl: 'Takım\nLig genelinde' },
                    { val: avgGoals.toFixed(2),         lbl: 'Gol/Maç\nLig ortalaması' },
                    { val: `${winPct}%`,                lbl: 'Galibiyet\nOrtalama' },
                    { val: `${surpriseScore}%`,         lbl: 'Sürpriz Sonuç\nYüksek' },
                  ].map(s => (
                    <View key={s.lbl} style={[stStyles.standStatCard, { backgroundColor: c.surface }]}>
                      <Text style={[stStyles.standStatVal, { color: c.text }]}>{s.val}</Text>
                      <Text style={[stStyles.standStatLbl, { color: c.textMuted }]}>{s.lbl}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* ── ARAMA + SIRALAMA ── */}
            <View style={stStyles.tkSearchRow}>
              <View style={[stStyles.tkSearchBox, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Ionicons name="search-outline" size={14} color={c.textMuted} />
                <TextInput
                  style={[stStyles.tkSearchInput, { color: c.text }]}
                  placeholder="Takım ara..."
                  placeholderTextColor={c.textFaint}
                  value={teamSearch}
                  onChangeText={setTeamSearch}
                />
                {teamSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setTeamSearch('')}>
                    <Ionicons name="close-circle" size={14} color={c.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={stStyles.tkSortRow}>
              {([
                { key: 'puan',    label: 'Puan'        },
                { key: 'scout',   label: 'Scout Rating' },
                { key: 'hucum',   label: 'Hücum'       },
                { key: 'savunma', label: 'Savunma'     },
                { key: 'alfa',    label: 'Alfabetik'   },
              ] as { key: TeamSort; label: string }[]).map(opt => (
                <TouchableOpacity key={opt.key}
                  style={[stStyles.tkSortPill, { borderColor: c.border, backgroundColor: teamSort === opt.key ? c.primary : c.surface }]}
                  onPress={() => { tapLight(); setTeamSort(opt.key); }}>
                  <Text style={[stStyles.tkSortPillText, { color: teamSort === opt.key ? '#fff' : c.textMuted }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ── KARTLAR ── */}
            {sortedTeams.length === 0 ? (
              <View style={styles.stateFrame}>
                <EmptyStateCard icon="search-outline" title="Eşleşen takım bulunamadı" />
              </View>
            ) : sortedTeams.map((row, i) => {
              const atkS      = attackScore(row);
              const defS      = defenseScore(row);
              const scoutR    = ((atkS + defS) / 2).toFixed(1);
              const zoneColor = getZoneBarColor(row.pos, activeLeague.apiId);
              const teamTag   = teamTagMap.get(row.team);
              const abbr      = teamAbbrev(row.team, (row as any).tla, (row as any).teamId);
              const totalGames = Math.max(row.win + row.draw + row.loss, 1);
              const fdId      = API_ID_TO_FD_ID[activeLeague.apiId] ?? 0;
              return (
                <TouchableOpacity key={i} activeOpacity={0.75}
                  onPress={() => {
                    tapLight();
                    router.push({
                      pathname: '/team_stats',
                      params: {
                        teamId:      (row as any).teamId || (row as any).id || 0,
                        teamName:    row.team,
                        leagueName:  activeLeague.name,
                        leagueFlag:  activeLeague.flag,
                        fdId,
                        apiId:       activeLeague.apiId,
                        pos:         row.pos,
                        played:      row.played,
                        win:         row.win,
                        draw:        row.draw,
                        loss:        row.loss,
                        gf:          row.gf,
                        ga:          row.ga,
                        pts:         row.pts,
                        scoutRating: ((atkS + defS) / 2).toFixed(1),
                        tla:         (row as any).tla || '',
                      },
                    });
                  }}>
                  <View style={[stStyles.tkNewCard, { backgroundColor: c.surface }]}>
                    {/* Sol bölge barı */}
                    <View style={[stStyles.zoneBar, { backgroundColor: zoneColor ?? 'transparent' }]} />

                    {/* Pozisyon badge */}
                    <View style={[styles.posBadge, getBadgeStyle(row.pos, standings.length, activeLeague.apiId), { marginRight: 10 }]}>
                      <Text style={styles.posText}>{row.pos}</Text>
                    </View>

                    {/* Takım bilgisi */}
                    <View style={stStyles.tkNewTeamCol}>
                      <Text style={[stStyles.tkNewAbbr, { color: c.text }]}>{abbr}</Text>
                      <Text style={[stStyles.tkNewName, { color: c.textMuted }]} numberOfLines={1}>{row.team}</Text>
                      {teamTag && (
                        <View style={[stStyles.teamTagPill, { backgroundColor: teamTag.bg, marginTop: 4 }]}>
                          <Text style={[stStyles.teamTagText, { color: teamTag.color }]}>{teamTag.label}</Text>
                        </View>
                      )}
                    </View>

                    {/* Scout Rating + Puan */}
                    <View style={stStyles.tkNewCenter}>
                      <Text style={[stStyles.tkNewBigNum, { color: c.primary }]}>{scoutR}</Text>
                      <Text style={[stStyles.tkNewSmallLbl, { color: c.textFaint }]}>Scout{'\n'}Rating</Text>
                      <View style={[stStyles.tkNewDivider, { backgroundColor: c.borderLight }]} />
                      <Text style={[stStyles.tkNewBigNum, { color: c.text }]}>{row.pts}</Text>
                      <Text style={[stStyles.tkNewSmallLbl, { color: c.textFaint }]}>Puan</Text>
                    </View>

                    {/* Hücum + Savunma + W-D-L bar */}
                    <View style={stStyles.tkNewRight}>
                      <Text style={[stStyles.tkNewPowerLbl, { color: c.textMuted }]}>Hücum</Text>
                      <Text style={[stStyles.tkNewPowerVal, { color: c.primary }]}>{atkS.toFixed(2)}/10</Text>
                      <Text style={[stStyles.tkNewPowerLbl, { color: c.textMuted, marginTop: 5 }]}>Savunma</Text>
                      <Text style={[stStyles.tkNewPowerVal, { color: c.primary }]}>{defS.toFixed(2)}/10</Text>
                      <View style={[stStyles.tkNewWDLBar, { marginTop: 7 }]}>
                        <View style={{ flex: row.win / totalGames,  backgroundColor: c.win,         borderRadius: 1.5 }} />
                        <View style={{ flex: row.draw / totalGames, backgroundColor: c.borderLight,  borderRadius: 1.5 }} />
                        <View style={{ flex: row.loss / totalGames, backgroundColor: c.loss,         borderRadius: 1.5 }} />
                      </View>
                      <Text style={[stStyles.tkNewWDLLbl, { color: c.textFaint }]}>{row.win}G {row.draw}B {row.loss}M</Text>
                    </View>

                    {/* Chevron */}
                    <Ionicons name="chevron-forward" size={14} color={c.textVeryFaint} style={{ marginLeft: 4 }} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
        <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* ===== PAGE 3: TRENDLER ===== */}
        <ScrollView style={[styles.page, { width: screenWidth }]} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        {loading ? (
          <View style={styles.stateFrame}><SkeletonLeagueTable /></View>
        ) : standings.length === 0 ? (
          <View style={styles.stateFrame}>
            <EmptyStateCard
              icon="stats-chart-outline"
              title={loadError ? 'Trend verisi yüklenemedi' : 'Veri bulunamadı'}
              subtitle={leagueDataEmptyMessage(activeLeague.name)}
              onRetry={retryStandings}
            />
          </View>
        ) : (
          <>
            {/* ── LEAGUE PULSE ── */}
            <View style={[trStyles.pulsCard, { backgroundColor: isDark ? '#0D2038' : '#EBF5FF', borderColor: c.primary }]}>
              <View style={trStyles.pulsHeader}>
                <Ionicons name="pulse" size={13} color={c.primary} />
                <Text style={[trStyles.pulsTitle, { color: c.primary }]}>LEAGUE PULSE</Text>
                <Text style={[trStyles.pulsSubTitle, { color: c.textMuted }]}>Sezon genel trend özeti</Text>
              </View>
              <View style={trStyles.pulsRow}>
                {[
                  { label: 'GOL/MAÇ',  val: avgGoals.toFixed(2),                                                                 sub: 'Lig ortalaması', color: c.primary },
                  { label: 'TEMPO',    val: avgGoals >= 2.8 ? 'YÜKSEK' : avgGoals >= 2.3 ? 'ORTA' : 'DÜŞÜK',                   sub: 'Seviyesi',       color: c.amber },
                  { label: 'REKABET',  val: `${compScore}/100`,                                                                   sub: 'Endeks',         color: isDark ? '#A78BFA' : '#8B5CF6' },
                  { label: 'SÜRPRIZ',  val: `${surpriseScore}%`,                                                                  sub: 'Oran',           color: c.win },
                ].map((item, i) => (
                  <View key={i} style={[trStyles.pulsItem, i > 0 && { borderLeftWidth: 0.5, borderLeftColor: c.border }]}>
                    <Text style={[trStyles.pulsVal, { color: item.color }]}>{item.val}</Text>
                    <Text style={[trStyles.pulsLabel, { color: c.textMuted }]}>{item.label}</Text>
                    <Text style={[trStyles.pulsSub2, { color: c.textFaint }]}>{item.sub}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── FİLTRE TAB BARI ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={trStyles.trendTabContent}>
              {TREND_TABS.map(tab => {
                const active = trendTab === tab.key;
                return (
                  <TouchableOpacity key={tab.key}
                    style={[trStyles.trendTab, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primaryLight : c.surface }]}
                    onPress={() => { tapLight(); setTrendTab(tab.key); setTrendExpanded(false); }}>
                    <Ionicons name={tab.icon} size={13} color={active ? c.primary : c.textMuted} />
                    <View>
                      <Text style={[trStyles.trendTabLabel, { color: active ? c.primary : c.text }]}>{tab.label}</Text>
                      <Text style={[trStyles.trendTabSub, { color: c.textMuted }]}>{tab.sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ── AKTİF BÖLÜM ── */}
            {(() => {
              type TrendRow = { abbr: string; team: string; ratio: number; val: string; color: string };
              let title = '', subtitle = '', ligOrt = '', insightMain = '', insightWhy = '';
              let barColor = c.primary;
              let rows: TrendRow[] = [];

              if (trendTab === 'hucum') {
                title = 'HÜCUM GÜCÜ (GOL/MAÇ)';
                subtitle = 'Maç başı en fazla gol atan takımlar';
                ligOrt = `Lig ort.: ${avgLeagueGfPer.toFixed(2)}`;
                barColor = c.primary;
                const top = trendProfiles.attackTop[0];
                insightMain = top ? `${top.team} maç başı ${top.gfPer.toFixed(1)} golle ligin hücum motorunu temsil ediyor.` : '';
                insightWhy  = 'Yüksek hücum gücü, 2.5 üst ve KG-var senaryolarında güçlü bir ipucu sunar.';
                rows = trendProfiles.attackTop.map((r, i) => ({
                  abbr: teamAbbrev(r.team, (r as any).tla, r.teamId), team: r.team,
                  ratio: r.gfPer / trendProfiles.maxAtk,
                  val: r.gfPer.toFixed(2),
                  color: i === 0 ? c.primary : i < 3 ? c.textSub : c.textMuted,
                }));
              } else if (trendTab === 'savunma') {
                title = 'SAVUNMA DİRENCİ (YENİLEN/MAÇ)';
                subtitle = 'En az gol yiyen takımlar — düşük değer daha iyi';
                ligOrt = `Lig ort.: ${avgLeagueGaPer.toFixed(2)}`;
                barColor = c.win;
                const top = trendProfiles.defTop[0];
                insightMain = top ? `${top.team} maç başı yalnızca ${top.gaPer.toFixed(1)} gol yiyor — ligin en sağlam savunması.` : '';
                insightWhy  = 'Az gol yiyen takımlar, alt 2.5 ve kale sıfır senaryolarında güvenilir referanslardır.';
                rows = trendProfiles.defTop.map((r, i) => ({
                  abbr: teamAbbrev(r.team, (r as any).tla, r.teamId), team: r.team,
                  ratio: (trendProfiles.maxDef - r.gaPer) / trendProfiles.defRange,
                  val: r.gaPer.toFixed(2),
                  color: i === 0 ? c.win : i < 3 ? c.textSub : c.textMuted,
                }));
              } else if (trendTab === 'tempo') {
                title = 'TEMPO ENDEKSİ (TOPLAM GOL/MAÇ)';
                subtitle = 'Maçlarında en fazla toplam gol oynanan takımlar';
                ligOrt = `Lig ort.: ${avgGoals.toFixed(2)}`;
                barColor = c.amber;
                const top = trendProfiles.tempoTop[0];
                insightMain = top ? `${top.team} maçları bu ligde en heyecanlı seyrediyor — maç başı ${top.tempoPer.toFixed(1)} toplam gol.` : '';
                insightWhy  = 'Toplam gol ortalaması, over/alt kararlarının en doğrudan göstergesidir.';
                rows = trendProfiles.tempoTop.map((r, i) => ({
                  abbr: teamAbbrev(r.team, (r as any).tla, r.teamId), team: r.team,
                  ratio: r.tempoPer / trendProfiles.maxTempo,
                  val: r.tempoPer.toFixed(2),
                  color: i === 0 ? c.amber : i < 3 ? c.textSub : c.textMuted,
                }));
              } else {
                title = 'BERABERLİK EĞİLİMİ';
                subtitle = 'En fazla beraberlikle biten maç oynayan takımlar';
                ligOrt = `Lig ort.: ${Math.round(drawRate * 100)}%`;
                barColor = c.textSub;
                const top = trendProfiles.drawTop[0];
                insightMain = top ? `${top.team} bu sezon en sık beraberlik oynayan takım — ${top.draw} kez eşit bitti.` : '';
                insightWhy  = 'Beraberlik eğilimi yüksek takımlar çift ihtimal senaryolarında öne çıkar.';
                rows = trendProfiles.drawTop.map((r, i) => ({
                  abbr: teamAbbrev(r.team, (r as any).tla, r.teamId), team: r.team,
                  ratio: r.drawPer / trendProfiles.maxDraw,
                  val: r.draw.toString(),
                  color: i === 0 ? c.textSub : i < 3 ? c.textMuted : c.textVeryFaint,
                }));
              }

              const visibleRows = trendExpanded ? rows : rows.slice(0, 5);

              return (
                <View style={trStyles.sectionWrap}>
                  {/* Bölüm başlığı + Lig ort. */}
                  <View style={trStyles.sectionHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={[trStyles.sectionTitle, { color: c.text }]}>{title}</Text>
                      <Text style={[trStyles.sectionSub, { color: c.textMuted }]}>{subtitle}</Text>
                    </View>
                    <Text style={[trStyles.ligOrt, { color: barColor }]}>{ligOrt}</Text>
                  </View>

                  {/* AI Insight */}
                  {insightMain ? (
                    <View style={[trStyles.aiBox, { backgroundColor: isDark ? '#0D2038' : '#EBF5FF', borderColor: c.primary }]}>
                      <View style={trStyles.aiBoxHeader}>
                        <Text style={{ fontSize: 11, color: c.primary }}>✧</Text>
                        <Text style={[trStyles.aiBoxLabel, { color: c.primary }]}>AI INSIGHT</Text>
                      </View>
                      <Text style={[trStyles.aiBoxMain, { color: c.text }]}>{insightMain}</Text>
                      <Text style={[trStyles.aiBoxWhy, { color: c.textSub }]}>{insightWhy}</Text>
                    </View>
                  ) : null}

                  {/* Satır listesi */}
                  <View style={[trStyles.rowCard, { backgroundColor: c.surface }]}>
                    {visibleRows.map((row, i) => (
                      <View key={i} style={[trStyles.trendRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderLight }]}>
                        <Text style={[trStyles.trendRank, { color: row.color }]}>{i + 1}</Text>
                        <View style={trStyles.trendTeamCol}>
                          <Text style={[trStyles.trendAbbr, { color: row.color }]}>{row.abbr}</Text>
                          <Text style={[trStyles.trendTeamName, { color: c.textMuted }]} numberOfLines={1}>{row.team}</Text>
                        </View>
                        <View style={[trStyles.trendBarWrap, { backgroundColor: c.border }]}>
                          <View style={[trStyles.trendBarFill, { width: `${Math.max(row.ratio * 100, 2)}%` as any, backgroundColor: row.color }]} />
                        </View>
                        <Text style={[trStyles.trendVal, { color: row.color }]}>{row.val}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Genişlet / Daralt */}
                  {!trendExpanded && rows.length > 5 && (
                    <TouchableOpacity style={[trStyles.showAllBtn, { backgroundColor: c.surface }]}
                      onPress={() => { tapLight(); setTrendExpanded(true); }}>
                      <Text style={[trStyles.showAllText, { color: c.primary }]}>Tüm takımları göster</Text>
                      <Ionicons name="chevron-forward" size={13} color={c.primary} />
                    </TouchableOpacity>
                  )}
                  {trendExpanded && rows.length > 5 && (
                    <TouchableOpacity style={[trStyles.showAllBtn, { backgroundColor: c.surface }]}
                      onPress={() => { tapLight(); setTrendExpanded(false); }}>
                      <Text style={[trStyles.showAllText, { color: c.textMuted }]}>Daha az göster</Text>
                      <Ionicons name="chevron-up" size={13} color={c.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}
          </>
        )}
        <View style={styles.bottomSpacer} />
        </ScrollView>

      </ScrollView>

      <BottomTabBar activeTab="leagues" />
    </View>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1 },
  topbar:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8 },
  headerBrand:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo:          { width: 42, height: 42, resizeMode: 'contain' },
  appName:             { fontSize: 16, fontWeight: '600', color: '#00BAFF' },
  appNameBlue:         { color: '#2563EB' },
  pageTitle:           { fontSize: 13 },
  leagueNav:           { maxHeight: 48, borderBottomWidth: 0.5 },
  leagueNavContent:    { paddingHorizontal: 14 },
  leaguePill:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, marginRight: 6, borderRadius: 20, borderWidth: 0.5, gap: 4 },
  leaguePillActive:    { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  leagueFlag:          { fontSize: 14 },
  leaguePillText:      { fontSize: 12 },
  leaguePillTextActive:{ color: '#fff' },
  scroll:              { flex: 1 },
  page:                { flex: 1 },
  flexOne:             { flex: 1 },
  bottomSpacer:        { height: 30 },
  stateFrame:          { minHeight: 360, justifyContent: 'flex-start' },
  leagueHeader:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5 },
  leagueHeaderFlag:    { fontSize: 32 },
  leagueHeaderName:    { fontSize: 16, fontWeight: '500' },
  leagueHeaderSub:     { fontSize: 12, marginTop: 2 },
  emptyText:           { textAlign: 'center', marginTop: 40, fontSize: 13 },
  tableHeader:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5 },
  tableRow:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  tableRowAlt:         {},
  rankCell:            { fontSize: 11, width: 28, textAlign: 'center' },
  teamCell:            { flex: 1, fontSize: 11 },
  dataCell:            { fontSize: 11, width: 28, textAlign: 'center' },
  teamNameCell:        { flex: 1, fontSize: 13, fontWeight: '500' },
  posBadge:            { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  posTop:              { backgroundColor: TABLE_COLORS.champions },
  posUclQual:          { backgroundColor: TABLE_COLORS.championsQual },
  posMid:              { backgroundColor: TABLE_COLORS.europa },
  posEuropaQual:       { backgroundColor: TABLE_COLORS.europaQual },
  posConf:             { backgroundColor: TABLE_COLORS.conference },
  posRelPlayoff:       { backgroundColor: TABLE_COLORS.relegationPlayoff },
  posRel:              { backgroundColor: TABLE_COLORS.relegation },
  posNormal:           { backgroundColor: '#888' },
  posText:             { fontSize: 11, fontWeight: '700', color: '#fff' },
  legendBox:           { marginHorizontal: 14, marginTop: 12, gap: 6 },
  legendRow:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot:           { width: 10, height: 10, borderRadius: 2 },
  legendText:          { fontSize: 12 },
  uclToggle:           { flexDirection: 'row', marginHorizontal: 14, marginVertical: 10, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  uclToggleBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center' },
  uclToggleBtnActive:  { backgroundColor: '#185FA5' },
  uclToggleText:       { fontSize: 13, fontWeight: '500' },
  uclToggleTextActive: { color: '#fff', fontWeight: '600' },
  stageNav:            { maxHeight: 44, borderBottomWidth: 0.5 },
  stageNavContent:     { paddingHorizontal: 14, gap: 6 },
  stagePill:           { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 0.5, marginRight: 6 },
  stagePillActive:     { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  stagePillText:       { fontSize: 12 },
  stagePillTextActive: { color: '#fff', fontWeight: '500' },
  effSubtitle:         { fontSize: 11, paddingHorizontal: 14, marginBottom: 6, marginTop: -4 },
  effRow:              { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 0.5, gap: 8 },
  effRank:             { width: 22, fontSize: 12, fontWeight: '700', textAlign: 'center', paddingTop: 1 },
  effBarRow:           { flexDirection: 'row', alignItems: 'center', gap: 6 },
  effTeam:             { width: 110, fontSize: 12, fontWeight: '500' },
  effBarWrap:          { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', alignSelf: 'center' },
  effBarFill:          { height: '100%', borderRadius: 5 },
  effGoals:            { width: 28, fontSize: 12, fontWeight: '700', textAlign: 'right', alignSelf: 'center' },
  effLabel:            { fontSize: 9, marginTop: 3, paddingLeft: 2 },
});

const stStyles = StyleSheet.create({
  subTabBar:        { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5 },
  subTabTrack:      { flexDirection: 'row', borderRadius: 10, padding: 3 },
  subTabPill:       { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  subTabText:       { fontSize: 12 },
  subTabTextActive: { fontWeight: '600' },
  summaryCard:      { margin: 14, padding: 14, borderRadius: 12 },
  summaryRow:       { flexDirection: 'row', marginBottom: 10 },
  summaryStat:      { flex: 1, alignItems: 'center' },
  summaryVal:       { fontSize: 20, fontWeight: '700' },
  summaryLbl:       { fontSize: 11, marginTop: 3 },
  summaryNote:      { fontSize: 11, lineHeight: 16, borderTopWidth: 0.5, paddingTop: 10 },
  leaderCard:       { marginHorizontal: 14, marginBottom: 6, padding: 14, borderRadius: 12, borderLeftWidth: 3 },
  leaderTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  leaderBadge:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  leaderGap:        { fontSize: 11, fontWeight: '600' },
  leaderTeam:       { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  leaderNarr:       { fontSize: 12, fontStyle: 'italic', marginBottom: 10, lineHeight: 17 },
  liderTagRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  liderTag:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  liderTagText:     { fontSize: 11, fontWeight: '600' },
  leaderStats:      { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: 10 },
  leaderStat:       { flex: 1, alignItems: 'center' },
  leaderStatV:      { fontSize: 16, fontWeight: '600' },
  leaderStatL:      { fontSize: 10, marginTop: 2 },
  leaderPowerRow:   { flexDirection: 'row', borderTopWidth: 0.5, marginTop: 10, paddingTop: 10 },
  leaderPower:      { flex: 1, alignItems: 'center' },
  leaderPowerDiv:   { width: 0.5 },
  leaderPowerLbl:   { fontSize: 10, marginBottom: 3 },
  leaderPowerVal:   { fontSize: 16, fontWeight: '700' },
  topRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, gap: 8 },
  topTeam:          { flex: 1, fontSize: 13, fontWeight: '500' },
  topDetail:        { fontSize: 11 },
  topPts:           { fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  trendNote:        { marginHorizontal: 14, marginTop: 10, marginBottom: 4, padding: 10, borderRadius: 8 },
  trendNoteText:    { fontSize: 12, textAlign: 'center' },
  tkCard:           { marginHorizontal: 14, marginBottom: 8, padding: 12, borderRadius: 10 },
  tkCardTop:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tkName:           { flex: 1, fontSize: 13, fontWeight: '600' },
  tkLabel:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  tkLabelText:      { fontSize: 11, fontWeight: '600' },
  tkPersonality:    { fontSize: 11, fontStyle: 'italic', marginBottom: 8, lineHeight: 16 },
  tkPowerRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tkPowerText:      { fontSize: 11, fontWeight: '500' },
  tkPowerVal:       { fontWeight: '700' },
  tkPowerDot:       { paddingHorizontal: 6 },
  tkStats:          { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: 8 },
  tkStat:           { flex: 1, alignItems: 'center' },
  tkStatV:          { fontSize: 14, fontWeight: '600' },
  tkStatL:          { fontSize: 10, marginTop: 2 },
  ligCharCard:      { marginHorizontal: 14, marginTop: 6, marginBottom: 6, padding: 14, borderRadius: 12, borderLeftWidth: 3 },
  ligCharBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  ligCharBadgeText: { fontSize: 12, fontWeight: '700' },
  ligCharTraits:    { gap: 4, marginBottom: 12 },
  ligCharTrait:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  ligCharTraitDot:  { fontSize: 14, lineHeight: 18 },
  ligCharTraitText: { fontSize: 12, lineHeight: 18, flex: 1 },
  scoutScoreRow:    { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: 12, marginBottom: 12 },
  scoutScoreItem:   { flex: 1, alignItems: 'center' },
  scoutScoreVal:    { fontSize: 20, fontWeight: '700' },
  scoutScoreLbl:    { fontSize: 10, marginTop: 2 },
  scoutRecBox:      { borderRadius: 8, padding: 10, borderTopWidth: 0.5 },
  scoutRecLabel:    { fontSize: 10, fontWeight: '600', letterSpacing: 0.4, marginBottom: 3 },
  scoutRecText:     { fontSize: 12, lineHeight: 17 },
  profileRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, gap: 10 },
  profileIconWrap:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  profileLabel:     { fontSize: 10, fontWeight: '500', marginBottom: 2 },
  profileTeam:      { fontSize: 13, fontWeight: '600' },
  profileInsight:   { fontSize: 10, marginTop: 3, lineHeight: 14, fontStyle: 'italic' },
  profileStat:      { fontSize: 11, fontWeight: '600', textAlign: 'right', maxWidth: 110, paddingTop: 2 },
  insightBox:       { marginHorizontal: 14, marginBottom: 10, padding: 11, borderRadius: 8, borderLeftWidth: 3, alignSelf: 'stretch' },
  insightText:      { width: '100%', flexShrink: 1, flexWrap: 'wrap', fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  insightWhy:       { fontSize: 11, marginTop: 5, lineHeight: 16 },
  standStatStrip:   { flexDirection: 'row', gap: 7, paddingHorizontal: 14, marginTop: 10, marginBottom: 6 },
  standStatCard:    { flex: 1, padding: 9, borderRadius: 10, alignItems: 'center' },
  standStatVal:     { fontSize: 17, fontWeight: '800', marginBottom: 2 },
  standStatLbl:     { fontSize: 9, textAlign: 'center', lineHeight: 12 },
  insightBarScroll: { marginBottom: 2 },
  insightBarContent:{ paddingHorizontal: 14, gap: 8, paddingVertical: 8, flexDirection: 'row', alignItems: 'stretch' },
  insightBarBrain:  { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  insightBarBrainText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, lineHeight: 13 },
  insightBarItem:   { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, minWidth: 110, alignItems: 'flex-start' },
  insightBarLabel:  { fontSize: 10, marginBottom: 3 },
  insightBarValue:  { fontSize: 12, fontWeight: '700' },
  standRow:         { flexDirection: 'row', alignItems: 'center', paddingRight: 12, paddingVertical: 9 },
  zoneBar:          { width: 3, alignSelf: 'stretch', marginRight: 9, borderRadius: 1.5 },
  teamInfoCol:      { flex: 1, marginRight: 3 },
  teamNameMain:     { fontSize: 13, fontWeight: '500' },
  teamTagPill:      { alignSelf: 'flex-start', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, marginTop: 3 },
  teamTagText:      { fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },
  tkSearchRow:      { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  tkSearchBox:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 12, paddingVertical: 9 },
  tkSearchInput:    { flex: 1, fontSize: 13, padding: 0 },
  tkSortRow:        { paddingHorizontal: 14, gap: 7, paddingBottom: 10, flexDirection: 'row' },
  tkSortPill:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 0.5 },
  tkSortPillText:   { fontSize: 11, fontWeight: '600' },
  tkNewCard:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 8, borderRadius: 12, paddingVertical: 12, paddingRight: 10, overflow: 'hidden' },
  tkNewTeamCol:     { flex: 1, marginRight: 8 },
  tkNewAbbr:        { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, lineHeight: 25 },
  tkNewName:        { fontSize: 10, lineHeight: 13, marginTop: 1 },
  tkNewCenter:      { alignItems: 'center', width: 58, gap: 2 },
  tkNewBigNum:      { fontSize: 17, fontWeight: '800' },
  tkNewSmallLbl:    { fontSize: 8, textAlign: 'center', lineHeight: 11 },
  tkNewDivider:     { height: 0.5, width: 30, marginVertical: 5 },
  tkNewRight:       { width: 82, alignItems: 'flex-end' },
  tkNewPowerLbl:    { fontSize: 9 },
  tkNewPowerVal:    { fontSize: 11, fontWeight: '700' },
  tkNewWDLBar:      { flexDirection: 'row', height: 3, width: '100%', borderRadius: 1.5, overflow: 'hidden', gap: 1 },
  tkNewWDLLbl:      { fontSize: 8, marginTop: 3 },
});

const trStyles = StyleSheet.create({
  pulsCard:        { margin: 14, marginBottom: 4, borderRadius: 14, borderWidth: 0.5, padding: 14 },
  pulsHeader:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  pulsTitle:       { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  pulsSubTitle:    { flex: 1, fontSize: 11 },
  pulsRow:         { flexDirection: 'row' },
  pulsItem:        { flex: 1, alignItems: 'center', paddingVertical: 4 },
  pulsVal:         { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  pulsLabel:       { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  pulsSub2:        { fontSize: 9, marginTop: 1 },
  trendTabContent: { paddingHorizontal: 14, gap: 8, paddingVertical: 10, flexDirection: 'row' },
  trendTab:        { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  trendTabLabel:   { fontSize: 11, fontWeight: '600' },
  trendTabSub:     { fontSize: 9, marginTop: 1 },
  sectionWrap:     { paddingHorizontal: 14, paddingBottom: 14 },
  sectionHead:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  sectionTitle:    { fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
  sectionSub:      { fontSize: 11, marginTop: 3 },
  ligOrt:          { fontSize: 12, fontWeight: '600', paddingTop: 2 },
  aiBox:           { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 10 },
  aiBoxHeader:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  aiBoxLabel:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  aiBoxMain:       { fontSize: 13, fontStyle: 'italic', lineHeight: 18, marginBottom: 5 },
  aiBoxWhy:        { fontSize: 11, lineHeight: 16 },
  rowCard:         { borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  trendRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  trendRank:       { fontSize: 13, fontWeight: '700', width: 18, textAlign: 'center' },
  trendTeamCol:    { width: 68 },
  trendAbbr:       { fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
  trendTeamName:   { fontSize: 9, lineHeight: 12 },
  trendBarWrap:    { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  trendBarFill:    { height: '100%', borderRadius: 4 },
  trendVal:        { fontSize: 14, fontWeight: '700', width: 40, textAlign: 'right' },
  showAllBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, borderRadius: 10 },
  showAllText:     { fontSize: 13, fontWeight: '600' },
});

const ozStyles = StyleSheet.create({
  card:           { margin: 14, marginBottom: 8, padding: 14, backgroundColor: '#0C447C', borderRadius: 14 },
  header:         { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.5, marginBottom: 12 },
  pillRow:        { flexDirection: 'row', gap: 6, marginBottom: 14 },
  pill:           { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center' },
  pillLabel:      { fontSize: 9, color: '#888', marginBottom: 3, letterSpacing: 0.3 },
  pillValue:      { fontSize: 12, fontWeight: '700' },
  ozet:           { fontSize: 13, color: '#C8DEFF', lineHeight: 19, fontStyle: 'italic' },
  noynanirCard:   { marginHorizontal: 14, marginTop: 8, marginBottom: 8, padding: 14, borderRadius: 12, borderLeftWidth: 3 },
  noynanirHeader: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  noynanirRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 },
  noynanirIcon:   { fontSize: 13, width: 18, textAlign: 'center', lineHeight: 18 },
  noynanirText:   { flex: 1, fontSize: 12, lineHeight: 18 },
});

const genStyles = StyleSheet.create({
  hero:            { margin: 14, marginBottom: 4, borderRadius: 16, padding: 20, paddingBottom: 18 },
  heroCountry:     { fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5, marginBottom: 6 },
  heroName:        { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5, lineHeight: 30, marginBottom: 8 },
  heroOzet:        { fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 17, marginBottom: 12, fontStyle: 'italic' },
  heroStyleRow:    { flexDirection: 'row' },
  heroStylePill:   { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  heroStyleText:   { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  dnaRow:          { flexDirection: 'row', gap: 8, paddingHorizontal: 14 },
  dnaCard:         { flex: 1, padding: 12, borderRadius: 12, gap: 4 },
  dnaLabel:        { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 },
  dnaValue:        { fontSize: 16, fontWeight: '700' },
  dnaSub:          { fontSize: 11 },
  leaderCard:      { marginHorizontal: 14, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  leaderTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  leaderBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  leaderGapPill:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  leaderGapText:   { fontSize: 11, fontWeight: '600' },
  leaderTeamName:  { fontSize: 22, fontWeight: '800', marginBottom: 5, letterSpacing: -0.5 },
  leaderNarr:      { fontSize: 12, fontStyle: 'italic', lineHeight: 17, marginBottom: 10 },
  tagRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tag:             { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  tagText:         { fontSize: 11, fontWeight: '600' },
  leaderStatsRow:  { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: 10 },
  leaderStat:      { flex: 1, alignItems: 'center' },
  leaderStatVal:   { fontSize: 16, fontWeight: '700' },
  leaderStatLbl:   { fontSize: 10, marginTop: 2 },
  powerRow:        { flexDirection: 'row', borderTopWidth: 0.5, marginTop: 10, paddingTop: 10 },
  powerItem:       { flex: 1, alignItems: 'center' },
  powerDiv:        { width: 0.5 },
  powerLbl:        { fontSize: 10, marginBottom: 3 },
  powerVal:        { fontSize: 16, fontWeight: '700' },
  statsRow:        { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  statCard:        { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  statBig:         { fontSize: 22, fontWeight: '800' },
  statSub:         { fontSize: 10, marginTop: 3, textAlign: 'center' },
  profileCard:     { flex: 1, padding: 12, borderRadius: 12, gap: 5 },
  profileIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  profileLabel:    { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  profileTeam:     { fontSize: 13, fontWeight: '700' },
  profileStat:     { fontSize: 12, fontWeight: '600' },
  effSubtitle:     { fontSize: 11, paddingHorizontal: 14, marginBottom: 6, marginTop: -4 },
  effCard:         { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, overflow: 'hidden' },
  effRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  effRank:         { fontSize: 13, fontWeight: '700', width: 20, textAlign: 'center' },
  effTeam:         { fontSize: 13, fontWeight: '500', flex: 1 },
  effVal:          { fontSize: 13, fontWeight: '700' },
  effBarBg:        { height: 4, borderRadius: 2, overflow: 'hidden' },
  effBarFill:      { height: '100%', borderRadius: 2 },
  insightCard:     { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, overflow: 'hidden' },
  insightRow:      { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10 },
  insightIconWrap: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  insightTitle:    { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  insightDesc:     { fontSize: 11, lineHeight: 15 },
});
