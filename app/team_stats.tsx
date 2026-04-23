import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import {
  getAfLeagueTeams, getAfTeamStats,
  getAllSportsTeamStats, getFdTeamData, getTeamForm, getTopScorers,
  getSuperLigTeamForm, getSuperLigPlayers, getSuperLigScorers,
} from '../services/api';

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

function getTeamProfile(avgGf: number, avgGa: number, winPct: number) {
  const total = avgGf + avgGa;
  if (avgGf >= 2.0 && avgGa <= 1.0)
    return { label: 'Dominant', emoji: '👑', color: '#1565C0', desc: 'Hem hücum hem savunmada ligde öne çıkıyor. Rakipleri için en zor karşılaşmalardan biri.' };
  if (total > 3.2)
    return { label: 'Tempolu', emoji: '⚡', color: '#E65100', desc: 'Karşılıklı gol ve yüksek tempo bu takımın imzası. Maçları genellikle çok gollü geçiyor.' };
  if (avgGf >= 1.8 && avgGa >= 1.4)
    return { label: 'Hücumcu', emoji: '⚽', color: '#185FA5', desc: 'Güçlü hücumla gol üreten ama savunmada bedel ödeyen bir takım. Yüksek skorlu maç profili.' };
  if (avgGf <= 1.0 && avgGa <= 0.8)
    return { label: 'Katı Savunmacı', emoji: '🛡️', color: '#1B5E20', desc: 'Yenilmezlik üzerine kurulu bir sistem. Az gol, az yenilen — sağlam ama az gollü maçlar.' };
  if (avgGf <= 1.2 && avgGa <= 1.0)
    return { label: 'Savunmacı', emoji: '🛡️', color: '#388E3C', desc: 'Savunma odaklı, kontrollü bir oyun anlayışı. Riskten kaçınan ve sağlam bir yapı.' };
  if (avgGa > 1.7)
    return { label: 'Kırılgan Savunma', emoji: '🚨', color: '#A32D2D', desc: 'Savunma beklenmedik gol yeme riski taşıyor. Hücumuyla öne geçse de arkasında açık var.' };
  if (winPct >= 55 && avgGf >= 1.5)
    return { label: 'Kontrollü', emoji: '📈', color: '#0C447C', desc: 'Galibiyet yüzdesi ve gol dengesi iyi. Ligde üst sıralarda tutarlı bir güç.' };
  return { label: 'Dengeli', emoji: '⚖️', color: '#555', desc: 'Hücum ve savunma arasında denge kurmuş, her türlü rakiple yarışabilen bir takım.' };
}

