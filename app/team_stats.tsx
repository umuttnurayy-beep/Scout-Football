import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import EmptyStateCard from '../components/EmptyStateCard';
import { SkeletonPlayerList, SkeletonStatBlock } from '../components/SkeletonLoader';
import {
  AllSportsTeamStats, FDScorer, FDSquadPlayer,
  SLPlayer, SLScorer,
  getAllSportsTeamStats, getFdTeamData, getTeamForm, getTopScorers,
  getSuperLigTeamForm, getSuperLigPlayers, getSuperLigScorers,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { DISPLAY_FOOTBALL_SEASON } from '../constants/seasons';
import { formDataEmptyMessage } from '../utils/emptyStates';
import scoutStyles from '../utils/scoutStyles';
import { SeasonStats, calcSLSeasonStats, calcSeasonStats, getTeamProfile, teamsMatch, transliterate } from '../utils/teamStats';

const AF_POSITION_MAP: Record<string, string> = {
  G: 'Kaleci', D: 'Defans', M: 'Orta saha', F: 'Forvet',
};
const AF_POSITION_ORDER = ['G', 'D', 'M', 'F'];
const POSITION_TO_CODE: Record<string, string> = {
  'Goalkeeper': 'G',
  'Defender': 'D', 'Defence': 'D',
  'Midfielder': 'M', 'Midfield': 'M',
  'Attacker': 'F', 'Offence': 'F', 'Forward': 'F',
};

const LIGHT_RANK_COLORS = [
  { bg: '#FAEEDA', color: '#633806' },
  { bg: '#D3D1C7', color: '#2C2C2A' },
  { bg: '#F5C4B3', color: '#712B13' },
];

const DARK_RANK_COLORS = [
  { bg: '#3A2C12', color: '#F2D28A' },
  { bg: '#2B3036', color: '#C9D1D9' },
  { bg: '#3A2018', color: '#F0A98A' },
];

export default function TeamStatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors: c, isDark } = useTheme();

  const teamName  = Array.isArray(params.teamName)  ? params.teamName[0]  : (params.teamName  || '');
  const teamId    = parseInt(Array.isArray(params.teamId)   ? params.teamId[0]   : (params.teamId   || '0'));
  const leagueName = Array.isArray(params.leagueName) ? params.leagueName[0] : (params.leagueName || '');
  const leagueFlag = Array.isArray(params.leagueFlag) ? params.leagueFlag[0] : (params.leagueFlag || '');
  const apiId = parseInt(Array.isArray(params.apiId) ? params.apiId[0] : (params.apiId || '0'));
  const fdId  = parseInt(Array.isArray(params.fdId)  ? params.fdId[0]  : (params.fdId  || '0'));
  const played = parseInt(Array.isArray(params.played) ? params.played[0] : (params.played || '0'));
  const win    = parseInt(Array.isArray(params.win)    ? params.win[0]    : (params.win    || '0'));
  const draw   = parseInt(Array.isArray(params.draw)   ? params.draw[0]   : (params.draw   || '0'));
  const loss   = parseInt(Array.isArray(params.loss)   ? params.loss[0]   : (params.loss   || '0'));
  const gf     = parseInt(Array.isArray(params.gf)     ? params.gf[0]     : (params.gf     || '0'));
  const ga     = parseInt(Array.isArray(params.ga)     ? params.ga[0]     : (params.ga     || '0'));
  const pts    = parseInt(Array.isArray(params.pts)    ? params.pts[0]    : (params.pts    || '0'));

  const [activeTab, setActiveTab] = useState<'takim' | 'oyuncular'>('takim');

  // Form + gerçek sezon istatistikleri
  const [recentForm,  setRecentForm]  = useState<string[]>([]);
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const [formLoadError, setFormLoadError] = useState(false);

  // Kadro + golcüler (football-data.org, güncel sezon)
  const [fdSquad,      setFdSquad]      = useState<FDSquadPlayer[]>([]);
  const [fdScorers,    setFdScorers]    = useState<FDScorer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playersLoadError, setPlayersLoadError] = useState(false);
  const [showFullSquad, setShowFullSquad]   = useState(false);

  // AllSports (korner + possession)
  const [allSportsStats, setAllSportsStats] = useState<AllSportsTeamStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Süper Lig specific
  const [slForm, setSlForm]           = useState<string[]>([]);
  const [slSeasonStats, setSlSeasonStats] = useState<SeasonStats | null>(null);
  const [slPlayers, setSlPlayers]     = useState<SLPlayer[]>([]);
  const [slTeamScorers, setSlTeamScorers] = useState<SLScorer[]>([]);

  const averaj = gf - ga;
  const winPct = played > 0 ? Math.round((win / played) * 100) : 0;
  const initials = teamName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const rankColors = isDark ? DARK_RANK_COLORS : LIGHT_RANK_COLORS;
  const assistColor = isDark ? '#E3B341' : '#E65100';
  const assistBg = isDark ? '#2A1F00' : '#FFF3E0';

  const isSportsDbLeague = apiId === 203;
  const displayForm = isSportsDbLeague ? slForm : recentForm;
  const activeSeasonStats = isSportsDbLeague ? slSeasonStats : seasonStats;
  const lacksProviderTeamId = !isSportsDbLeague && !teamId;

  useEffect(() => {
    loadForm();
    loadPlayers();
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
    setFdSquad([]);
    setFdScorers([]);
    setAllSportsStats(null);
    try {
      await Promise.allSettled([
        loadForm(),
        loadPlayers(),
        loadAllSports(),
        isSportsDbLeague ? loadSLData() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  async function recordRecentlyViewed() {
    try {
      const raw = await AsyncStorage.getItem('scout_recent');
      const list = raw ? JSON.parse(raw) : [];
      const filtered = (list as { id: number; apiId: number }[]).filter((r) => !(r.id === teamId && r.apiId === apiId));
      const updated = [{ id: teamId, name: teamName, leagueName, apiId, timestamp: Date.now() }, ...filtered].slice(0, 10);
      await AsyncStorage.setItem('scout_recent', JSON.stringify(updated));
    } catch {}
  }

  async function loadForm() {
    if (!teamId || isSportsDbLeague) return;
    setLoadingForm(true);
    setFormLoadError(false);
    try {
      const matches = await getTeamForm(teamId);
      const form = matches
        .filter((m) => m.score?.fullTime?.home != null)
        .slice(-5)
        .map((m) => {
          const isHome = m.homeTeam?.id === teamId;
          const gfor = isHome ? m.score.fullTime.home : m.score.fullTime.away;
          const gag  = isHome ? m.score.fullTime.away : m.score.fullTime.home;
          return (gfor ?? 0) > (gag ?? 0) ? 'G' : (gfor ?? 0) === (gag ?? 0) ? 'B' : 'M';
        });
      setRecentForm(form);
      setSeasonStats(calcSeasonStats(matches, teamId));
    } catch {
      setFormLoadError(true);
    }
    setLoadingForm(false);
  }

  async function loadPlayers() {
    if (!teamId || !fdId || isSportsDbLeague) return;
    setLoadingPlayers(true);
    setPlayersLoadError(false);
    try {
      const [teamData, scorers] = await Promise.all([
        getFdTeamData(teamId),
        getTopScorers(fdId),
      ]);
      if (teamData?.squad) setFdSquad(teamData.squad);
      const teamScorers = scorers.filter((s) =>
        s.team?.id === teamId || teamsMatch(s.team?.name || '', teamName)
      );
      setFdScorers(teamScorers);
    } catch {
      setPlayersLoadError(true);
    }
    setLoadingPlayers(false);
  }

  async function loadAllSports() {
    try {
      const data = await getAllSportsTeamStats(teamName);
      setAllSportsStats(data);
    } catch (e) {
      console.error('loadAllSports hata:', e);
    }
  }

  async function loadSLData() {
    if (!teamId) return;
    setLoadingForm(true);
    setLoadingPlayers(true);
    try {
      const [formMatches, players, allScorers] = await Promise.all([
        getSuperLigTeamForm(teamId),
        apiId === 203 ? getSuperLigPlayers(teamId) : Promise.resolve([]),
        apiId === 203 ? getSuperLigScorers() : Promise.resolve([]),
      ]);

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

      // Oyuncu listesi
      setSlPlayers(players);

      // Takıma özgü gol krallığı filtresi — diakriti eşleştirme
      if (apiId === 203) {
        const normalTeamName = transliterate(teamName);
        const teamScorers = allScorers.filter((s) =>
          transliterate(s.team || '').includes(normalTeamName) ||
          normalTeamName.includes(transliterate(s.team || ''))
        );
        setSlTeamScorers(teamScorers);
      } else {
        setSlTeamScorers([]);
      }
    } catch {
      setFormLoadError(true);
      setPlayersLoadError(true);
    }
    setLoadingForm(false);
    setLoadingPlayers(false);
  }

  const topScorers = useMemo(() =>
    [...fdScorers].sort((a, b) => (b.goals || 0) - (a.goals || 0)).slice(0, 5),
    [fdScorers],
  );

  const topAssists = useMemo(() =>
    [...fdScorers].filter(s => (s.assists || 0) > 0).sort((a, b) => (b.assists || 0) - (a.assists || 0)).slice(0, 5),
    [fdScorers],
  );

  const groupedSquad = useMemo(() =>
    AF_POSITION_ORDER.reduce((acc, pos) => {
      const players = fdSquad.filter(p => (POSITION_TO_CODE[p.position || ''] || 'M') === pos);
      if (players.length > 0) acc[pos] = players;
      return acc;
    }, {} as Record<string, FDSquadPlayer[]>),
    [fdSquad],
  );

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

        <View style={[styles.toggleRow, { backgroundColor: c.surfaceAlt }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, activeTab === 'takim' && [styles.toggleBtnActive, { backgroundColor: c.surface, borderColor: c.border }]]}
            onPress={() => setActiveTab('takim')}
          >
            <Text style={[styles.toggleBtnText, { color: c.textMuted }, activeTab === 'takim' && { color: c.text }]}>
              Takım İstatistikleri
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, activeTab === 'oyuncular' && [styles.toggleBtnActive, { backgroundColor: c.surface, borderColor: c.border }]]}
            onPress={() => setActiveTab('oyuncular')}
          >
            <Text style={[styles.toggleBtnText, { color: c.textMuted }, activeTab === 'oyuncular' && { color: c.text }]}>
              Oyuncular
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'takim' && (
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
            {allSportsStats && (
              <>
                <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>
                  KORNER & POZİSYON ({allSportsStats.matchesAnalyzed} maç)
                </Text>
                <View style={styles.statGrid}>
                  {allSportsStats.avgCorners != null && (
                    <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                      <Text style={[styles.statVal, { color: c.primary }]}>{allSportsStats.avgCorners}</Text>
                      <Text style={[styles.statLbl, { color: c.textMuted }]}>Ort. Korner</Text>
                    </View>
                  )}
                  {allSportsStats.avgOppCorners != null && (
                    <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                      <Text style={[styles.statVal, { color: c.textMuted }]}>{allSportsStats.avgOppCorners}</Text>
                      <Text style={[styles.statLbl, { color: c.textMuted }]}>Rakip Korner</Text>
                    </View>
                  )}
                  {allSportsStats.avgCorners != null && allSportsStats.avgOppCorners != null && (
                    <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                      <Text style={[styles.statVal, { color: c.text }]}>
                        {(allSportsStats.avgCorners + allSportsStats.avgOppCorners).toFixed(1)}
                      </Text>
                      <Text style={[styles.statLbl, { color: c.textMuted }]}>Toplam Ort.</Text>
                    </View>
                  )}
                  {allSportsStats.avgPossession != null && (
                    <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                      <Text style={[styles.statVal, { color: c.primary }]}>{allSportsStats.avgPossession}%</Text>
                      <Text style={[styles.statLbl, { color: c.textMuted }]}>Ort. Possession</Text>
                    </View>
                  )}
                </View>
              </>
            )}

          </>
        )}

        {activeTab === 'oyuncular' && apiId === 203 && (
          loadingPlayers ? (
            <SkeletonPlayerList />
          ) : playersLoadError ? (
            <EmptyStateCard
              compact
              icon="👥"
              title="Oyuncu verisi alınamadı"
              onRetry={loadSLData}
            />
          ) : !showFullSquad ? (
            <>
              {slTeamScorers.length > 0 ? (
                <>
                  <View style={styles.catLabel}>
                    <Text style={[styles.catLabelText, { color: c.textMuted }]}>EN FAZLA GOL (Bu Sezon)</Text>
                    <TouchableOpacity onPress={() => setShowFullSquad(true)}>
                      <Text style={[styles.catLabelLink, { color: c.primary }]}>Kadroyu gör ›</Text>
                    </TouchableOpacity>
                  </View>
                  {slTeamScorers.slice(0, 5).map((s, i: number) => (
                    <View key={i}>
                      <View style={[styles.topPlayer, { borderBottomColor: c.border }, i === Math.min(slTeamScorers.length, 5) - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[styles.rankBadge, { backgroundColor: rankColors[i]?.bg || c.primaryLight }]}>
                          <Text style={[styles.rankText, { color: rankColors[i]?.color || c.primaryDark }]}>{i + 1}</Text>
                        </View>
                        <View style={[styles.playerPhotoPlaceholder, { backgroundColor: c.primaryLight }]} />
                        <View style={styles.topPlayerInfo}>
                          <Text style={[styles.topPlayerName, { color: c.text }]}>{s.name}</Text>
                        </View>
                        <Text style={[styles.topPlayerVal, { color: c.primary }]}>{s.goals}</Text>
                      </View>
                      <View style={styles.barRow}>
                        <View style={[styles.barBg, { backgroundColor: c.borderLight }]}>
                          <View style={[styles.barFill, { width: `${(s.goals / (slTeamScorers[0]?.goals || 1)) * 100}%`, backgroundColor: c.primary }]} />
                        </View>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity style={[styles.seeAllBtn, { borderTopColor: c.border }]} onPress={() => setShowFullSquad(true)}>
                    <Text style={[styles.seeAllText, { color: c.primary }]}>Tüm kadroyu gör ›</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <EmptyStateCard compact icon="⚽" title="Bu sezon gol istatistiği bulunamadı." />
                  <TouchableOpacity style={[styles.seeAllBtn, { borderTopColor: c.border }]} onPress={() => setShowFullSquad(true)}>
                    <Text style={[styles.seeAllText, { color: c.primary }]}>Kadroyu gör ›</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.backToStats, { borderBottomColor: c.border }]} onPress={() => setShowFullSquad(false)}>
                <Text style={[styles.backToStatsText, { color: c.primary }]}>‹ İstatistiklere dön</Text>
              </TouchableOpacity>
              {slPlayers.length === 0 ? (
                <EmptyStateCard compact icon="👥" title="Kadro verisi bulunamadı." />
              ) : (
                AF_POSITION_ORDER.map(pos => {
                  const players = slPlayers.filter((p) => (POSITION_TO_CODE[p.position || ''] || 'M') === pos);
                  if (players.length === 0) return null;
                  return (
                    <View key={pos}>
                      <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>{AF_POSITION_MAP[pos]}</Text>
                      {players.map((p, i: number) => {
                        const scorer = slTeamScorers.find((s) => s.name === p.name);
                        return (
                          <View key={i} style={[styles.playerItem, { borderBottomColor: c.border }]}>
                            <View style={[styles.playerPhotoSmall, { backgroundColor: c.primaryLight }]} />
                            <View style={styles.playerInfo}>
                              <Text style={[styles.playerName, { color: c.text }]}>{p.name}</Text>
                              <Text style={[styles.playerNat, { color: c.textMuted }]}>{p.nationality}</Text>
                            </View>
                            {scorer && scorer.goals > 0 && (
                              <View style={styles.playerStatBadges}>
                                <View style={[styles.goalBadge, { backgroundColor: c.primaryLight }]}>
                                  <Text style={[styles.goalBadgeText, { color: c.primaryDark }]}>⚽ {scorer.goals}</Text>
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  );
                })
              )}
            </>
          )
        )}

        {activeTab === 'oyuncular' && apiId !== 203 && (
          loadingPlayers ? (
            <SkeletonPlayerList />
          ) : playersLoadError ? (
            <EmptyStateCard
              compact
              icon="👥"
              title="Oyuncu verisi alınamadı"
              onRetry={loadPlayers}
            />
          ) : !showFullSquad ? (
            <>
              {topScorers.length > 0 ? (
                <>
                  <View style={styles.catLabel}>
                    <Text style={[styles.catLabelText, { color: c.textMuted }]}>EN FAZLA GOL (Bu Sezon)</Text>
                    <TouchableOpacity onPress={() => setShowFullSquad(true)}>
                      <Text style={[styles.catLabelLink, { color: c.primary }]}>Kadroyu gör ›</Text>
                    </TouchableOpacity>
                  </View>
                  {topScorers.map((p, i: number) => (
                    <View key={p.player?.id || i}>
                      <View style={[styles.topPlayer, { borderBottomColor: c.border }, i === topScorers.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[styles.rankBadge, { backgroundColor: rankColors[i]?.bg || c.primaryLight }]}>
                          <Text style={[styles.rankText, { color: rankColors[i]?.color || c.primaryDark }]}>{i + 1}</Text>
                        </View>
                        <View style={[styles.playerPhotoPlaceholder, { backgroundColor: c.primaryLight }]} />
                        <View style={styles.topPlayerInfo}>
                          <Text style={[styles.topPlayerName, { color: c.text }]}>{p.player?.name}</Text>
                          <Text style={[styles.topPlayerPos, { color: c.textMuted }]}>{p.playedMatches} maç</Text>
                        </View>
                        <Text style={[styles.topPlayerVal, { color: c.primary }]}>{p.goals}</Text>
                      </View>
                      <View style={styles.barRow}>
                        <View style={[styles.barBg, { backgroundColor: c.borderLight }]}>
                          <View style={[styles.barFill, {
                            width: `${(p.goals / (topScorers[0]?.goals || 1)) * 100}%`,
                            backgroundColor: c.primary,
                          }]} />
                        </View>
                      </View>
                    </View>
                  ))}
                  {topAssists.length > 0 && (
                    <>
                      <View style={[styles.catLabel, { marginTop: 8, borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 12 }]}>
                        <Text style={[styles.catLabelText, { color: c.textMuted }]}>EN FAZLA ASİST (Bu Sezon)</Text>
                      </View>
                      {topAssists.map((p, i: number) => (
                        <View key={p.player?.id || i}>
                          <View style={[styles.topPlayer, { borderBottomColor: c.border }, i === topAssists.length - 1 && { borderBottomWidth: 0 }]}>
                            <View style={[styles.rankBadge, { backgroundColor: rankColors[i]?.bg || c.primaryLight }]}>
                              <Text style={[styles.rankText, { color: rankColors[i]?.color || c.primaryDark }]}>{i + 1}</Text>
                            </View>
                            <View style={[styles.playerPhotoPlaceholder, { backgroundColor: c.primaryLight }]} />
                            <View style={styles.topPlayerInfo}>
                              <Text style={[styles.topPlayerName, { color: c.text }]}>{p.player?.name}</Text>
                              <Text style={[styles.topPlayerPos, { color: c.textMuted }]}>{p.playedMatches} maç</Text>
                            </View>
                            <Text style={[styles.topPlayerVal, { color: assistColor }]}>{p.assists}</Text>
                          </View>
                          <View style={styles.barRow}>
                            <View style={[styles.barBg, { backgroundColor: c.borderLight }]}>
                              <View style={[styles.barFill, {
                                width: `${((p.assists ?? 0) / (topAssists[0]?.assists || 1)) * 100}%`,
                                backgroundColor: assistColor,
                              }]} />
                            </View>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                  <TouchableOpacity style={[styles.seeAllBtn, { borderTopColor: c.border }]} onPress={() => setShowFullSquad(true)}>
                    <Text style={[styles.seeAllText, { color: c.primary }]}>Tüm kadroyu gör ›</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <EmptyStateCard compact icon="⚽" title="Bu sezon gol istatistiği bulunamadı." />
                  <TouchableOpacity style={[styles.seeAllBtn, { borderTopColor: c.border }]} onPress={() => setShowFullSquad(true)}>
                    <Text style={[styles.seeAllText, { color: c.primary }]}>Kadroyu gör ›</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.backToStats, { borderBottomColor: c.border }]} onPress={() => setShowFullSquad(false)}>
                <Text style={[styles.backToStatsText, { color: c.primary }]}>‹ İstatistiklere dön</Text>
              </TouchableOpacity>
              {fdSquad.length === 0 ? (
                <EmptyStateCard compact icon="👥" title="Kadro verisi bulunamadı." />
              ) : (
                AF_POSITION_ORDER.map(pos => {
                  const players = groupedSquad[pos];
                  if (!players) return null;
                  return (
                    <View key={pos}>
                      <Text style={[scoutStyles.sectionLabel, { color: c.textMuted }]}>{AF_POSITION_MAP[pos]}</Text>
                      {players.map((p, i: number) => {
                        const scorer = fdScorers.find((s) =>
                          s.player?.id === p.id || teamsMatch(s.player?.name || '', p.name)
                        );
                        return (
                          <View key={i} style={[styles.playerItem, { borderBottomColor: c.border }]}>
                            <View style={[styles.playerPhotoSmall, { backgroundColor: c.primaryLight }]} />
                            <View style={styles.playerInfo}>
                              <Text style={[styles.playerName, { color: c.text }]}>{p.name}</Text>
                              <Text style={[styles.playerNat, { color: c.textMuted }]}>{p.nationality}</Text>
                            </View>
                            {scorer && (
                              <View style={styles.playerStatBadges}>
                                {scorer.goals > 0 && (
                                  <View style={[styles.goalBadge, { backgroundColor: c.primaryLight }]}>
                                    <Text style={[styles.goalBadgeText, { color: c.primaryDark }]}>⚽ {scorer.goals}</Text>
                                  </View>
                                )}
                                {(scorer.assists ?? 0) > 0 && (
                                  <View style={[styles.assistBadge, { backgroundColor: assistBg }]}>
                                    <Text style={[styles.assistBadgeText, { color: assistColor }]}>🅰️ {scorer.assists}</Text>
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  );
                })
              )}
            </>
          )
        )}

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
  toggleRow:           { flexDirection: 'row', margin: 14, borderRadius: 8, padding: 3 },
  toggleBtn:           { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  toggleBtnActive:     { borderWidth: 0.5 },
  toggleBtnText:       { fontSize: 13 },
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
  catLabel:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  catLabelText:        { fontSize: 11, fontWeight: '500', letterSpacing: 0.5 },
  catLabelLink:        { fontSize: 11 },
  topPlayer:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, gap: 10 },
  rankBadge:           { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rankText:            { fontSize: 11, fontWeight: '500' },
  playerPhotoPlaceholder: { width: 32, height: 32, borderRadius: 16 },
  topPlayerInfo:       { flex: 1 },
  topPlayerName:       { fontSize: 13, fontWeight: '500' },
  topPlayerPos:        { fontSize: 11, marginTop: 1 },
  topPlayerVal:        { fontSize: 16, fontWeight: '500' },
  barRow:              { paddingHorizontal: 14, paddingBottom: 4 },
  barBg:               { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill:             { height: '100%', borderRadius: 2 },
  seeAllBtn:           { borderTopWidth: 0.5, paddingVertical: 12, alignItems: 'center' },
  seeAllText:          { fontSize: 13 },
  backToStats:         { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  backToStatsText:     { fontSize: 13 },
  noDataBox:           { margin: 20, padding: 20, borderRadius: 10, alignItems: 'center' },
  noDataText:          { fontSize: 13, textAlign: 'center' },
  playerItem:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, gap: 10 },
  playerPhotoSmall:    { width: 36, height: 36, borderRadius: 18 },
  playerInfo:          { flex: 1 },
  playerName:          { fontSize: 13, fontWeight: '500' },
  playerNat:           { fontSize: 11, marginTop: 2 },
  playerStatBadges:    { flexDirection: 'row', gap: 4 },
  goalBadge:           { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  goalBadgeText:       { fontSize: 11 },
  assistBadge:         { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  assistBadgeText:     { fontSize: 11 },
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
