import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { UnknownOutputParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Image, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
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
import scoutStyles from '../utils/scoutStyles';
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


// ─── Team form frontend cache ───────────────────────────────────────────────────────

const FD_FORM_TTL    = 30 * 60 * 1000;       // 30 dakika
const SL_FORM_TTL    = 30 * 60 * 1000;       // 30 dakika

function routeString(params: UnknownOutputParams, key: string, fallback = ''): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function routeInt(params: UnknownOutputParams, key: string): number {
  return parseInt(routeString(params, key, '0'), 10) || 0;
}

type RecentTeam = { id: number; apiId: number; name?: string; leagueName?: string; timestamp?: number };

function isRecentTeam(value: unknown): value is RecentTeam {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RecentTeam>;
  return typeof item.id === 'number' && typeof item.apiId === 'number';
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
  const played     = routeInt(params, 'played');
  const win        = routeInt(params, 'win');
  const draw       = routeInt(params, 'draw');
  const loss       = routeInt(params, 'loss');
  const gf         = routeInt(params, 'gf');
  const ga         = routeInt(params, 'ga');
  const pts        = routeInt(params, 'pts');

  // Form + gerçek sezon istatistikleri
  const [recentForm,  setRecentForm]  = useState<string[]>([]);
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const [formLoadError, setFormLoadError] = useState(false);

  // AllSports (korner + possession)
  const [allSportsStats, setAllSportsStats] = useState<AllSportsTeamStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Süper Lig specific
  const [slForm, setSlForm]           = useState<string[]>([]);
  const [slSeasonStats, setSlSeasonStats] = useState<SeasonStats | null>(null);

  const averaj = gf - ga;
  const winPct = played > 0 ? Math.round((win / played) * 100) : 0;
  const initials = teamName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const isSportsDbLeague = apiId === 203;
  const displayForm = isSportsDbLeague ? slForm : recentForm;
  const activeSeasonStats = isSportsDbLeague ? slSeasonStats : seasonStats;
  const lacksProviderTeamId = !isSportsDbLeague && !teamId;

  useEffect(() => {
    loadForm();
    loadAllSports();
    if (isSportsDbLeague) loadSLData();
    if (teamId) recordRecentlyViewed();
    // Team route params are fixed for this screen instance.
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

    const formKey    = `ts_sl_form_v1_${teamId}`;

    try {
      const cachedForm = force
        ? null
        : await readTimedCache(formKey, SL_FORM_TTL, isArrayOf(isSlFormMatch));

      const formMatches = cachedForm
        ? cachedForm
        : await getSuperLigTeamForm(teamId).then(d => { writeTimedCache(formKey, d); return d; });

      // Form hesapla
      const form = formMatches
        .filter((m) => m.homeScore != null && m.awayScore != null)
        .slice(-5)
        .map((m) => {
          const isHome = m.homeTeamId === teamId;
          const gf = isHome ? m.homeScore! : m.awayScore!;
          const ga = isHome ? m.awayScore! : m.homeScore!;
          return gf > ga ? 'G' : gf === ga ? 'B' : 'M';
        });
      setSlForm(form);
      setSlSeasonStats(calcSLSeasonStats(formMatches, teamId));
    } catch {
      setFormLoadError(true);
    }
    setLoadingForm(false);
  }
  const avgCorners = finiteNumber(allSportsStats?.avgCorners);
  const avgOppCorners = finiteNumber(allSportsStats?.avgOppCorners);
  const avgPossession = finiteNumber(allSportsStats?.avgPossession);
  const totalCorners = avgCorners != null && avgOppCorners != null
    ? avgCorners + avgOppCorners
    : null;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backBtn, { color: c.primary }]}>‹ Geri</Text>
        </TouchableOpacity>
        <View style={styles.topbarCenter}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={[styles.topbarTitle, { color: c.text }]} numberOfLines={1}>{teamName}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
      >
        <View style={[styles.teamHeader, { borderBottomColor: c.border }]}>
          <View style={[styles.teamLogo, { backgroundColor: c.primaryLight }]}>
            <Text style={[styles.teamLogoText, { color: c.primaryDark }]}>{initials}</Text>
          </View>
          <View>
            <Text style={[styles.teamTitle, { color: c.text }]}>{teamName}</Text>
            <Text style={[styles.teamSub, { color: c.textMuted }]}>{leagueFlag} {leagueName} · {DISPLAY_FOOTBALL_SEASON}</Text>
          </View>
        </View>
        <>
            {/* TAKIM PROFİLİ */}
            {played > 0 && (() => {
              const avgGf = gf / played;
              const avgGa = ga / played;
              const profile = getTeamProfile(avgGf, avgGa, winPct, isDark);
              return (
                <View style={[styles.profileCard, { backgroundColor: c.surfaceAlt, borderColor: c.border, borderLeftColor: profile.color }]}>
                  <View style={styles.profileTop}>
                    <Text style={styles.profileEmoji}>{profile.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.profileLabel, { color: profile.color }]}>{profile.label}</Text>
                      <Text style={[styles.profileDesc, { color: c.textSub }]}>{profile.desc}</Text>
                    </View>
                  </View>
                  <View style={[styles.profileStats, { borderTopColor: c.border }]}>
                    <View style={styles.profileStat}>
                      <Text style={[styles.profileStatVal, { color: c.text }]}>{avgGf.toFixed(1)}</Text>
                      <Text style={[styles.profileStatLbl, { color: c.textMuted }]}>Gol/Maç</Text>
                    </View>
                    <View style={styles.profileStat}>
                      <Text style={[styles.profileStatVal, { color: c.text }]}>{avgGa.toFixed(1)}</Text>
                      <Text style={[styles.profileStatLbl, { color: c.textMuted }]}>Yenilen/Maç</Text>
                    </View>
                    <View style={styles.profileStat}>
                      <Text style={[styles.profileStatVal, { color: c.text }]}>{winPct}%</Text>
                      <Text style={[styles.profileStatLbl, { color: c.textMuted }]}>Galibiyet</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* SON FORM — üste taşındı */}
            <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>SON FORM</Text>
            <View style={styles.formRow}>
              {loadingForm && displayForm.length === 0 ? (
                <View style={{ width: 120, height: 28, borderRadius: 8, backgroundColor: c.borderLight, opacity: 0.6 }} />
              ) : displayForm.length === 0 ? (
                <Text style={[styles.formNote, { color: c.textMuted }]}>
                  {lacksProviderTeamId
                    ? 'Form verisi bu lig için mevcut değil.'
                    : formDataEmptyMessage()}
                </Text>
              ) : (
                <>
                  {displayForm.map((r, i) => (
                    <View key={i} style={[styles.formBadge,
                      r === 'G' ? { backgroundColor: c.win } : r === 'B' ? { backgroundColor: c.draw } : { backgroundColor: c.loss }]}>
                      <Text style={styles.formBadgeText}>{r}</Text>
                    </View>
                  ))}
                  <Text style={[styles.formNote, { color: c.textMuted }]}>Son {displayForm.length} maç</Text>
                </>
              )}
            </View>

            {/* MAÇ ÖZETİ — eski GENEL'in kompakt hali */}
            <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>MAÇ ÖZETİ</Text>
            <View style={[styles.summaryCard, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryV, { color: c.text }]}>{played}</Text>
                  <Text style={[styles.summaryL, { color: c.textMuted }]}>Maç</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryV, { color: c.win }]}>{win}</Text>
                  <Text style={[styles.summaryL, { color: c.textMuted }]}>Galibiyet</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryV, { color: c.draw }]}>{draw}</Text>
                  <Text style={[styles.summaryL, { color: c.textMuted }]}>Beraberlik</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryV, { color: c.loss }]}>{loss}</Text>
                  <Text style={[styles.summaryL, { color: c.textMuted }]}>Mağlubiyet</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryV, { color: c.primary }]}>{pts}</Text>
                  <Text style={[styles.summaryL, { color: c.textMuted }]}>Puan</Text>
                </View>
              </View>
              {played > 0 && (
                <View style={[styles.wdlBar, { backgroundColor: c.border }]}>
                  {win > 0 && <View style={[styles.wdlSeg, { flex: win, backgroundColor: c.win }]} />}
                  {draw > 0 && <View style={[styles.wdlSeg, { flex: draw, backgroundColor: c.draw }]} />}
                  {loss > 0 && <View style={[styles.wdlSeg, { flex: loss, backgroundColor: c.loss }]} />}
                </View>
              )}
            </View>

            {/* GOL — sadece 3 makro rakam (gol/maç profil kartında zaten var) */}
            <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>GOL</Text>
            <View style={[styles.goalCard, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
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
            </View>

            {/* SEZON ANALİZİ — Gol beklentileri görsel bar + özel durumlar */}
            {loadingForm && !activeSeasonStats ? (
              <SkeletonStatBlock />
            ) : formLoadError ? (
              <EmptyStateCard
                compact
                icon="📡"
                title="İstatistik verisi alınamadı"
                onRetry={() => apiId === 203 ? loadSLData() : loadForm()}
              />
            ) : !activeSeasonStats && lacksProviderTeamId ? (
              <Text style={[styles.formNote, { color: c.textFaint, paddingHorizontal: 14, paddingBottom: 8 }]}>
                Sezon analizi bu lig için mevcut değil.
              </Text>
            ) : activeSeasonStats ? (
              <>
                <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>
                  GOL BEKLENTİLERİ ({activeSeasonStats.total} maç)
                </Text>
                <View style={[styles.expectCard, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                  {[
                    { label: '1.5 Üst', value: activeSeasonStats.over15Pct },
                    { label: '2.5 Üst', value: activeSeasonStats.over25Pct },
                    { label: '3.5 Üst', value: activeSeasonStats.over35Pct },
                  ].map(row => (
                    <View key={row.label} style={styles.pbRow}>
                      <Text style={[styles.pbLabel, { color: c.textSub }]}>{row.label}</Text>
                      <View style={[styles.pbTrack, { backgroundColor: c.border }]}>
                        <View style={[styles.pbFill, { width: `${Math.min(100, row.value)}%`, backgroundColor: c.primary }]} />
                      </View>
                      <Text style={[styles.pbValue, { color: c.primary }]}>{row.value}%</Text>
                    </View>
                  ))}
                </View>

                <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>ÖZEL DURUMLAR</Text>
                <View style={styles.specialRow}>
                  <View style={[styles.specialBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                    <Text style={[styles.specialV, { color: c.primary }]}>{activeSeasonStats.bttsPct}%</Text>
                    <Text style={[styles.specialL, { color: c.textMuted }]}>KG Var</Text>
                  </View>
                  <View style={[styles.specialBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                    <Text style={[styles.specialV, { color: c.win }]}>{activeSeasonStats.cleanSheetPct}%</Text>
                    <Text style={[styles.specialL, { color: c.textMuted }]}>Kale sıfır</Text>
                  </View>
                  <View style={[styles.specialBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                    <Text style={[styles.specialV, { color: c.loss }]}>{activeSeasonStats.failedToScorePct}%</Text>
                    <Text style={[styles.specialL, { color: c.textMuted }]}>Gol atamadı</Text>
                  </View>
                </View>

                {/* İÇ SAHA vs DEPLASMAN — görsel karşılaştırma */}
                <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>İÇ SAHA vs DEPLASMAN</Text>
                <View style={[styles.splitCompareCard, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                  {[
                    { label: 'İç Saha',   data: activeSeasonStats.home },
                    { label: 'Deplasman', data: activeSeasonStats.away },
                  ].map(s => (
                    <View key={s.label} style={styles.splitCompareRow}>
                      <View style={styles.splitCompareHeader}>
                        <Text style={[styles.splitCompareLabel, { color: c.textSub }]}>{s.label}</Text>
                        <Text style={[styles.splitCompareRecord, { color: c.text }]}>
                          {s.data.win}G {s.data.draw}B {s.data.loss}M
                        </Text>
                        <Text style={[styles.splitCompareMeta, { color: c.textMuted }]}>{s.data.played} maç</Text>
                      </View>
                      {s.data.played > 0 && (
                        <View style={[styles.splitCompareBar, { backgroundColor: c.border }]}>
                          {s.data.win  > 0 && <View style={[styles.splitSeg, { flex: s.data.win,  backgroundColor: c.win  }]} />}
                          {s.data.draw > 0 && <View style={[styles.splitSeg, { flex: s.data.draw, backgroundColor: c.draw }]} />}
                          {s.data.loss > 0 && <View style={[styles.splitSeg, { flex: s.data.loss, backgroundColor: c.loss }]} />}
                        </View>
                      )}
                    </View>
                  ))}
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

            {/* KORNER & POSSESSION — AllSports */}
            {allSportsStats && (avgCorners != null || avgOppCorners != null || avgPossession != null) && (
              <>
                <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>
                  KORNER & POZİSYON ({allSportsStats.matchesAnalyzed} maç)
                </Text>
                <View style={styles.statGrid}>
                  {avgCorners != null && (
                    <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                      <Text style={[styles.statVal, { color: c.primary }]}>{avgCorners.toFixed(1)}</Text>
                      <Text style={[styles.statLbl, { color: c.textMuted }]}>Ort. Korner</Text>
                    </View>
                  )}
                  {avgOppCorners != null && (
                    <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                      <Text style={[styles.statVal, { color: c.textMuted }]}>{avgOppCorners.toFixed(1)}</Text>
                      <Text style={[styles.statLbl, { color: c.textMuted }]}>Rakip Korner</Text>
                    </View>
                  )}
                  {totalCorners != null && (
                    <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                      <Text style={[styles.statVal, { color: c.text }]}>
                        {totalCorners.toFixed(1)}
                      </Text>
                      <Text style={[styles.statLbl, { color: c.textMuted }]}>Toplam Ort.</Text>
                    </View>
                  )}
                  {avgPossession != null && (
                    <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                      <Text style={[styles.statVal, { color: c.primary }]}>{avgPossession.toFixed(0)}%</Text>
                      <Text style={[styles.statLbl, { color: c.textMuted }]}>Ort. Possession</Text>
                    </View>
                  )}
                </View>
              </>
            )}
        </>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1 },
  topbar:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 10, borderBottomWidth: 0.5 },
  backBtn:             { fontSize: 16, fontWeight: '500' },
  topbarCenter:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerLogo:          { width: 28, height: 28, resizeMode: 'contain' },
  topbarTitle:         { fontSize: 14, fontWeight: '500' },
  scroll:              { flex: 1 },
  teamHeader:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 0.5 },
  teamLogo:            { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  teamLogoText:        { fontSize: 16, fontWeight: '500' },
  teamTitle:           { fontSize: 16, fontWeight: '500' },
  teamSub:             { fontSize: 12, marginTop: 2 },
  statGrid:            { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, marginBottom: 4 },
  statBox:             { width: '30%', flexGrow: 1, borderRadius: 10, padding: 12, borderWidth: 0.5 },
  statVal:             { fontSize: 22, fontWeight: '500' },
  statLbl:             { fontSize: 10, marginTop: 2 },
  noDataSmall:         { fontSize: 12, paddingHorizontal: 14, paddingBottom: 10 },

  // Maç Özeti (W-D-L bar dahil)
  summaryCard:         { marginHorizontal: 14, marginBottom: 8, borderRadius: 10, borderWidth: 0.5, padding: 12 },
  summaryRow:          { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryStat:         { alignItems: 'center' },
  summaryV:            { fontSize: 20, fontWeight: '600' },
  summaryL:            { fontSize: 10, marginTop: 2 },
  wdlBar:              { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
  wdlSeg:              { height: '100%' },
  wdlW:                {},
  wdlD:                {},
  wdlL:                {},

  // Gol kartı
  goalCard:            { flexDirection: 'row', marginHorizontal: 14, marginBottom: 8, borderRadius: 10, borderWidth: 0.5, padding: 14 },
  goalStat:            { flex: 1, alignItems: 'center' },
  goalDivider:         { width: 0.5 },
  goalV:               { fontSize: 26, fontWeight: '600' },
  goalL:               { fontSize: 11, marginTop: 3 },

  // Gol Beklentileri — yatay bar
  expectCard:          { marginHorizontal: 14, marginBottom: 8, borderRadius: 10, borderWidth: 0.5, padding: 14 },
  pbRow:               { flexDirection: 'row', alignItems: 'center', marginVertical: 5, gap: 8 },
  pbLabel:             { fontSize: 12, width: 54 },
  pbTrack:             { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  pbFill:              { height: '100%', borderRadius: 4 },
  pbValue:             { fontSize: 13, fontWeight: '600', width: 44, textAlign: 'right' },

  // Özel durumlar
  specialRow:          { flexDirection: 'row', marginHorizontal: 10, gap: 8, marginBottom: 8 },
  specialBox:          { flex: 1, borderRadius: 10, padding: 12, borderWidth: 0.5, alignItems: 'center' },
  specialV:            { fontSize: 20, fontWeight: '600' },
  specialL:            { fontSize: 10, marginTop: 3, textAlign: 'center' },

  // İç Saha vs Deplasman — karşılaştırma barı
  splitCompareCard:    { marginHorizontal: 14, marginBottom: 8, borderRadius: 10, borderWidth: 0.5, padding: 12 },
  splitCompareRow:     { marginVertical: 6 },
  splitCompareHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  splitCompareLabel:   { flex: 1, fontSize: 12, fontWeight: '500' },
  splitCompareRecord:  { fontSize: 13, fontWeight: '600', marginRight: 8 },
  splitCompareMeta:    { fontSize: 11 },
  splitCompareBar:     { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
  splitSeg:            { height: '100%' },

  formRow:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 16, gap: 6 },
  formBadge:           { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  formG:               {},
  formB:               {},
  formM:               {},
  formBadgeText:       { fontSize: 13, fontWeight: '600', color: '#fff' },
  formNote:            { fontSize: 11, marginLeft: 6 },
  noDataBox:           { margin: 20, padding: 20, borderRadius: 10, alignItems: 'center' },
  noDataText:          { fontSize: 13, textAlign: 'center' },
  profileCard:         { marginHorizontal: 14, marginBottom: 6, padding: 14, borderRadius: 12, borderLeftWidth: 3, borderWidth: 0.5 },
  profileTop:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  profileEmoji:        { fontSize: 26, marginTop: 2 },
  profileLabel:        { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  profileDesc:         { fontSize: 12, lineHeight: 17 },
  profileStats:        { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: 10, gap: 0 },
  profileStat:         { flex: 1, alignItems: 'center' },
  profileStatVal:      { fontSize: 16, fontWeight: '600' },
  profileStatLbl:      { fontSize: 10, marginTop: 2 },
});

