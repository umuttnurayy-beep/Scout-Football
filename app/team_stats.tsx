import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import {
  getAfLeagueTeams, getAfTeamStats,
  getAllSportsTeamStats, getFdTeamData, getTeamForm, getTopScorers,
  getSuperLigTeamForm, getSuperLigPlayers, getSuperLigScorers,
} from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { formDataEmptyMessage } from '../utils/emptyStates';

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

const RANK_COLORS = [
  { bg: '#FAEEDA', color: '#633806' },
  { bg: '#D3D1C7', color: '#2C2C2A' },
  { bg: '#F5C4B3', color: '#712B13' },
];

function normalizeTeamName(name: string): string {
  return name.toLowerCase()
    .replace(/\b(fc|afc|cf|sc)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function transliterate(s: string): string {
  return s.toLowerCase()
    .replace(/[İı]/g, 'i').replace(/[ğ]/g, 'g')
    .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .replace(/\s+/g, ' ').trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function sumCards(cardsObj: any): number {
  if (!cardsObj) return 0;
  return Object.values(cardsObj).reduce((s: number, v: any) => s + (v?.total || 0), 0);
}

function calcSeasonStats(matches: any[], teamId: number) {
  const finished = matches.filter((m: any) => m.score?.fullTime?.home != null);
  const total = finished.length;
  if (total === 0) return null;

  let over15 = 0, over25 = 0, over35 = 0;
  let btts = 0, cleanSheet = 0, failedToScore = 0;
  let homeW = 0, homeD = 0, homeL = 0, homePlayed = 0;
  let awayW = 0, awayD = 0, awayL = 0, awayPlayed = 0;
  let totalGF = 0, totalGA = 0;

  for (const m of finished) {
    const isHome = m.homeTeam?.id === teamId;
    const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    const totalGoals = (m.score.fullTime.home ?? 0) + (m.score.fullTime.away ?? 0);

    totalGF += gf;
    totalGA += ga;
    if (totalGoals > 1.5) over15++;
    if (totalGoals > 2.5) over25++;
    if (totalGoals > 3.5) over35++;
    if (gf > 0 && ga > 0) btts++;
    if (ga === 0) cleanSheet++;
    if (gf === 0) failedToScore++;

    if (isHome) {
      homePlayed++;
      if (gf > ga) homeW++;
      else if (gf === ga) homeD++;
      else homeL++;
    } else {
      awayPlayed++;
      if (gf > ga) awayW++;
      else if (gf === ga) awayD++;
      else awayL++;
    }
  }

  return {
    total,
    over15Pct: Math.round((over15 / total) * 100),
    over25Pct: Math.round((over25 / total) * 100),
    over35Pct: Math.round((over35 / total) * 100),
    bttsPct:   Math.round((btts / total) * 100),
    cleanSheetPct:    Math.round((cleanSheet / total) * 100),
    failedToScorePct: Math.round((failedToScore / total) * 100),
    avgGF: (totalGF / total).toFixed(1),
    avgGA: (totalGA / total).toFixed(1),
    home: { played: homePlayed, win: homeW, draw: homeD, loss: homeL },
    away: { played: awayPlayed, win: awayW, draw: awayD, loss: awayL },
  };
}

function calcSLSeasonStats(matches: any[], teamId: number) {
  const total = matches.length;
  if (total === 0) return null;
  let over15 = 0, over25 = 0, over35 = 0;
  let btts = 0, cleanSheet = 0, failedToScore = 0;
  let homeW = 0, homeD = 0, homeL = 0, homePlayed = 0;
  let awayW = 0, awayD = 0, awayL = 0, awayPlayed = 0;
  let totalGF = 0, totalGA = 0;
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    const totalGoals = m.homeScore + m.awayScore;
    totalGF += gf; totalGA += ga;
    if (totalGoals > 1.5) over15++;
    if (totalGoals > 2.5) over25++;
    if (totalGoals > 3.5) over35++;
    if (gf > 0 && ga > 0) btts++;
    if (ga === 0) cleanSheet++;
    if (gf === 0) failedToScore++;
    if (isHome) {
      homePlayed++;
      if (gf > ga) homeW++; else if (gf === ga) homeD++; else homeL++;
    } else {
      awayPlayed++;
      if (gf > ga) awayW++; else if (gf === ga) awayD++; else awayL++;
    }
  }
  return {
    total,
    over15Pct: Math.round((over15 / total) * 100),
    over25Pct: Math.round((over25 / total) * 100),
    over35Pct: Math.round((over35 / total) * 100),
    bttsPct:   Math.round((btts / total) * 100),
    cleanSheetPct:    Math.round((cleanSheet / total) * 100),
    failedToScorePct: Math.round((failedToScore / total) * 100),
    avgGF: (totalGF / total).toFixed(1),
    avgGA: (totalGA / total).toFixed(1),
    home: { played: homePlayed, win: homeW, draw: homeD, loss: homeL },
    away: { played: awayPlayed, win: awayW, draw: awayD, loss: awayL },
  };
}

function getTeamProfile(avgGf: number, avgGa: number, winPct: number, isDark: boolean) {
  const total = avgGf + avgGa;
  if (avgGf >= 2.0 && avgGa <= 1.0)
    return { label: 'Dominant', emoji: '👑', color: isDark ? '#79AAFF' : '#1565C0', desc: 'Hem hücum hem savunmada ligde öne çıkıyor. Rakipleri için en zor karşılaşmalardan biri.' };
  if (total > 3.2)
    return { label: 'Tempolu', emoji: '⚡', color: '#E65100', desc: 'Karşılıklı gol ve yüksek tempo bu takımın imzası. Maçları genellikle çok gollü geçiyor.' };
  if (avgGf >= 1.8 && avgGa >= 1.4)
    return { label: 'Hücumcu', emoji: '⚽', color: isDark ? '#58A6FF' : '#185FA5', desc: 'Güçlü hücumla gol üreten ama savunmada bedel ödeyen bir takım. Yüksek skorlu maç profili.' };
  if (avgGf <= 1.0 && avgGa <= 0.8)
    return { label: 'Katı Savunmacı', emoji: '🛡️', color: isDark ? '#3FB950' : '#1B5E20', desc: 'Yenilmezlik üzerine kurulu bir sistem. Az gol, az yenilen — sağlam ama az gollü maçlar.' };
  if (avgGf <= 1.2 && avgGa <= 1.0)
    return { label: 'Savunmacı', emoji: '🛡️', color: isDark ? '#56D364' : '#388E3C', desc: 'Savunma odaklı, kontrollü bir oyun anlayışı. Riskten kaçınan ve sağlam bir yapı.' };
  if (avgGa > 1.7)
    return { label: 'Kırılgan Savunma', emoji: '🚨', color: isDark ? '#F85149' : '#A32D2D', desc: 'Savunma beklenmedik gol yeme riski taşıyor. Hücumuyla öne geçse de arkasında açık var.' };
  if (winPct >= 55 && avgGf >= 1.5)
    return { label: 'Kontrollü', emoji: '📈', color: isDark ? '#1F6FEB' : '#0C447C', desc: 'Galibiyet yüzdesi ve gol dengesi iyi. Ligde üst sıralarda tutarlı bir güç.' };
  return { label: 'Dengeli', emoji: '⚖️', color: isDark ? '#B1BAC4' : '#555', desc: 'Hücum ve savunma arasında denge kurmuş, her türlü rakiple yarışabilen bir takım.' };
}

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
  const [seasonStats, setSeasonStats] = useState<any>(null);
  const [loadingForm, setLoadingForm] = useState(false);

  // Geçen sezon AF detayları (2024)
  const [afTeamStats, setAfTeamStats] = useState<any>(null);
  const [loadingAf,   setLoadingAf]   = useState(false);

  // Kadro + golcüler (football-data.org, güncel sezon)
  const [fdSquad,      setFdSquad]      = useState<any[]>([]);
  const [fdScorers,    setFdScorers]    = useState<any[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [showFullSquad, setShowFullSquad]   = useState(false);

  // AllSports (korner + possession)
  const [allSportsStats, setAllSportsStats] = useState<any>(null);

  // Süper Lig specific
  const [slForm, setSlForm]           = useState<string[]>([]);
  const [slSeasonStats, setSlSeasonStats] = useState<any>(null);
  const [slPlayers, setSlPlayers]     = useState<any[]>([]);
  const [slTeamScorers, setSlTeamScorers] = useState<any[]>([]);

  const averaj = gf - ga;
  const winPct = played > 0 ? Math.round((win / played) * 100) : 0;
  const initials = teamName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const displayForm = apiId === 203 ? slForm : recentForm;
  const activeSeasonStats = apiId === 203 ? slSeasonStats : seasonStats;

  useEffect(() => {
    loadForm();
    loadAfData();
    loadPlayers();
    loadAllSports();
    if (apiId === 203) loadSLData();
    if (teamId) recordRecentlyViewed();
    // Team route params are fixed for this screen instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recordRecentlyViewed() {
    try {
      const raw = await AsyncStorage.getItem('scout_recent');
      const list = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((r: any) => !(r.id === teamId && r.apiId === apiId));
      const updated = [{ id: teamId, name: teamName, leagueName, apiId, timestamp: Date.now() }, ...filtered].slice(0, 10);
      await AsyncStorage.setItem('scout_recent', JSON.stringify(updated));
    } catch {}
  }

  async function loadForm() {
    if (!teamId || apiId === 203) return;
    setLoadingForm(true);
    try {
      const matches = await getTeamForm(teamId);
      const form = matches
        .filter((m: any) => m.score?.fullTime?.home != null)
        .slice(-5)
        .map((m: any) => {
          const isHome = m.homeTeam?.id === teamId;
          const gfor = isHome ? m.score.fullTime.home : m.score.fullTime.away;
          const gag  = isHome ? m.score.fullTime.away : m.score.fullTime.home;
          return gfor > gag ? 'G' : gfor === gag ? 'B' : 'M';
        });
      setRecentForm(form);
      setSeasonStats(calcSeasonStats(matches, teamId));
    } catch (e) {
      console.log('loadForm hata:', e);
    }
    setLoadingForm(false);
  }

  async function loadAfData() {
    if (!apiId) return;
    setLoadingAf(true);
    try {
      const teams = await getAfLeagueTeams(apiId, 2024);
      const afTeam = teams.find((t: any) => teamsMatch(t.name, teamName));
      if (afTeam) {
        const stats = await getAfTeamStats(apiId, afTeam.id, 2024);
        setAfTeamStats(stats);
      }
    } catch (e) {
      console.log('loadAfData hata:', e);
    }
    setLoadingAf(false);
  }

  async function loadPlayers() {
    if (!teamId || !fdId) return;
    setLoadingPlayers(true);
    try {
      const [teamData, scorers] = await Promise.all([
        getFdTeamData(teamId),
        getTopScorers(fdId),
      ]);
      if (teamData?.squad) setFdSquad(teamData.squad);
      const teamScorers = (scorers || []).filter((s: any) =>
        s.team?.id === teamId || teamsMatch(s.team?.name || '', teamName)
      );
      setFdScorers(teamScorers);
    } catch (e) {
      console.log('loadPlayers hata:', e);
    }
    setLoadingPlayers(false);
  }

  async function loadAllSports() {
    try {
      const data = await getAllSportsTeamStats(teamName);
      setAllSportsStats(data);
    } catch (e) {
      console.log('loadAllSports hata:', e);
    }
  }

  async function loadSLData() {
    if (!teamId) return;
    setLoadingForm(true);
    setLoadingPlayers(true);
    try {
      const [formMatches, players, allScorers] = await Promise.all([
        getSuperLigTeamForm(teamId),
        getSuperLigPlayers(teamId),
        getSuperLigScorers(),
      ]);

      // Form hesapla
      const form = formMatches.slice(-5).map((m: any) => {
        const isHome = m.homeTeamId === teamId;
        const gf = isHome ? m.homeScore : m.awayScore;
        const ga = isHome ? m.awayScore : m.homeScore;
        return gf > ga ? 'G' : gf === ga ? 'B' : 'M';
      });
      setSlForm(form);
      setSlSeasonStats(calcSLSeasonStats(formMatches, teamId));

      // Oyuncu listesi
      setSlPlayers(players);

      // Takıma özgü gol krallığı filtresi — diakriti eşleştirme
      const normalTeamName = transliterate(teamName);
      const teamScorers = allScorers.filter((s: any) =>
        transliterate(s.team || '').includes(normalTeamName) ||
        normalTeamName.includes(transliterate(s.team || ''))
      );
      setSlTeamScorers(teamScorers);
    } catch (e) {
      console.log('loadSLData hata:', e);
    }
    setLoadingForm(false);
    setLoadingPlayers(false);
  }

  const topScorers = [...fdScorers]
    .sort((a: any, b: any) => (b.goals || 0) - (a.goals || 0))
    .slice(0, 5);

  const topAssists = [...fdScorers]
    .filter((s: any) => (s.assists || 0) > 0)
    .sort((a: any, b: any) => (b.assists || 0) - (a.assists || 0))
    .slice(0, 5);

  const groupedSquad = AF_POSITION_ORDER.reduce((acc, pos) => {
    const players = fdSquad.filter((p: any) => (POSITION_TO_CODE[p.position] || 'M') === pos);
    if (players.length > 0) acc[pos] = players;
    return acc;
  }, {} as Record<string, any[]>);

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

      <ScrollView style={styles.scroll}>
        <View style={[styles.teamHeader, { borderBottomColor: c.border }]}>
          <View style={[styles.teamLogo, { backgroundColor: c.primaryLight }]}>
            <Text style={[styles.teamLogoText, { color: c.primaryDark }]}>{initials}</Text>
          </View>
          <View>
            <Text style={[styles.teamTitle, { color: c.text }]}>{teamName}</Text>
            <Text style={[styles.teamSub, { color: c.textMuted }]}>{leagueFlag} {leagueName} · 2025/26</Text>
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
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>SON FORM</Text>
            <View style={styles.formRow}>
              {(loadingForm || loadingAf) && displayForm.length === 0 ? (
                <ActivityIndicator color={c.primary} />
              ) : displayForm.length === 0 ? (
                <Text style={[styles.formNote, { color: c.textMuted }]}>{formDataEmptyMessage()}</Text>
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
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>MAÇ ÖZETİ</Text>
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
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>GOL</Text>
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
              <ActivityIndicator color={c.primary} style={{ margin: 14 }} />
            ) : activeSeasonStats ? (
              <>
                <Text style={[styles.sectionLabel, { color: c.textMuted }]}>
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

                <Text style={[styles.sectionLabel, { color: c.textMuted }]}>ÖZEL DURUMLAR</Text>
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
                <Text style={[styles.sectionLabel, { color: c.textMuted }]}>İÇ SAHA vs DEPLASMAN</Text>
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
              <Text style={[styles.noDataSmall, { color: c.textFaint }]}>Veri yükleniyor...</Text>
            )}

            {/* KORNER & POSSESSION — AllSports */}
            {allSportsStats && (
              <>
                <Text style={[styles.sectionLabel, { color: c.textMuted }]}>
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
                        {(parseFloat(allSportsStats.avgCorners) + parseFloat(allSportsStats.avgOppCorners)).toFixed(1)}
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

            {/* GEÇEN SEZON DETAY — AF 2024 */}
            {afTeamStats && (
              <>
                <Text style={[styles.sectionLabel, { color: c.textMuted }]}>GEÇEN SEZON DETAY (2024/25)</Text>
                <View style={styles.statGrid}>
                  <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                    <Text style={[styles.statVal, { color: c.text }]}>{afTeamStats.clean_sheet?.total ?? '-'}</Text>
                    <Text style={[styles.statLbl, { color: c.textMuted }]}>Kalesini sıfır</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                    <Text style={[styles.statVal, { color: c.text }]}>{afTeamStats.failed_to_score?.total ?? '-'}</Text>
                    <Text style={[styles.statLbl, { color: c.textMuted }]}>Gol atamadı</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                    <Text style={[styles.statVal, { color: c.text }]}>{sumCards(afTeamStats.cards?.yellow)}</Text>
                    <Text style={[styles.statLbl, { color: c.textMuted }]}>Sarı kart</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                    <Text style={[styles.statVal, { color: c.text }]}>{sumCards(afTeamStats.cards?.red)}</Text>
                    <Text style={[styles.statLbl, { color: c.textMuted }]}>Kırmızı kart</Text>
                  </View>
                </View>
              </>
            )}

          </>
        )}

        {activeTab === 'oyuncular' && apiId === 203 && (
          loadingPlayers ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
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
                  {slTeamScorers.slice(0, 5).map((s: any, i: number) => (
                    <View key={i}>
                      <View style={[styles.topPlayer, { borderBottomColor: c.border }, i === Math.min(slTeamScorers.length, 5) - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[i]?.bg || c.primaryLight }]}>
                          <Text style={[styles.rankText, { color: RANK_COLORS[i]?.color || c.primaryDark }]}>{i + 1}</Text>
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
                  <View style={[styles.noDataBox, { backgroundColor: c.surfaceAlt }]}>
                    <Text style={[styles.noDataText, { color: c.textSub }]}>Bu sezon gol istatistiği bulunamadı.</Text>
                  </View>
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
                <View style={[styles.noDataBox, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.noDataText, { color: c.textSub }]}>Kadro verisi bulunamadı.</Text>
                </View>
              ) : (
                AF_POSITION_ORDER.map(pos => {
                  const players = slPlayers.filter((p: any) => (POSITION_TO_CODE[p.position] || 'M') === pos);
                  if (players.length === 0) return null;
                  return (
                    <View key={pos}>
                      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>{AF_POSITION_MAP[pos]}</Text>
                      {players.map((p: any, i: number) => {
                        const scorer = slTeamScorers.find((s: any) => s.name === p.name);
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
            <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
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
                  {topScorers.map((p: any, i: number) => (
                    <View key={p.player?.id || i}>
                      <View style={[styles.topPlayer, { borderBottomColor: c.border }, i === topScorers.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[i]?.bg || c.primaryLight }]}>
                          <Text style={[styles.rankText, { color: RANK_COLORS[i]?.color || c.primaryDark }]}>{i + 1}</Text>
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
                      {topAssists.map((p: any, i: number) => (
                        <View key={p.player?.id || i}>
                          <View style={[styles.topPlayer, { borderBottomColor: c.border }, i === topAssists.length - 1 && { borderBottomWidth: 0 }]}>
                            <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[i]?.bg || c.primaryLight }]}>
                              <Text style={[styles.rankText, { color: RANK_COLORS[i]?.color || c.primaryDark }]}>{i + 1}</Text>
                            </View>
                            <View style={[styles.playerPhotoPlaceholder, { backgroundColor: c.primaryLight }]} />
                            <View style={styles.topPlayerInfo}>
                              <Text style={[styles.topPlayerName, { color: c.text }]}>{p.player?.name}</Text>
                              <Text style={[styles.topPlayerPos, { color: c.textMuted }]}>{p.playedMatches} maç</Text>
                            </View>
                            <Text style={[styles.topPlayerVal, { color: '#E65100' }]}>{p.assists}</Text>
                          </View>
                          <View style={styles.barRow}>
                            <View style={[styles.barBg, { backgroundColor: c.borderLight }]}>
                              <View style={[styles.barFill, {
                                width: `${(p.assists / (topAssists[0]?.assists || 1)) * 100}%`,
                                backgroundColor: '#E65100',
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
                  <View style={[styles.noDataBox, { backgroundColor: c.surfaceAlt }]}>
                    <Text style={[styles.noDataText, { color: c.textSub }]}>Bu sezon gol istatistiği bulunamadı.</Text>
                  </View>
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
                <View style={[styles.noDataBox, { backgroundColor: c.surfaceAlt }]}>
                  <Text style={[styles.noDataText, { color: c.textSub }]}>Kadro verisi bulunamadı.</Text>
                </View>
              ) : (
                AF_POSITION_ORDER.map(pos => {
                  const players = groupedSquad[pos];
                  if (!players) return null;
                  return (
                    <View key={pos}>
                      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>{AF_POSITION_MAP[pos]}</Text>
                      {players.map((p: any, i: number) => {
                        const scorer = fdScorers.find((s: any) =>
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
                                {scorer.assists > 0 && (
                                  <View style={styles.assistBadge}>
                                    <Text style={styles.assistBadgeText}>🅰️ {scorer.assists}</Text>
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
  sectionLabel:        { fontSize: 11, fontWeight: '500', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, letterSpacing: 0.5 },
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
  assistBadge:         { backgroundColor: '#FFF3E0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  assistBadgeText:     { fontSize: 11, color: '#E65100' },
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