export default function TeamStatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

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

  const avg_gf = played > 0 ? (gf / played).toFixed(1) : '0';
  const avg_ga = played > 0 ? (ga / played).toFixed(1) : '0';
  const averaj = gf - ga;
  const winPct = played > 0 ? Math.round((win / played) * 100) : 0;
  const initials = teamName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const afFormArr: string[] = afTeamStats?.form
    ? afTeamStats.form.slice(-5).split('').map((c: string) => c === 'W' ? 'G' : c === 'D' ? 'B' : 'M')
    : [];
  const displayForm = apiId === 203
    ? slForm
    : afFormArr.length > 0 ? afFormArr : recentForm;
  const activeSeasonStats = apiId === 203 ? slSeasonStats : seasonStats;

  useEffect(() => {
    loadForm();
    loadAfData();
    loadPlayers();
    loadAllSports();
    if (apiId === 203) loadSLData();
    if (teamId) recordRecentlyViewed();
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
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>{teamName}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.teamHeader}>
          <View style={styles.teamLogo}>
            <Text style={styles.teamLogoText}>{initials}</Text>
          </View>
          <View>
            <Text style={styles.teamTitle}>{teamName}</Text>
            <Text style={styles.teamSub}>{leagueFlag} {leagueName} · 2025/26</Text>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, activeTab === 'takim' && styles.toggleBtnActive]}
            onPress={() => setActiveTab('takim')}
          >
            <Text style={[styles.toggleBtnText, activeTab === 'takim' && styles.toggleBtnTextActive]}>
              Takım İstatistikleri
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, activeTab === 'oyuncular' && styles.toggleBtnActive]}
            onPress={() => setActiveTab('oyuncular')}
          >
            <Text style={[styles.toggleBtnText, activeTab === 'oyuncular' && styles.toggleBtnTextActive]}>
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
              const profile = getTeamProfile(avgGf, avgGa, winPct);
              return (
                <View style={[styles.profileCard, { borderLeftColor: profile.color }]}>
                  <View style={styles.profileTop}>
                    <Text style={styles.profileEmoji}>{profile.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.profileLabel, { color: profile.color }]}>{profile.label}</Text>
                      <Text style={styles.profileDesc}>{profile.desc}</Text>
                    </View>
                  </View>
                  <View style={styles.profileStats}>
                    <View style={styles.profileStat}>
                      <Text style={styles.profileStatVal}>{avgGf.toFixed(1)}</Text>
                      <Text style={styles.profileStatLbl}>Gol/Maç</Text>
                    </View>
                    <View style={styles.profileStat}>
                      <Text style={styles.profileStatVal}>{avgGa.toFixed(1)}</Text>
                      <Text style={styles.profileStatLbl}>Yenilen/Maç</Text>
                    </View>
                    <View style={styles.profileStat}>
                      <Text style={styles.profileStatVal}>{winPct}%</Text>
                      <Text style={styles.profileStatLbl}>Galibiyet</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* GENEL */}
            <Text style={styles.sectionLabel}>GENEL</Text>
            <View style={styles.statGrid}>
              <View style={styles.statBox}><Text style={styles.statVal}>{played}</Text><Text style={styles.statLbl}>Oynanan maç</Text></View>
              <View style={styles.statBox}><Text style={styles.statVal}>{pts}</Text><Text style={styles.statLbl}>Puan</Text></View>
              <View style={styles.statBox}><Text style={styles.statVal}>{win}</Text><Text style={styles.statLbl}>Galibiyet</Text></View>
              <View style={styles.statBox}><Text style={styles.statVal}>{draw}</Text><Text style={styles.statLbl}>Beraberlik</Text></View>
              <View style={styles.statBox}><Text style={styles.statVal}>{loss}</Text><Text style={styles.statLbl}>Mağlubiyet</Text></View>
              <View style={styles.statBox}><Text style={styles.statVal}>{winPct}%</Text><Text style={styles.statLbl}>Galibiyet %</Text></View>
            </View>

            {/* GOL */}
            <Text style={styles.sectionLabel}>GOL</Text>
            <View style={styles.statGrid}>
              <View style={styles.statBox}><Text style={styles.statVal}>{gf}</Text><Text style={styles.statLbl}>Atılan gol</Text></View>
              <View style={styles.statBox}><Text style={styles.statVal}>{ga}</Text><Text style={styles.statLbl}>Yenilen gol</Text></View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: averaj >= 0 ? '#27500A' : '#A32D2D' }]}>
                  {averaj >= 0 ? '+' : ''}{averaj}
                </Text>
                <Text style={styles.statLbl}>Averaj</Text>
              </View>
              <View style={styles.statBox}><Text style={styles.statVal}>{avg_gf}</Text><Text style={styles.statLbl}>Gol / maç</Text></View>
              <View style={styles.statBox}><Text style={styles.statVal}>{avg_ga}</Text><Text style={styles.statLbl}>Yenilen / maç</Text></View>
            </View>

            {/* SEZON ANALİZİ — gerçek maç verilerinden */}
            <Text style={styles.sectionLabel}>
              SEZON ANALİZİ{activeSeasonStats ? ` (${activeSeasonStats.total} maç)` : ''}
            </Text>
            {loadingForm && !activeSeasonStats ? (
              <ActivityIndicator color="#185FA5" style={{ margin: 14 }} />
            ) : activeSeasonStats ? (
              <View style={styles.statGrid}>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#185FA5' }]}>{activeSeasonStats.over15Pct}%</Text>
                  <Text style={styles.statLbl}>1.5 Üst</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#185FA5' }]}>{activeSeasonStats.over25Pct}%</Text>
                  <Text style={styles.statLbl}>2.5 Üst</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#185FA5' }]}>{activeSeasonStats.over35Pct}%</Text>
                  <Text style={styles.statLbl}>3.5 Üst</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#185FA5' }]}>{activeSeasonStats.bttsPct}%</Text>
                  <Text style={styles.statLbl}>KG Var</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#27500A' }]}>{activeSeasonStats.cleanSheetPct}%</Text>
                  <Text style={styles.statLbl}>Kale sıfır</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#A32D2D' }]}>{activeSeasonStats.failedToScorePct}%</Text>
                  <Text style={styles.statLbl}>Gol atamadı</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.noDataSmall}>Veri yükleniyor...</Text>
            )}

            {/* İÇ SAHA / DEPLASMAN */}
            {activeSeasonStats && (
              <>
                <Text style={styles.sectionLabel}>İÇ SAHA / DEPLASMAN</Text>
                <View style={styles.splitRow}>
                  <View style={styles.splitBox}>
                    <Text style={styles.splitTitle}>İç Saha</Text>
                    <Text style={styles.splitRecord}>
                      {activeSeasonStats.home.win}G {activeSeasonStats.home.draw}B {activeSeasonStats.home.loss}M
                    </Text>
                    <Text style={styles.splitSub}>{activeSeasonStats.home.played} maç</Text>
                  </View>
                  <View style={styles.splitDivider} />
                  <View style={styles.splitBox}>
                    <Text style={styles.splitTitle}>Deplasman</Text>
                    <Text style={styles.splitRecord}>
                      {activeSeasonStats.away.win}G {activeSeasonStats.away.draw}B {activeSeasonStats.away.loss}M
                    </Text>
                    <Text style={styles.splitSub}>{activeSeasonStats.away.played} maç</Text>
                  </View>
                </View>
              </>
            )}

            {/* KORNER & POSSESSION — AllSports */}
            {allSportsStats && (
              <>
                <Text style={styles.sectionLabel}>
                  KORNER & POZİSYON ({allSportsStats.matchesAnalyzed} maç)
                </Text>
                <View style={styles.statGrid}>
                  {allSportsStats.avgCorners != null && (
                    <View style={styles.statBox}>
                      <Text style={[styles.statVal, { color: '#185FA5' }]}>{allSportsStats.avgCorners}</Text>
                      <Text style={styles.statLbl}>Ort. Korner</Text>
                    </View>
                  )}
                  {allSportsStats.avgOppCorners != null && (
                    <View style={styles.statBox}>
                      <Text style={[styles.statVal, { color: '#888' }]}>{allSportsStats.avgOppCorners}</Text>
                      <Text style={styles.statLbl}>Rakip Korner</Text>
                    </View>
                  )}
                  {allSportsStats.avgCorners != null && allSportsStats.avgOppCorners != null && (
                    <View style={styles.statBox}>
                      <Text style={styles.statVal}>
                        {(parseFloat(allSportsStats.avgCorners) + parseFloat(allSportsStats.avgOppCorners)).toFixed(1)}
                      </Text>
                      <Text style={styles.statLbl}>Toplam Ort.</Text>
                    </View>
                  )}
                  {allSportsStats.avgPossession != null && (
                    <View style={styles.statBox}>
                      <Text style={[styles.statVal, { color: '#185FA5' }]}>{allSportsStats.avgPossession}%</Text>
                      <Text style={styles.statLbl}>Ort. Possession</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* GEÇEN SEZON DETAY — AF 2024 */}
            {afTeamStats && (
              <>
                <Text style={styles.sectionLabel}>GEÇEN SEZON DETAY (2024/25)</Text>
                <View style={styles.statGrid}>
                  <View style={styles.statBox}>
                    <Text style={styles.statVal}>{afTeamStats.clean_sheet?.total ?? '-'}</Text>
                    <Text style={styles.statLbl}>Kalesini sıfır</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statVal}>{afTeamStats.failed_to_score?.total ?? '-'}</Text>
                    <Text style={styles.statLbl}>Gol atamadı</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statVal}>{sumCards(afTeamStats.cards?.yellow)}</Text>
                    <Text style={styles.statLbl}>Sarı kart</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statVal}>{sumCards(afTeamStats.cards?.red)}</Text>
                    <Text style={styles.statLbl}>Kırmızı kart</Text>
                  </View>
                </View>
              </>
            )}

            {/* SON FORM */}
            <Text style={styles.sectionLabel}>SON FORM</Text>
            <View style={styles.formRow}>
              {(loadingForm || loadingAf) && displayForm.length === 0 ? (
                <ActivityIndicator color="#185FA5" />
              ) : displayForm.length === 0 ? (
                <Text style={styles.formNote}>Form verisi bulunamadı</Text>
              ) : (
                <>
                  {displayForm.map((r, i) => (
                    <View key={i} style={[styles.formBadge,
                      r === 'G' ? styles.formG : r === 'B' ? styles.formB : styles.formM]}>
                      <Text style={styles.formBadgeText}>{r}</Text>
                    </View>
                  ))}
                  <Text style={styles.formNote}>Son {displayForm.length} maç</Text>
                </>
              )}
            </View>
          </>
        )}

        {activeTab === 'oyuncular' && apiId === 203 && (
          loadingPlayers ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#185FA5" />
          ) : !showFullSquad ? (
            <>
              {slTeamScorers.length > 0 ? (
                <>
                  <View style={styles.catLabel}>
                    <Text style={styles.catLabelText}>EN FAZLA GOL (Bu Sezon)</Text>
                    <TouchableOpacity onPress={() => setShowFullSquad(true)}>
                      <Text style={styles.catLabelLink}>Kadroyu gör ›</Text>
                    </TouchableOpacity>
                  </View>
                  {slTeamScorers.slice(0, 5).map((s: any, i: number) => (
                    <View key={i}>
                      <View style={[styles.topPlayer, i === Math.min(slTeamScorers.length, 5) - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[i]?.bg || '#E6F1FB' }]}>
                          <Text style={[styles.rankText, { color: RANK_COLORS[i]?.color || '#0C447C' }]}>{i + 1}</Text>
                        </View>
                        <View style={styles.playerPhotoPlaceholder} />
                        <View style={styles.topPlayerInfo}>
                          <Text style={styles.topPlayerName}>{s.name}</Text>
                        </View>
                        <Text style={styles.topPlayerVal}>{s.goals}</Text>
                      </View>
                      <View style={styles.barRow}>
                        <View style={styles.barBg}>
                          <View style={[styles.barFill, { width: `${(s.goals / (slTeamScorers[0]?.goals || 1)) * 100}%` }]} />
                        </View>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowFullSquad(true)}>
                    <Text style={styles.seeAllText}>Tüm kadroyu gör ›</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.noDataBox}>
                    <Text style={styles.noDataText}>Bu sezon gol istatistiği bulunamadı.</Text>
                  </View>
                  <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowFullSquad(true)}>
                    <Text style={styles.seeAllText}>Kadroyu gör ›</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.backToStats} onPress={() => setShowFullSquad(false)}>
                <Text style={styles.backToStatsText}>‹ İstatistiklere dön</Text>
              </TouchableOpacity>
              {slPlayers.length === 0 ? (
                <View style={styles.noDataBox}>
                  <Text style={styles.noDataText}>Kadro verisi bulunamadı.</Text>
                </View>
              ) : (
                AF_POSITION_ORDER.map(pos => {
                  const players = slPlayers.filter((p: any) => (POSITION_TO_CODE[p.position] || 'M') === pos);
                  if (players.length === 0) return null;
                  return (
                    <View key={pos}>
                      <Text style={styles.sectionLabel}>{AF_POSITION_MAP[pos]}</Text>
                      {players.map((p: any, i: number) => {
                        const scorer = slTeamScorers.find((s: any) => s.name === p.name);
                        return (
                          <View key={i} style={styles.playerItem}>
                            <View style={[styles.playerPhotoSmall, { backgroundColor: '#E6F1FB' }]} />
                            <View style={styles.playerInfo}>
                              <Text style={styles.playerName}>{p.name}</Text>
                              <Text style={styles.playerNat}>{p.nationality}</Text>
                            </View>
                            {scorer && scorer.goals > 0 && (
                              <View style={styles.playerStatBadges}>
                                <View style={styles.goalBadge}>
                                  <Text style={styles.goalBadgeText}>⚽ {scorer.goals}</Text>
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
            <ActivityIndicator style={{ marginTop: 40 }} color="#185FA5" />
          ) : !showFullSquad ? (
            <>
              {topScorers.length > 0 ? (
                <>
                  <View style={styles.catLabel}>
                    <Text style={styles.catLabelText}>EN FAZLA GOL (Bu Sezon)</Text>
                    <TouchableOpacity onPress={() => setShowFullSquad(true)}>
                      <Text style={styles.catLabelLink}>Kadroyu gör ›</Text>
                    </TouchableOpacity>
                  </View>
                  {topScorers.map((p: any, i: number) => (
                    <View key={p.player?.id || i}>
                      <View style={[styles.topPlayer, i === topScorers.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[i]?.bg || '#E6F1FB' }]}>
                          <Text style={[styles.rankText, { color: RANK_COLORS[i]?.color || '#0C447C' }]}>{i + 1}</Text>
                        </View>
                        <View style={styles.playerPhotoPlaceholder} />
                        <View style={styles.topPlayerInfo}>
                          <Text style={styles.topPlayerName}>{p.player?.name}</Text>
                          <Text style={styles.topPlayerPos}>{p.playedMatches} maç</Text>
                        </View>
                        <Text style={styles.topPlayerVal}>{p.goals}</Text>
                      </View>
                      <View style={styles.barRow}>
                        <View style={styles.barBg}>
                          <View style={[styles.barFill, {
                            width: `${(p.goals / (topScorers[0]?.goals || 1)) * 100}%`,
                          }]} />
                        </View>
                      </View>
                    </View>
                  ))}
                  {topAssists.length > 0 && (
                    <>
                      <View style={[styles.catLabel, { marginTop: 8, borderTopWidth: 0.5, borderTopColor: '#eee', paddingTop: 12 }]}>
                        <Text style={styles.catLabelText}>EN FAZLA ASİST (Bu Sezon)</Text>
                      </View>
                      {topAssists.map((p: any, i: number) => (
                        <View key={p.player?.id || i}>
                          <View style={[styles.topPlayer, i === topAssists.length - 1 && { borderBottomWidth: 0 }]}>
                            <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[i]?.bg || '#E6F1FB' }]}>
                              <Text style={[styles.rankText, { color: RANK_COLORS[i]?.color || '#0C447C' }]}>{i + 1}</Text>
                            </View>
                            <View style={styles.playerPhotoPlaceholder} />
                            <View style={styles.topPlayerInfo}>
                              <Text style={styles.topPlayerName}>{p.player?.name}</Text>
                              <Text style={styles.topPlayerPos}>{p.playedMatches} maç</Text>
                            </View>
                            <Text style={[styles.topPlayerVal, { color: '#E65100' }]}>{p.assists}</Text>
                          </View>
                          <View style={styles.barRow}>
                            <View style={styles.barBg}>
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
                  <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowFullSquad(true)}>
                    <Text style={styles.seeAllText}>Tüm kadroyu gör ›</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.noDataBox}>
                    <Text style={styles.noDataText}>Bu sezon gol istatistiği bulunamadı.</Text>
                  </View>
                  <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowFullSquad(true)}>
                    <Text style={styles.seeAllText}>Kadroyu gör ›</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.backToStats} onPress={() => setShowFullSquad(false)}>
                <Text style={styles.backToStatsText}>‹ İstatistiklere dön</Text>
              </TouchableOpacity>
              {fdSquad.length === 0 ? (
                <View style={styles.noDataBox}>
                  <Text style={styles.noDataText}>Kadro verisi bulunamadı.</Text>
                </View>
              ) : (
                AF_POSITION_ORDER.map(pos => {
                  const players = groupedSquad[pos];
                  if (!players) return null;
                  return (
                    <View key={pos}>
                      <Text style={styles.sectionLabel}>{AF_POSITION_MAP[pos]}</Text>
                      {players.map((p: any, i: number) => {
                        const scorer = fdScorers.find((s: any) =>
                          s.player?.id === p.id || teamsMatch(s.player?.name || '', p.name)
                        );
                        return (
                          <View key={i} style={styles.playerItem}>
                            <View style={[styles.playerPhotoSmall, { backgroundColor: '#E6F1FB' }]} />
                            <View style={styles.playerInfo}>
                              <Text style={styles.playerName}>{p.name}</Text>
                              <Text style={styles.playerNat}>{p.nationality}</Text>
                            </View>
                            {scorer && (
                              <View style={styles.playerStatBadges}>
                                {scorer.goals > 0 && (
                                  <View style={styles.goalBadge}>
                                    <Text style={styles.goalBadgeText}>⚽ {scorer.goals}</Text>
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
  container:           { flex: 1, backgroundColor: '#fff' },
  topbar:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  backBtn:             { fontSize: 16, color: '#185FA5', fontWeight: '500' },
  topbarTitle:         { fontSize: 14, fontWeight: '500', color: '#111' },
  scroll:              { flex: 1 },
  teamHeader:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  teamLogo:            { width: 48, height: 48, borderRadius: 12, backgroundColor: '#E6F1FB', alignItems: 'center', justifyContent: 'center' },
  teamLogoText:        { fontSize: 16, fontWeight: '500', color: '#0C447C' },
  teamTitle:           { fontSize: 16, fontWeight: '500', color: '#111' },
  teamSub:             { fontSize: 12, color: '#888', marginTop: 2 },
  toggleRow:           { flexDirection: 'row', margin: 14, backgroundColor: '#f5f5f5', borderRadius: 8, padding: 3 },
  toggleBtn:           { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  toggleBtnActive:     { backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#eee' },
  toggleBtnText:       { fontSize: 13, color: '#888' },
  toggleBtnTextActive: { color: '#111', fontWeight: '500' },
  sectionLabel:        { fontSize: 11, color: '#888', fontWeight: '500', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, letterSpacing: 0.5 },
  statGrid:            { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, marginBottom: 4 },
  statBox:             { width: '30%', flexGrow: 1, backgroundColor: '#f8f8f8', borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: '#eee' },
  statVal:             { fontSize: 22, fontWeight: '500', color: '#111' },
  statLbl:             { fontSize: 10, color: '#888', marginTop: 2 },
  noDataSmall:         { fontSize: 12, color: '#aaa', paddingHorizontal: 14, paddingBottom: 10 },
  splitRow:            { flexDirection: 'row', marginHorizontal: 14, marginBottom: 4, backgroundColor: '#f8f8f8', borderRadius: 10, borderWidth: 0.5, borderColor: '#eee', overflow: 'hidden' },
  splitBox:            { flex: 1, padding: 14, alignItems: 'center' },
  splitDivider:        { width: 0.5, backgroundColor: '#eee' },
  splitTitle:          { fontSize: 12, color: '#888', marginBottom: 6 },
  splitRecord:         { fontSize: 16, fontWeight: '500', color: '#111' },
  splitSub:            { fontSize: 11, color: '#888', marginTop: 2 },
  formRow:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 16, gap: 6 },
  formBadge:           { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  formG:               { backgroundColor: '#27500A' },
  formB:               { backgroundColor: '#888' },
  formM:               { backgroundColor: '#A32D2D' },
  formBadgeText:       { fontSize: 13, fontWeight: '600', color: '#fff' },
  formNote:            { fontSize: 11, color: '#888', marginLeft: 6 },
  catLabel:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  catLabelText:        { fontSize: 11, color: '#888', fontWeight: '500', letterSpacing: 0.5 },
  catLabelLink:        { fontSize: 11, color: '#185FA5' },
  topPlayer:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee', gap: 10 },
  rankBadge:           { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rankText:            { fontSize: 11, fontWeight: '500' },
  playerPhotoPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E6F1FB' },
  topPlayerInfo:       { flex: 1 },
  topPlayerName:       { fontSize: 13, fontWeight: '500', color: '#111' },
  topPlayerPos:        { fontSize: 11, color: '#888', marginTop: 1 },
  topPlayerVal:        { fontSize: 16, fontWeight: '500', color: '#185FA5' },
  barRow:              { paddingHorizontal: 14, paddingBottom: 4 },
  barBg:               { height: 4, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden' },
  barFill:             { height: '100%', backgroundColor: '#185FA5', borderRadius: 2 },
  seeAllBtn:           { borderTopWidth: 0.5, borderTopColor: '#eee', paddingVertical: 12, alignItems: 'center' },
  seeAllText:          { fontSize: 13, color: '#185FA5' },
  backToStats:         { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  backToStatsText:     { fontSize: 13, color: '#185FA5' },
  noDataBox:           { margin: 20, padding: 20, backgroundColor: '#f8f8f8', borderRadius: 10, alignItems: 'center' },
  noDataText:          { fontSize: 13, color: '#555', textAlign: 'center' },
  playerItem:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee', gap: 10 },
  playerPhotoSmall:    { width: 36, height: 36, borderRadius: 18 },
  playerInfo:          { flex: 1 },
  playerName:          { fontSize: 13, fontWeight: '500', color: '#111' },
  playerNat:           { fontSize: 11, color: '#888', marginTop: 2 },
  playerStatBadges:    { flexDirection: 'row', gap: 4 },
  goalBadge:           { backgroundColor: '#E6F1FB', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  goalBadgeText:       { fontSize: 11, color: '#0C447C' },
  assistBadge:         { backgroundColor: '#FFF3E0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  assistBadgeText:     { fontSize: 11, color: '#E65100' },
  profileCard:         { marginHorizontal: 14, marginBottom: 6, padding: 14, backgroundColor: '#f8f8f8', borderRadius: 12, borderLeftWidth: 3 },
  profileTop:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  profileEmoji:        { fontSize: 26, marginTop: 2 },
  profileLabel:        { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  profileDesc:         { fontSize: 12, color: '#555', lineHeight: 17 },
  profileStats:        { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#eee', paddingTop: 10, gap: 0 },
  profileStat:         { flex: 1, alignItems: 'center' },
  profileStatVal:      { fontSize: 16, fontWeight: '600', color: '#111' },
  profileStatLbl:      { fontSize: 10, color: '#888', marginTop: 2 },
});
