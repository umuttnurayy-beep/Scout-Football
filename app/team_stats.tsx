import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { UnknownOutputParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Image, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import EmptyStateCard from '../components/EmptyStateCard';
import { SkeletonStatBlock } from '../components/SkeletonLoader';
import {
  AllSportsTeamStats, FDMatch,
  SLFormMatch,
  getAllSportsTeamStats, getTeamForm,
  getSuperLigTeamForm,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { DISPLAY_FOOTBALL_SEASON } from '../constants/seasons';
import { formDataEmptyMessage } from '../utils/emptyStates';
import { SeasonStats, calcSLSeasonStats, calcSeasonStats, getTeamProfile, parseForm } from '../utils/teamStats';
import { isArrayOf, readTimedCache, writeTimedCache } from '../utils/timedCache';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFdMatch(value: unknown): value is FDMatch {
  return isRecord(value) && typeof value.id === 'number';
}

function isSlFormMatch(value: unknown): value is SLFormMatch {
  if (!isRecord(value)) return false;
  return typeof value.homeTeamId === 'number' &&
    (typeof value.awayTeamId === 'number' || value.awayTeamId == null) &&
    (typeof value.homeScore === 'number' || value.homeScore == null) &&
    (typeof value.awayScore === 'number' || value.awayScore == null);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeAllSportsStats(value: AllSportsTeamStats | null): AllSportsTeamStats | null {
  if (!value) return null;
  return {
    matchesAnalyzed: finiteNumber(value.matchesAnalyzed) ?? 0,
    avgCorners: finiteNumber(value.avgCorners),
    avgOppCorners: finiteNumber(value.avgOppCorners),
    avgPossession: finiteNumber(value.avgPossession),
  };
}

function teamAbbrev(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words.map(w => w[0] || '').join('').slice(0, 3).toUpperCase();
}

function ratingLabel(r: number): string {
  if (r >= 8.5) return 'Elite';
  if (r >= 7.0) return 'Güçlü';
  if (r >= 5.5) return 'Dengeli';
  if (r >= 4.0) return 'Vasat';
  return 'Zayıf';
}

function computeSimpleRating(played: number, win: number, gf: number, ga: number): number {
  if (played === 0) return 5;
  const wPct = win / played;
  const avgGf = gf / played;
  const avgGa = ga / played;
  const wScore = Math.min(wPct * 10, 10);
  const aScore = Math.min(avgGf / 0.25, 10);
  const dScore = Math.max(0, 10 - avgGa / 0.25);
  return Math.max(1, Math.min(10, wScore * 0.4 + aScore * 0.3 + dScore * 0.3));
}

// ─── Donut Chart ────────────────────────────────────────────────────────────────

function DonutChart({ pct, color, trackColor, size = 80, stroke = 10 }: {
  pct: number; color: string; trackColor: string; size?: number; stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, pct));
  const dash = (filled / 100) * circ;
  const gap = circ - dash;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${dash} ${gap}`}
        strokeLinecap="round"
        rotation={-90}
        originX={size / 2}
        originY={size / 2}
      />
    </Svg>
  );
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const FD_FORM_TTL = 30 * 60 * 1000;
const SL_FORM_TTL = 30 * 60 * 1000;

function routeString(params: UnknownOutputParams, key: string, fallback = ''): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function routeInt(params: UnknownOutputParams, key: string): number {
  return parseInt(routeString(params, key, '0'), 10) || 0;
}

function routeFloat(params: UnknownOutputParams, key: string): number {
  return parseFloat(routeString(params, key, '0')) || 0;
}

type RecentTeam = { id: number; apiId: number; name?: string; leagueName?: string; timestamp?: number };

function isRecentTeam(value: unknown): value is RecentTeam {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RecentTeam>;
  return typeof item.id === 'number' && typeof item.apiId === 'number';
}

function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.min(100, pct), duration: 600, useNativeDriver: false }).start();
  }, [pct, anim]);
  const width = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return <Animated.View style={[styles.pbFill, { width, backgroundColor: color }]} />;
}

export default function TeamStatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors: c, isDark } = useTheme();

  const teamName   = routeString(params, 'teamName');
  const teamId     = routeInt(params, 'teamId');
  const leagueName = routeString(params, 'leagueName');
  const leagueFlag = routeString(params, 'leagueFlag');
  const apiId      = routeInt(params, 'apiId');
  const pos        = routeInt(params, 'pos');
  const played     = routeInt(params, 'played');
  const win        = routeInt(params, 'win');
  const draw       = routeInt(params, 'draw');
  const loss       = routeInt(params, 'loss');
  const gf         = routeInt(params, 'gf');
  const ga         = routeInt(params, 'ga');
  const pts        = routeInt(params, 'pts');
  const passedScoutRating = routeFloat(params, 'scoutRating');

  const [recentForm,  setRecentForm]  = useState<string[]>([]);
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const [formLoadError, setFormLoadError] = useState(false);

  const [allSportsStats, setAllSportsStats] = useState<AllSportsTeamStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [slForm, setSlForm]           = useState<string[]>([]);
  const [slSeasonStats, setSlSeasonStats] = useState<SeasonStats | null>(null);

  const averaj = gf - ga;
  const winPct = played > 0 ? Math.round((win / played) * 100) : 0;
  const abbrev = teamAbbrev(teamName);

  const isSportsDbLeague = apiId === 203;
  const displayForm = isSportsDbLeague ? slForm : recentForm;
  const activeSeasonStats = isSportsDbLeague ? slSeasonStats : seasonStats;
  const lacksProviderTeamId = !isSportsDbLeague && !teamId;

  const scoutRating = passedScoutRating > 0
    ? passedScoutRating
    : computeSimpleRating(played, win, gf, ga);
  const rLabel = ratingLabel(scoutRating);

  const avgGf = played > 0 ? gf / played : 0;
  const avgGa = played > 0 ? ga / played : 0;
  const profile = played > 0 ? getTeamProfile(avgGf, avgGa, winPct, isDark) : null;

  useEffect(() => {
    loadForm();
    loadAllSports();
    if (isSportsDbLeague) loadSLData();
    if (teamId) recordRecentlyViewed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    setRecentForm([]);
    setSeasonStats(null);
    setSlForm([]);
    setSlSeasonStats(null);
    setAllSportsStats(null);
    try {
      await Promise.allSettled([
        loadForm(true),
        loadAllSports(),
        isSportsDbLeague ? loadSLData(true) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  async function recordRecentlyViewed() {
    try {
      const raw = await AsyncStorage.getItem('scout_recent');
      const parsed = raw ? JSON.parse(raw) as unknown : [];
      const list = Array.isArray(parsed) ? parsed.filter(isRecentTeam) : [];
      const filtered = list.filter((r) => !(r.id === teamId && r.apiId === apiId));
      const updated = [{ id: teamId, name: teamName, leagueName, apiId, timestamp: Date.now() }, ...filtered].slice(0, 10);
      await AsyncStorage.setItem('scout_recent', JSON.stringify(updated));
    } catch {}
  }

  function applyFdFormMatches(matches: FDMatch[]) {
    setRecentForm(parseForm(matches, teamId, false));
    setSeasonStats(calcSeasonStats(matches, teamId));
  }

  async function loadForm(force = false) {
    if (!teamId || isSportsDbLeague) return;
    setLoadingForm(true);
    setFormLoadError(false);
    const formKey = `ts_fd_form_v1_${teamId}`;
    const cached = force ? null : await readTimedCache(formKey, FD_FORM_TTL, isArrayOf(isFdMatch));
    if (cached && cached.length > 0) {
      applyFdFormMatches(cached);
      setLoadingForm(false);
    }
    try {
      const matches = await getTeamForm(teamId, { silent: true });
      if (matches.length > 0) {
        applyFdFormMatches(matches);
        writeTimedCache(formKey, matches);
      } else if (!cached) {
        setRecentForm([]);
        setSeasonStats(null);
      }
    } catch {
      if (!cached) {
        setRecentForm([]);
        setSeasonStats(null);
        setFormLoadError(true);
      }
    }
    setLoadingForm(false);
  }

  async function loadAllSports() {
    try {
      const data = await getAllSportsTeamStats(teamName);
      setAllSportsStats(normalizeAllSportsStats(data));
    } catch (e) {
      console.error('loadAllSports hata:', e);
    }
  }

  async function loadSLData(force = false) {
    if (!teamId) return;
    setLoadingForm(true);
    const formKey = `ts_sl_form_v1_${teamId}`;
    try {
      const cachedForm = force
        ? null
        : await readTimedCache(formKey, SL_FORM_TTL, isArrayOf(isSlFormMatch));
      const formMatches = cachedForm
        ? cachedForm
        : await getSuperLigTeamForm(teamId).then(d => { writeTimedCache(formKey, d); return d; });
      const form = formMatches
        .filter((m) => m.homeScore != null && m.awayScore != null)
        .slice(-5)
        .map((m) => {
          const isHome = m.homeTeamId === teamId;
          const gfM = isHome ? m.homeScore! : m.awayScore!;
          const gaM = isHome ? m.awayScore! : m.homeScore!;
          return gfM > gaM ? 'G' : gfM === gaM ? 'B' : 'M';
        });
      setSlForm(form);
      setSlSeasonStats(calcSLSeasonStats(formMatches, teamId));
    } catch {
      setFormLoadError(true);
    }
    setLoadingForm(false);
  }

  const avgCorners    = finiteNumber(allSportsStats?.avgCorners);
  const avgOppCorners = finiteNumber(allSportsStats?.avgOppCorners);
  const avgPossession = finiteNumber(allSportsStats?.avgPossession);
  const totalCorners  = avgCorners != null && avgOppCorners != null ? avgCorners + avgOppCorners : null;

  // Hero background: dark navy regardless of theme
  const heroBg = isDark ? '#0D1117' : '#1A2744';

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* Compact topbar — back button only */}
      <View style={[styles.topbar, { backgroundColor: heroBg }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
      >
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <View style={[styles.hero, { backgroundColor: heroBg }]}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroAbbrev}>{abbrev}</Text>
            <Text style={styles.heroTeamName} numberOfLines={1}>{teamName}</Text>
            <Text style={styles.heroLeague}>{leagueFlag} {leagueName} · {DISPLAY_FOOTBALL_SEASON}</Text>
            <View style={styles.heroBottom}>
              {profile && (
                <View style={[styles.heroTag, { backgroundColor: `${profile.color}33` }]}>
                  <Text style={[styles.heroTagText, { color: profile.color }]}>{profile.label}</Text>
                </View>
              )}
              {pos > 0 && (
                <Text style={styles.heroPosText}>{pts} Puan · {pos}. Sıra</Text>
              )}
            </View>
          </View>

          {/* Scout Rating badge */}
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingVal}>{scoutRating.toFixed(1)}</Text>
            <Text style={styles.ratingLbl}>{rLabel}</Text>
            <Text style={styles.ratingCaption}>Scout Rating</Text>
          </View>
        </View>

        {/* ── 3-COLUMN INFO CARDS ──────────────────────────────────────────── */}
        <View style={styles.infoCardsRow}>
          {/* Card 1: TAKIM KİMLİĞİ */}
          <View style={[styles.infoCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.infoCardTitle, { color: c.textMuted }]}>KİMLİK</Text>
            {profile ? (
              <>
                <Text style={[styles.infoCardBig, { color: profile.color }]}>{profile.emoji}</Text>
                <Text style={[styles.infoCardLabel, { color: profile.color }]} numberOfLines={2}>{profile.label}</Text>
              </>
            ) : (
              <Text style={[styles.infoCardBig, { color: c.textMuted }]}>—</Text>
            )}
            <View style={[styles.infoCardDivider, { backgroundColor: c.border }]} />
            <Text style={[styles.infoStatVal, { color: c.text }]}>{avgGf.toFixed(1)}</Text>
            <Text style={[styles.infoStatLbl, { color: c.textMuted }]}>Gol/Maç</Text>
          </View>

          {/* Card 2: SON FORM */}
          <View style={[styles.infoCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.infoCardTitle, { color: c.textMuted }]}>SON FORM</Text>
            {loadingForm && displayForm.length === 0 ? (
              <View style={[styles.formDotSkel, { backgroundColor: c.borderLight }]} />
            ) : displayForm.length === 0 ? (
              <Text style={[styles.infoCardLabel, { color: c.textFaint, fontSize: 10, textAlign: 'center' }]}>
                {lacksProviderTeamId ? 'Yok' : formDataEmptyMessage()}
              </Text>
            ) : (
              <View style={styles.formDotsWrap}>
                {displayForm.slice(-5).map((r, i) => (
                  <View key={i} style={[styles.formDot,
                    r === 'G' ? { backgroundColor: c.win } : r === 'B' ? { backgroundColor: c.draw } : { backgroundColor: c.loss }]}
                  />
                ))}
              </View>
            )}
            <View style={[styles.infoCardDivider, { backgroundColor: c.border }]} />
            <Text style={[styles.infoStatVal, { color: c.win }]}>{win}</Text>
            <Text style={[styles.infoStatLbl, { color: c.textMuted }]}>Galibiyet</Text>
          </View>

          {/* Card 3: MAÇ ÖZETİ */}
          <View style={[styles.infoCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.infoCardTitle, { color: c.textMuted }]}>ÖZET</Text>
            <View style={styles.miniGrid}>
              <View style={styles.miniCell}>
                <Text style={[styles.miniVal, { color: c.text }]}>{played}</Text>
                <Text style={[styles.miniLbl, { color: c.textMuted }]}>Maç</Text>
              </View>
              <View style={styles.miniCell}>
                <Text style={[styles.miniVal, { color: c.win }]}>{win}</Text>
                <Text style={[styles.miniLbl, { color: c.textMuted }]}>G</Text>
              </View>
              <View style={styles.miniCell}>
                <Text style={[styles.miniVal, { color: c.draw }]}>{draw}</Text>
                <Text style={[styles.miniLbl, { color: c.textMuted }]}>B</Text>
              </View>
              <View style={styles.miniCell}>
                <Text style={[styles.miniVal, { color: c.loss }]}>{loss}</Text>
                <Text style={[styles.miniLbl, { color: c.textMuted }]}>M</Text>
              </View>
            </View>
            {played > 0 && (
              <View style={[styles.wdlBar, { backgroundColor: c.border, marginTop: 4 }]}>
                {win  > 0 && <View style={[styles.wdlSeg, { flex: win,  backgroundColor: c.win  }]} />}
                {draw > 0 && <View style={[styles.wdlSeg, { flex: draw, backgroundColor: c.draw }]} />}
                {loss > 0 && <View style={[styles.wdlSeg, { flex: loss, backgroundColor: c.loss }]} />}
              </View>
            )}
            <View style={[styles.infoCardDivider, { backgroundColor: c.border }]} />
            <Text style={[styles.infoStatVal, { color: c.primary }]}>{pts}</Text>
            <Text style={[styles.infoStatLbl, { color: c.textMuted }]}>Puan</Text>
          </View>
        </View>

        {/* ── GOL ────────────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>GOL</Text>
        <View style={[styles.goalCard, { backgroundColor: c.surface }]}>
          <View style={styles.goalStat}>
            <Text style={[styles.goalV, { color: c.win }]}>{gf}</Text>
            <Text style={[styles.goalL, { color: c.textMuted }]}>Atılan</Text>
          </View>
          <View style={[styles.goalDivider, { backgroundColor: c.border }]} />
          <View style={styles.goalStat}>
            <Text style={[styles.goalV, { color: c.loss }]}>{ga}</Text>
            <Text style={[styles.goalL, { color: c.textMuted }]}>Yenilen</Text>
          </View>
          <View style={[styles.goalDivider, { backgroundColor: c.border }]} />
          <View style={styles.goalStat}>
            <Text style={[styles.goalV, { color: averaj >= 0 ? c.win : c.loss }]}>
              {averaj >= 0 ? '+' : ''}{averaj}
            </Text>
            <Text style={[styles.goalL, { color: c.textMuted }]}>Averaj</Text>
          </View>
          <View style={[styles.goalDivider, { backgroundColor: c.border }]} />
          <View style={styles.goalStat}>
            <Text style={[styles.goalV, { color: c.primary }]}>{winPct}%</Text>
            <Text style={[styles.goalL, { color: c.textMuted }]}>Galibiyet</Text>
          </View>
        </View>

        {/* ── SEZON ANALİZİ ───────────────────────────────────────────────────── */}
        {loadingForm && !activeSeasonStats ? (
          <SkeletonStatBlock />
        ) : formLoadError ? (
          <EmptyStateCard
            compact
            icon="wifi-outline"
            title="İstatistik verisi alınamadı"
            onRetry={() => apiId === 203 ? loadSLData() : loadForm()}
          />
        ) : !activeSeasonStats && lacksProviderTeamId ? (
          <Text style={[styles.noDataSmall, { color: c.textFaint }]}>
            Sezon analizi bu lig için mevcut değil.
          </Text>
        ) : activeSeasonStats ? (
          <>
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>
              GOL BEKLENTİLERİ ({activeSeasonStats.total} maç)
            </Text>
            <View style={[styles.expectCard, { backgroundColor: c.surface }]}>
              {[
                { label: '1.5 Üst', value: activeSeasonStats.over15Pct },
                { label: '2.5 Üst', value: activeSeasonStats.over25Pct },
                { label: '3.5 Üst', value: activeSeasonStats.over35Pct },
              ].map(row => (
                <View key={row.label} style={styles.pbRow}>
                  <Text style={[styles.pbLabel, { color: c.textSub }]}>{row.label}</Text>
                  <View style={[styles.pbTrack, { backgroundColor: c.border }]}>
                    <AnimatedBar pct={row.value} color={c.primary} />
                  </View>
                  <Text style={[styles.pbValue, { color: c.primary }]}>{row.value}%</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>ÖZEL DURUMLAR</Text>
            <View style={styles.specialRow}>
              <View style={[styles.specialBox, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.specialV, { color: c.primary }]}>{activeSeasonStats.bttsPct}%</Text>
                <Text style={[styles.specialL, { color: c.textMuted }]}>KG Var</Text>
              </View>
              <View style={[styles.specialBox, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.specialV, { color: c.win }]}>{activeSeasonStats.cleanSheetPct}%</Text>
                <Text style={[styles.specialL, { color: c.textMuted }]}>Kale sıfır</Text>
              </View>
              <View style={[styles.specialBox, { backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.specialV, { color: c.loss }]}>{activeSeasonStats.failedToScorePct}%</Text>
                <Text style={[styles.specialL, { color: c.textMuted }]}>Gol atamadı</Text>
              </View>
            </View>

            {/* İÇ SAHA vs DEPLASMAN — Donut chart */}
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>İÇ SAHA vs DEPLASMAN</Text>
            <View style={[styles.splitCard, { backgroundColor: c.surface }]}>
              {[
                { label: 'İç Saha',   data: activeSeasonStats.home, color: c.primary },
                { label: 'Deplasman', data: activeSeasonStats.away, color: c.win },
              ].map(s => {
                const maxPts = s.data.played * 3;
                const earnedPts = s.data.win * 3 + s.data.draw;
                const pct = maxPts > 0 ? Math.round((earnedPts / maxPts) * 100) : 0;
                return (
                  <View key={s.label} style={styles.splitRow}>
                    {/* Donut */}
                    <View style={styles.donutWrap}>
                      <DonutChart
                        pct={pct}
                        color={s.color}
                        trackColor={isDark ? '#2a3040' : '#e8edf2'}
                        size={72}
                        stroke={9}
                      />
                      <View style={styles.donutCenter}>
                        <Text style={[styles.donutPct, { color: c.text }]}>{pct}%</Text>
                      </View>
                    </View>

                    {/* Details */}
                    <View style={styles.splitDetails}>
                      <Text style={[styles.splitLabel, { color: c.text }]}>{s.label}</Text>
                      <Text style={[styles.splitRecord, { color: s.color }]}>
                        {s.data.win}G · {s.data.draw}B · {s.data.loss}M
                      </Text>
                      <Text style={[styles.splitMeta, { color: c.textMuted }]}>{s.data.played} maç · {earnedPts} puan</Text>
                      {s.data.played > 0 && (
                        <View style={[styles.splitBar, { backgroundColor: c.border, marginTop: 6 }]}>
                          {s.data.win  > 0 && <View style={[styles.splitSeg, { flex: s.data.win,  backgroundColor: c.win  }]} />}
                          {s.data.draw > 0 && <View style={[styles.splitSeg, { flex: s.data.draw, backgroundColor: c.draw }]} />}
                          {s.data.loss > 0 && <View style={[styles.splitSeg, { flex: s.data.loss, backgroundColor: c.loss }]} />}
                        </View>
                      )}
                    </View>
                    <Text style={[styles.splitPtsCap, { color: c.textFaint }]}>Puan{'\n'}Oranı</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <View style={[styles.noDataBox, { backgroundColor: c.surfaceAlt }]}>
            <Text style={[styles.noDataText, { color: c.textSub }]}>
              {lacksProviderTeamId
                ? 'Bu lig kaynağında takım ID eşleşmesi olmadığı için maç bazlı detay verisi gösterilemiyor.'
                : 'Maç bazlı sezon detayı bulunamadı.'}
            </Text>
          </View>
        )}

        {/* ── KORNER & POSSESSION ─────────────────────────────────────────────── */}
        {allSportsStats && (avgCorners != null || avgOppCorners != null || avgPossession != null) && (
          <>
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>
              KORNER & POZİSYON ({allSportsStats.matchesAnalyzed} maç)
            </Text>
            <View style={styles.statGrid}>
              {avgCorners != null && (
                <View style={[styles.statBox, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.statVal, { color: c.primary }]}>{avgCorners.toFixed(1)}</Text>
                  <Text style={[styles.statLbl, { color: c.textMuted }]}>Ort. Korner</Text>
                </View>
              )}
              {avgOppCorners != null && (
                <View style={[styles.statBox, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.statVal, { color: c.textMuted }]}>{avgOppCorners.toFixed(1)}</Text>
                  <Text style={[styles.statLbl, { color: c.textMuted }]}>Rakip Korner</Text>
                </View>
              )}
              {totalCorners != null && (
                <View style={[styles.statBox, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.statVal, { color: c.text }]}>{totalCorners.toFixed(1)}</Text>
                  <Text style={[styles.statLbl, { color: c.textMuted }]}>Toplam Ort.</Text>
                </View>
              )}
              {avgPossession != null && (
                <View style={[styles.statBox, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.statVal, { color: c.primary }]}>{avgPossession.toFixed(0)}%</Text>
                  <Text style={[styles.statLbl, { color: c.textMuted }]}>Ort. Possession</Text>
                </View>
              )}
            </View>
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  scroll:           { flex: 1 },
  sectionLabel:     { fontSize: 11, fontWeight: '600', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6, letterSpacing: 0.5 },
  noDataSmall:      { fontSize: 12, paddingHorizontal: 14, paddingBottom: 10 },

  // Topbar (minimal, over hero bg)
  topbar:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 8 },
  backBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  backText:         { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '500' },
  headerLogo:       { width: 30, height: 30, resizeMode: 'contain', opacity: 0.6 },

  // Hero
  hero:             { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroLeft:         { flex: 1 },
  heroAbbrev:       { fontSize: 52, fontWeight: '900', color: '#ffffff', letterSpacing: 1, lineHeight: 60 },
  heroTeamName:     { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  heroLeague:       { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 3 },
  heroBottom:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  heroTag:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  heroTagText:      { fontSize: 11, fontWeight: '600' },
  heroPosText:      { fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  // Scout Rating Badge
  ratingBadge:      { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12, minWidth: 72 },
  ratingVal:        { fontSize: 28, fontWeight: '900', color: '#ffffff' },
  ratingLbl:        { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  ratingCaption:    { fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 2, letterSpacing: 0.3 },

  // 3-col info cards
  infoCardsRow:     { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  infoCard:         { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  infoCardTitle:    { fontSize: 9, fontWeight: '600', letterSpacing: 0.4 },
  infoCardBig:      { fontSize: 22 },
  infoCardLabel:    { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  infoCardDivider:  { width: '100%', height: 0.5, marginVertical: 6 },
  infoStatVal:      { fontSize: 18, fontWeight: '700' },
  infoStatLbl:      { fontSize: 10 },
  formDotsWrap:     { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center', marginVertical: 4 },
  formDot:          { width: 10, height: 10, borderRadius: 5 },
  formDotSkel:      { width: 40, height: 10, borderRadius: 5, marginVertical: 8 },
  miniGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  miniCell:         { alignItems: 'center', minWidth: 24 },
  miniVal:          { fontSize: 13, fontWeight: '700' },
  miniLbl:          { fontSize: 9 },

  // W-D-L bar
  wdlBar:           { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', width: '100%' },
  wdlSeg:           { height: '100%' },

  // Gol kartı
  goalCard:         { flexDirection: 'row', marginHorizontal: 14, marginBottom: 8, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  goalStat:         { flex: 1, alignItems: 'center' },
  goalDivider:      { width: 0.5 },
  goalV:            { fontSize: 24, fontWeight: '700' },
  goalL:            { fontSize: 10, marginTop: 3 },

  // Gol Beklentileri
  expectCard:       { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  pbRow:            { flexDirection: 'row', alignItems: 'center', marginVertical: 5, gap: 8 },
  pbLabel:          { fontSize: 12, width: 54 },
  pbTrack:          { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  pbFill:           { height: '100%', borderRadius: 4 },
  pbValue:          { fontSize: 13, fontWeight: '600', width: 44, textAlign: 'right' },

  // Özel durumlar
  specialRow:       { flexDirection: 'row', marginHorizontal: 10, gap: 8, marginBottom: 8 },
  specialBox:       { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  specialV:         { fontSize: 20, fontWeight: '700' },
  specialL:         { fontSize: 10, marginTop: 3, textAlign: 'center' },

  // İç Saha vs Deplasman (donut)
  splitCard:        { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, padding: 14, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  splitRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  donutWrap:        { alignItems: 'center', justifyContent: 'center' },
  donutCenter:      { position: 'absolute' },
  donutPct:         { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  splitDetails:     { flex: 1 },
  splitLabel:       { fontSize: 13, fontWeight: '700' },
  splitRecord:      { fontSize: 12, fontWeight: '600', marginTop: 2 },
  splitMeta:        { fontSize: 11, marginTop: 2 },
  splitBar:         { flexDirection: 'row', height: 5, borderRadius: 2.5, overflow: 'hidden' },
  splitSeg:         { height: '100%' },
  splitPtsCap:      { fontSize: 9, textAlign: 'center', lineHeight: 13 },

  // Korner & Possession
  statGrid:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, marginBottom: 4 },
  statBox:          { width: '30%', flexGrow: 1, borderRadius: 10, padding: 12 },
  statVal:          { fontSize: 22, fontWeight: '500' },
  statLbl:          { fontSize: 10, marginTop: 2 },

  noDataBox:        { margin: 20, padding: 20, borderRadius: 10, alignItems: 'center' },
  noDataText:       { fontSize: 13, textAlign: 'center' },
});
