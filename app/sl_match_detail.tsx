import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Image, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { DetailDataNotice, DetailInsightBox, DetailSectionTitle, DetailStatusBanner } from '../components/DetailDataState';
import CompareRow from '../components/CompareRow';
import EmptyStateCard from '../components/EmptyStateCard';
import RadarChart from '../components/RadarChart';
import scoutStyles from '../utils/scoutStyles';
import { useTheme } from '../context/ThemeContext';
import {
  SLEventData, SLFormMatch, Standing, SuperLigTeamContext, WeatherData, getAllSportsH2H, getCityForTeam, getSuperLigMatch, getSuperLigMatchContext, getSuperLigTeamContext, getWeather, isStaleApiData, recordContextFallback,
} from '../services/api';
import { detailDataMessage, staleAnalysisMessage } from '../utils/emptyStates';
import { DetailDataIssue, buildDetailDataIssues, buildDetailRadar, detailIssueFlags, fulfilledOr, hasStaleDetailData } from '../utils/matchDetailDataState';
import {
  ANALYSIS_DELTA as DELTA,
  Level,
  MatchFormStats,
  ScoutPick,
  Stil,
  buildMatchCharacterDetail,
  buildReasons,
  buildScoutPick,
  buildScoutSummaryFromPick,
  getCompareComment,
  getHomeAwayComment,
  getGuven,
  getMotivationComment,
  getPersonaEnriched,
  getRefereeProfile,
  getRiskWarnings,
  getTagColor,
  getTeamStyle,
  getWeatherComment,
  isWeatherRisk,
  pickFrom,
  shiftLevel,
  strHash,
} from '../utils/matchAnalysis';
import { MEDIUM_BANK, SHORT_BANK } from '../utils/matchTextBanks';
import { SCOUT_HELP, ScoutHelpKey } from '../utils/scoutHelpText';
import { isPickSaved, savePick, updatePickIfUnresolved } from '../utils/pickHistory';

const SL_DETAIL_SECONDARY_CACHE_PREFIX = 'sl_match_detail_secondary_v1';

// ── Types ──────────────────────────────────────────────────────────────────

interface MatchAnalysis {
  stil: Stil; gol: Level; tempo: Level; risk: Level; guven: Level;
  short: string; medium: string; reasons: string[];
  scoutPick: ScoutPick | null;
  badgeLabel: string; badgeColor: string; badgeBg: string;
}

// ── League Base Profile ────────────────────────────────────────────────────

const SL_BASE = { stil: 'Dengeli' as Stil, gol: 'Orta' as Level, tempo: 'Yüksek' as Level, risk: 'Yüksek' as Level };
// ── Sentence Banks ─────────────────────────────────────────────────────────

// ── Analysis Engine ────────────────────────────────────────────────────────

function buildMatchAnalysis(
  home: string, away: string,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  hFP: number, aFP: number,
  h2hCount: number, weatherRisk: boolean, hasFormData: boolean,
  hTrend?: { direction: 'up' | 'down' | 'stable'; pts5: number; ptsPrev: number } | null,
  aTrend?: { direction: 'up' | 'down' | 'stable'; pts5: number; ptsPrev: number } | null,
): MatchAnalysis {
  const hash = strHash(home + away);
  let stil:  Stil  = SL_BASE.stil;
  let gol:   Level = shiftLevel(SL_BASE.gol,   DELTA[hash % 11]);
  let tempo: Level = shiftLevel(SL_BASE.tempo, DELTA[(hash + 3) % 11]);
  let risk:  Level = shiftLevel(SL_BASE.risk,  DELTA[(hash + 7) % 11]);

  if (hasFormData) {
    const hAtk = parseFloat(hSt.totalAvgGf as string);
    const aAtk = parseFloat(aSt.totalAvgGf as string);
    const hDef = parseFloat(hSt.totalAvgGa as string);
    const aDef = parseFloat(aSt.totalAvgGa as string);
    const tot  = hAtk + aAtk;
    const avgO = (hSt.over25Pct + aSt.over25Pct) / 2;

    gol   = tot >= 3.0 || avgO >= 62 ? 'Yüksek' : tot < 1.8 || avgO <= 35 ? 'Düşük' : 'Orta';
    tempo = tot >= 2.8 || avgO >= 58 ? 'Yüksek' : tot < 2.0 && avgO <= 40 ? 'Düşük' : 'Orta';

    const atkDiff = Math.abs(hAtk - aAtk);
    const bothAttackStrong = hAtk >= 1.4 && aAtk >= 1.4;
    const bothDefStrong = hDef < 0.95 && aDef < 0.95;
    if (gol === 'Yüksek' && tempo === 'Yüksek') {
      stil = bothAttackStrong || avgO >= 62 ? 'Hücumcu' : 'Dengeli';
    } else if (gol === 'Yüksek') {
      stil = 'Dengeli';
    } else if (bothDefStrong && avgO <= 45) {
      stil = 'Savunmacı';
    } else if (atkDiff > 0.5 && (hAtk >= 1.4 || aAtk >= 1.4)) {
      stil = 'Hücumcu';
    } else {
      stil = 'Dengeli';
    }

    const formDiff = Math.abs(hFP - aFP);
    risk = weatherRisk ? 'Yüksek'
         : formDiff >= 6  ? 'Düşük'
         : (formDiff <= 2 && atkDiff < 0.3 && hSt.total >= 5) ? 'Orta'
         : risk;
  }

  const guven   = hasFormData ? getGuven(hSt, aSt, h2hCount, weatherRisk) : 'Düşük';
  const scoutPick = hasFormData ? buildScoutPick(home, away, hSt, aSt, hFP, aFP, h2hCount, weatherRisk) : null;
  const persona = getPersonaEnriched(stil, gol, tempo, risk, hasFormData ? hSt : undefined, hasFormData ? aSt : undefined, hTrend, aTrend);
  const short   = pickFrom(SHORT_BANK[persona]  || SHORT_BANK.dengeli,  hash + 5);
  const bankMedium = pickFrom(MEDIUM_BANK[persona] || MEDIUM_BANK.dengeli, hash + 13);
  const medium  = hasFormData && scoutPick
    ? buildScoutSummaryFromPick(home, away, scoutPick, hSt, aSt, hFP, aFP, weatherRisk)
    : bankMedium;
  const reasons = hasFormData
    ? buildReasons(home, away, hSt, aSt, hFP, aFP, h2hCount, hash + 17, hTrend, aTrend, weatherRisk)
    : ['Veri henüz yüklenmedi; form verileri değerlendirmeye alınamadı.',
       'Lig profili baz alınarak tahmin üretildi.',
       'Sonuçlar genel eğilimi yansıtmakla birlikte maç bazlı doğrulanmadı.'];
  let badgeLabel: string, badgeColor: string, badgeBg: string;
  if (risk === 'Düşük' && guven !== 'Düşük') {
    badgeLabel = '🟢 Favori'; badgeColor = '#1B6B3A'; badgeBg = '#E8F8F0';
  } else if (risk === 'Yüksek') {
    badgeLabel = '🔴 Riskli'; badgeColor = '#A32D2D'; badgeBg = '#FDE8E8';
  } else {
    badgeLabel = '⚖️ Dengeli'; badgeColor = '#7A5700'; badgeBg = '#FFF8E1';
  }

  return { stil, gol, tempo, risk, guven, short, medium, reasons, scoutPick, badgeLabel, badgeColor, badgeBg };
}

// ── Stat Helpers (SL format) ───────────────────────────────────────────────

function calcFormStatsSL(matches: SLFormMatch[], teamId: number) {
  let homeWin=0,homeDraw=0,homeLoss=0,homeGf=0,homeGa=0,homePlayed=0;
  let awayWin=0,awayDraw=0,awayLoss=0,awayGf=0,awayGa=0,awayPlayed=0;
  let over25=0,kgVar=0,total=0;

  matches.forEach((m) => {
    const fh = m.homeScore, fa = m.awayScore;
    if (fh == null || fa == null) return;
    total++;
    const isHome = m.homeTeamId === teamId;
    const gf = isHome ? fh : fa, ga = isHome ? fa : fh;
    if (fh + fa > 2.5) over25++;
    if (fh > 0 && fa > 0) kgVar++;
    if (isHome) {
      homePlayed++; homeGf += gf; homeGa += ga;
      if (gf > ga) homeWin++; else if (gf === ga) homeDraw++; else homeLoss++;
    } else {
      awayPlayed++; awayGf += gf; awayGa += ga;
      if (gf > ga) awayWin++; else if (gf === ga) awayDraw++; else awayLoss++;
    }
  });

  return {
    total, homePlayed, awayPlayed,
    homeWin, homeDraw, homeLoss, homeGf, homeGa,
    awayWin, awayDraw, awayLoss, awayGf, awayGa,
    homeWinPct: homePlayed>0?Math.round((homeWin/homePlayed)*100):0,
    homeAvgGf:  homePlayed>0?(homeGf/homePlayed).toFixed(1):'0',
    homeAvgGa:  homePlayed>0?(homeGa/homePlayed).toFixed(1):'0',
    awayWinPct: awayPlayed>0?Math.round((awayWin/awayPlayed)*100):0,
    awayAvgGf:  awayPlayed>0?(awayGf/awayPlayed).toFixed(1):'0',
    awayAvgGa:  awayPlayed>0?(awayGa/awayPlayed).toFixed(1):'0',
    totalAvgGf: total>0?((homeGf+awayGf)/total).toFixed(1):'0',
    totalAvgGa: total>0?((homeGa+awayGa)/total).toFixed(1):'0',
    totalWinPct: total>0?Math.round(((homeWin+awayWin)/total)*100):0,
    over25Pct:  total>0?Math.round((over25/total)*100):0,
    kgVarPct:   total>0?Math.round((kgVar/total)*100):0,
  };
}

function statsFromStanding(row: Standing | null | undefined): ReturnType<typeof calcFormStatsSL> | null {
  if (!row || !row.played) return null;
  const played = row.played;
  const gf = row.gf || 0;
  const ga = row.ga || 0;
  const wins = row.win || 0;
  const avgGf = gf / played;
  const avgGa = ga / played;
  const avgTot = avgGf + avgGa;
  const over25Pct = avgTot >= 3.5 ? 75 : avgTot >= 3.0 ? 65 : avgTot >= 2.5 ? 55 : avgTot >= 2.0 ? 42 : 28;
  const totalWinPct = Math.round(wins / played * 100);
  return {
    total: played,
    homePlayed: 0, awayPlayed: 0,
    homeWin: 0, homeDraw: 0, homeLoss: 0, homeGf: 0, homeGa: 0,
    awayWin: 0, awayDraw: 0, awayLoss: 0, awayGf: 0, awayGa: 0,
    homeWinPct: 0, homeAvgGf: '0.0', homeAvgGa: '0.0',
    awayWinPct: 0, awayAvgGf: '0.0', awayAvgGa: '0.0',
    totalAvgGf: avgGf.toFixed(1),
    totalAvgGa: avgGa.toFixed(1),
    totalWinPct,
    over25Pct,
    kgVarPct: 0,
  };
}

function calcFormPointsSL(matches: SLFormMatch[], teamId: number): number {
  return [...matches]
    .filter((m) => m.homeScore != null)
    .sort((a, b) => new Date(a.date || a.dateEvent || 0).getTime() - new Date(b.date || b.dateEvent || 0).getTime())
    .slice(-5)
    .reduce((pts, m) => {
      const isHome = m.homeTeamId === teamId;
      const gf = isHome ? m.homeScore! : m.awayScore!;
      const ga = isHome ? m.awayScore! : m.homeScore!;
      return pts + (gf > ga ? 3 : gf === ga ? 1 : 0);
    }, 0);
}

// ── Commentary Helpers ─────────────────────────────────────────────────────

function getH2HCommentSL(h2hData: SLFormMatch[], home: string, away: string): string {
  if (h2hData.length < 2) return 'Geçmiş karşılaşma sayısı sınırlı; bu veriye fazla ağırlık vermemek gerekebilir.';
  let hw=0,d=0,aw=0,totalG=0,cnt=0;
  h2hData.forEach((m) => {
    const fh=m.homeScore, fa=m.awayScore;
    if (fh==null||fa==null) return;
    cnt++; totalG+=fh+fa;
    if (fh > fa) {
      if (m.team1Home) hw++; else aw++;
    } else if (fh < fa) {
      if (m.team1Home) aw++; else hw++;
    }
    else d++;
  });
  if (cnt===0) return 'Geçmiş karşılaşma skoru bulunamadı.';
  const avgG=(totalG/cnt).toFixed(1);
  if (d/cnt>=0.45) return `Bu eşleşmede tarihsel olarak beraberlik eğilimi var (${cnt} maçta ${d} beraberlik). Bu desen bu maçta da geçerli olabilir.`;
  if (hw/cnt>=0.6) return `Ev sahibi bu iki takım arasındaki maçlarda tarihsel üstünlük sağlamış (${hw}/${cnt}). İç saha faktörü belirleyici olabilir.`;
  if (aw/cnt>=0.6) return `${away} bu iki takım arasındaki maçlarda tarihsel üstünlük kurmuş (${aw}/${cnt}). Deplasman etkisi göz ardı edilmemeli.`;
  if (parseFloat(avgG)>=3.0) return `Geçmiş karşılaşmalar genellikle gollü geçmiş (ort. ${avgG} gol). Bu desen bu maç için de geçerli olabilir.`;
  if (parseFloat(avgG)<1.8)  return `Geçmiş karşılaşmalar genellikle az gollü geçmiş (ort. ${avgG} gol). Savunma öne çıkabilir.`;
  return `Geçmiş karşılaşmalar dengeli bir tablo çiziyor (${hw}G / ${d}B / ${aw}M, ort. ${avgG} gol).`;
}

function getFormTrendSL(
  matches: SLFormMatch[],
  teamId: number,
): { direction: 'up' | 'down' | 'stable'; pts5: number; ptsPrev: number } | null {
  const finished = [...matches.filter((m) => m.homeScore != null)]
    .sort((a, b) => new Date(a.date || a.dateEvent || 0).getTime() - new Date(b.date || b.dateEvent || 0).getTime());
  if (finished.length < 6) return null;

  const recent5 = finished.slice(-5);
  const prev5 = finished.slice(-10, -5);
  const calcPts = (list: SLFormMatch[]) => list.reduce((pts, m) => {
    const isHome = m.homeTeamId === teamId;
    const gf = isHome ? m.homeScore! : m.awayScore!;
    const ga = isHome ? m.awayScore! : m.homeScore!;
    return pts + (gf > ga ? 3 : gf === ga ? 1 : 0);
  }, 0);

  const pts5 = calcPts(recent5);
  const ptsPrev = prev5.length > 0 ? calcPts(prev5) : pts5;
  const diff = pts5 - ptsPrev;
  return { direction: diff >= 3 ? 'up' : diff <= -3 ? 'down' : 'stable', pts5, ptsPrev };
}

function getDeepH2HStatsSL(
  h2hData: SLFormMatch[],
  home: string,
  away: string,
): { over25Pct: number; bttsPct: number; trendDir: 'home' | 'away' | 'balanced'; deepComment: string } | null {
  const valid = h2hData.filter((m) => m.homeScore != null && m.awayScore != null);
  if (valid.length < 3) return null;

  let over25 = 0, btts = 0;
  valid.forEach((m) => {
    const fh = m.homeScore!, fa = m.awayScore!;
    if (fh + fa > 2.5) over25++;
    if (fh > 0 && fa > 0) btts++;
  });

  const over25Pct = Math.round((over25 / valid.length) * 100);
  const bttsPct = Math.round((btts / valid.length) * 100);
  const recent3 = [...valid]
    .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
    .slice(-3);

  let homeWins = 0, awayWins = 0;
  recent3.forEach((m) => {
    const fh = m.homeScore!, fa = m.awayScore!;
    if (fh === fa) return;
    const team1Won = m.team1Home ? fh > fa : fa > fh;
    if (team1Won) homeWins++;
    else awayWins++;
  });

  const trendDir: 'home' | 'away' | 'balanced' = homeWins >= 2 ? 'home' : awayWins >= 2 ? 'away' : 'balanced';
  const trendText = trendDir === 'home'
    ? `Son 3 H2H'de ${home} üstün.`
    : trendDir === 'away'
      ? `Son 3 H2H'de ${away} üstün.`
      : 'Son 3 H2H dengeli geçmiş.';

  const parts: string[] = [];
  if (over25Pct >= 65) parts.push(`Geçmiş ${valid.length} maçın %${over25Pct}'i 2.5 üst bitti; bu eşleşmede gol eğilimi güçlü.`);
  else if (over25Pct <= 35) parts.push(`Geçmiş ${valid.length} maçın yalnızca %${over25Pct}'i 2.5 üst bitti; tarihsel olarak daha kontrollü bir profil var.`);
  else parts.push(`H2H 2.5 üst oranı %${over25Pct}; net üst/alt eğilimi yok.`);

  if (bttsPct >= 65) parts.push(`KG Var oranı yüksek (%${bttsPct}); iki tarafın da gol bulduğu senaryo destekleniyor.`);
  else if (bttsPct <= 30) parts.push(`KG Var oranı düşük (%${bttsPct}); taraflardan biri çoğu maçta skoru kapatmış.`);

  parts.push(trendText);
  return { over25Pct, bttsPct, trendDir, deepComment: parts.join(' ') };
}

// ── Event Parsing (TheSportsDB) ────────────────────────────────────────────

// ── Visual Components ──────────────────────────────────────────────────────

const NEON = '#00E676';

function FormHeatRowSL({ matches, teamId, label }: { matches: SLFormMatch[]; teamId: number; label: string }) {
  const { colors: fc } = useTheme();
  const last5 = [...matches]
    .filter((m) => m.homeScore != null)
    .sort((a, b) => new Date(a.date || a.dateEvent || 0).getTime() - new Date(b.date || b.dateEvent || 0).getTime())
    .slice(-5);
  if (last5.length === 0) return null;
  return (
    <View style={fStyles.row}>
      <Text style={[fStyles.label, { color: fc.textSub }]} numberOfLines={1}>{label}</Text>
      <View style={fStyles.badges}>
        {last5.map((m, i: number) => {
          const isHome = m.homeTeamId === teamId;
          const gf = isHome ? m.homeScore! : m.awayScore!;
          const ga = isHome ? m.awayScore! : m.homeScore!;
          const result = gf>ga?'G':gf===ga?'B':'M';
          const bg = result==='G'?'#2E7D32':result==='B'?'#888':'#C62828';
          return (
            <View key={i} style={[fStyles.badge, { backgroundColor: bg }]}>
              <Text style={fStyles.badgeText}>{result}</Text>
              <Text style={fStyles.badgeSub}>{isHome?'İ':'D'}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const fStyles = StyleSheet.create({
  row:       { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:6, gap:10 },
  label:     { width:90, fontSize:11, color:'#555', fontWeight:'500' },
  badges:    { flexDirection:'row', gap:5 },
  badge:     { width:32, height:36, borderRadius:6, alignItems:'center', justifyContent:'center' },
  badgeText: { fontSize:11, fontWeight:'700', color:'#fff' },
  badgeSub:  { fontSize:8, color:'rgba(255,255,255,0.75)' },
});

// ── Main Screen ────────────────────────────────────────────────────────────

export default function SLMatchDetail() {
  const router = useRouter();
  const { colors: c, isDark } = useTheme();
  const params = useLocalSearchParams();
  const p = (k: string) => Array.isArray(params[k]) ? (params[k] as string[])[0] : ((params[k] as string) || '');

  const eventId    = p('eventId');
  const home       = p('home');
  const away       = p('away');
  const leagueName = p('league') || 'Süper Lig';
  const leagueApiId = parseInt(p('leagueApiId') || '203') || 203;
  const homeTeamId = parseInt(p('homeTeamId') || '0');
  const awayTeamId = parseInt(p('awayTeamId') || '0');
  const homePos    = parseInt(p('homePos') || '0') || undefined;
  const awayPos    = parseInt(p('awayPos') || '0') || undefined;
  const homePts    = parseInt(p('homePts') || '0') || undefined;
  const awayPts    = parseInt(p('awayPts') || '0') || undefined;
  const homePlayed = parseInt(p('homePlayed') || '0') || undefined;
  const awayPlayed = parseInt(p('awayPlayed') || '0') || undefined;
  const leaderPts  = parseInt(p('leaderPts') || '0') || undefined;
  const totalTeams = parseInt(p('totalTeams') || '0') || undefined;
  const homeAbovePts = parseInt(p('homeAbovePts') || '0') || undefined;
  const homeBelowPts = parseInt(p('homeBelowPts') || '0') || undefined;
  const awayAbovePts = parseInt(p('awayAbovePts') || '0') || undefined;
  const awayBelowPts = parseInt(p('awayBelowPts') || '0') || undefined;
  const safetyPts    = parseInt(p('safetyPts') || '0') || undefined;
  const timeParam  = p('time');
  const scoreParam = p('score');
  const finishedParam = p('finished') === '1';

  const [event,       setEvent]       = useState<SLEventData | null>(null);
  const [homeForm,    setHomeForm]     = useState<SLFormMatch[]>([]);
  const [awayForm,    setAwayForm]     = useState<SLFormMatch[]>([]);
  const [homeContext, setHomeContext]  = useState<SuperLigTeamContext | null>(null);
  const [awayContext, setAwayContext]  = useState<SuperLigTeamContext | null>(null);
  const [weatherData, setWeatherData]  = useState<WeatherData | null>(null);
  const [h2hMatches,  setH2HMatches]  = useState<SLFormMatch[]>([]);
  const [loading,     setLoading]      = useState(true);
  const [showNeden,   setShowNeden]    = useState(false);
  const [showScoutHelp, setShowScoutHelp] = useState<ScoutHelpKey | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [dataIssues, setDataIssues] = useState<Set<DetailDataIssue>>(new Set());
  const [contextDataEventId, setContextDataEventId] = useState<string | null>(null);
  const [contextLoadDone, setContextLoadDone] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const retry = () => setRefreshCount(n => n + 1);
  const [pickSaved, setPickSaved] = useState(false);

  const city = getCityForTeam(home);
  const isSuperLig = true;
  const secondaryCacheKey = `${SL_DETAIL_SECONDARY_CACHE_PREFIX}_${eventId || 'unknown'}`;

  useEffect(() => {
    setEvent(null);
    setHomeContext(null);
    setAwayContext(null);
    setHomeForm([]);
    setAwayForm([]);
    setContextDataEventId(null);
    setContextLoadDone(false);
    setWeatherData(null);
    setH2HMatches([]);
    setStaleNotice(false);
    setSecondaryLoading(false);
    setDataIssues(new Set());
  }, [eventId, refreshCount]);

  useEffect(() => {
    let cancelled = false;
    async function loadCachedSecondaryData() {
      try {
        const raw = await AsyncStorage.getItem(secondaryCacheKey);
        if (!raw || cancelled) return;
        const cached = JSON.parse(raw);
        if (cached.weather) setWeatherData(cached.weather);
        if (Array.isArray(cached.h2h)) setH2HMatches(cached.h2h);
      } catch {}
    }
    if (eventId) loadCachedSecondaryData();
    return () => { cancelled = true; };
  }, [eventId, secondaryCacheKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setContextDataEventId(null);
      setContextLoadDone(false);
      const contextPayload = await getSuperLigMatchContext({ eventId, homeTeamId, awayTeamId, home, away });
      const contextIssues = new Set(contextPayload?.issues || []);
      const [evR, hcR, acR] = contextPayload
        ? [
            { status: 'fulfilled' as const, value: contextPayload.event },
            { status: 'fulfilled' as const, value: contextPayload.homeContext },
            { status: 'fulfilled' as const, value: contextPayload.awayContext },
          ]
        : await (async () => {
            recordContextFallback('superlig', 'missing_context_payload', eventId);
            return Promise.allSettled([
              getSuperLigMatch(eventId),
              homeTeamId ? getSuperLigTeamContext(homeTeamId) : Promise.resolve(null),
              awayTeamId ? getSuperLigTeamContext(awayTeamId) : Promise.resolve(null),
            ]);
          })();
      if (cancelled) return;
      if (evR.status === 'fulfilled') setEvent(evR.value);
      const nextHomeContext = fulfilledOr(hcR, null);
      const nextAwayContext = fulfilledOr(acR, null);
      let nextH2H = contextPayload?.h2h || [];
      setHomeContext(nextHomeContext);
      setAwayContext(nextAwayContext);
      setHomeForm(nextHomeContext?.recentMatches || []);
      setAwayForm(nextAwayContext?.recentMatches || []);
      setContextDataEventId(eventId);
      setContextLoadDone(true);
      if (contextPayload) setH2HMatches(nextH2H);
      setStaleNotice(hasStaleDetailData([
        evR.status === 'fulfilled' ? evR.value : null,
        nextHomeContext,
        nextAwayContext,
      ], isStaleApiData));
      setDataIssues(buildDetailDataIssues({
        matchMissing: evR.status === 'rejected' || !evR.value,
        formRejected: hcR.status === 'rejected' || acR.status === 'rejected' || contextIssues.has('form'),
        h2hRejected: contextIssues.has('h2h'),
        weatherRejected: false,
      }));
      setLoading(false);

      setSecondaryLoading(true);
      try {
        const [weatherR, h2hR] = await Promise.allSettled([
          city ? getWeather(city) : Promise.resolve(null),
          contextPayload ? Promise.resolve(nextH2H) : (home && away ? getAllSportsH2H(home, away) : Promise.resolve([])),
        ]);
        if (cancelled) return;
      const nextWeather = fulfilledOr(weatherR, null);
      nextH2H = fulfilledOr(h2hR, []) as SLFormMatch[];
      if (nextWeather) setWeatherData(nextWeather);
      setH2HMatches(nextH2H);
      AsyncStorage.getItem(secondaryCacheKey)
        .then(raw => {
          const cached = raw ? JSON.parse(raw) : {};
          return AsyncStorage.setItem(secondaryCacheKey, JSON.stringify({
            ...cached,
            weather: nextWeather || cached.weather || null,
            h2h: nextH2H,
            storedAt: new Date().toISOString(),
          }));
        })
        .catch(() => {});
      setStaleNotice(prev => prev || hasStaleDetailData([nextWeather, nextH2H], isStaleApiData));
        setDataIssues(prev => {
          const next = new Set(prev);
          if (weatherR.status === 'rejected') next.add('weather');
          if (h2hR.status === 'rejected' || contextIssues.has('h2h')) next.add('h2h');
          return next;
        });
      } finally {
        if (!cancelled) setSecondaryLoading(false);
      }
    }
    if (eventId) load(); else setLoading(false);
    return () => { cancelled = true; setSecondaryLoading(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, isSuperLig, leagueApiId, refreshCount]);

  // Derived values
  const homeScore  = event?.intHomeScore ?? null;
  const awayScore  = event?.intAwayScore ?? null;
  const isFinished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event?.strStatus || '');
  const isLive     = event?.strStatus === 'In Progress' || event?.strStatus === 'HT';

  useEffect(() => {
    if (!eventId) return;
    isPickSaved(eventId).then(setPickSaved);
  }, [eventId]);

  const hasScore   = homeScore !== null && awayScore !== null;
  const [routeHomeScore, routeAwayScore] = scoreParam ? scoreParam.split(/\s*[-:]\s*/) : [];
  const hasRouteScore = finishedParam && routeHomeScore !== undefined && routeAwayScore !== undefined;
  const displayHomeScore = hasScore ? homeScore : routeHomeScore;
  const displayAwayScore = hasScore ? awayScore : routeAwayScore;
  const shouldShowScore = hasScore || hasRouteScore;
  const shouldShowFinished = isFinished || (finishedParam && !isLive);
  const venue      = event?.strVenue || null;
  const round      = event?.intRound ? (isSuperLig ? `${event.intRound}. Hafta` : `Tur ${event.intRound}`) : null;
  const refName    = event?.strReferee || '';
  const matchDate  = event?.dateEvent
    ? new Date(event.dateEvent).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })
    : '';

  const h2hData = h2hMatches;

  // Form stats — falls back to season standings when match-by-match form is too thin
  const contextBelongsToEvent = contextDataEventId === eventId;
  const currentHomeForm = contextBelongsToEvent ? homeForm : [];
  const currentAwayForm = contextBelongsToEvent ? awayForm : [];
  const currentHomeContext = contextBelongsToEvent ? homeContext : null;
  const currentAwayContext = contextBelongsToEvent ? awayContext : null;
  const homeFormCalc = calcFormStatsSL(currentHomeForm, homeTeamId);
  const awayFormCalc = calcFormStatsSL(currentAwayForm, awayTeamId);
  const homeStandingStats = currentHomeContext?.isLimited
    ? statsFromStanding(currentHomeContext.standingsStats) : null;
  const awayStandingStats = currentAwayContext?.isLimited
    ? statsFromStanding(currentAwayContext.standingsStats) : null;
  const homeStats   = homeStandingStats || homeFormCalc;
  const awayStats   = awayStandingStats || awayFormCalc;
  const hasFormData = contextBelongsToEvent && homeStats.total > 0 && awayStats.total > 0;
  const hasAnyRealFormData = homeFormCalc.total > 0 || awayFormCalc.total > 0;
  const hasRealFormData = homeFormCalc.total >= 5 && awayFormCalc.total >= 5;
  const homeFormPts = hasRealFormData ? calcFormPointsSL(currentHomeForm, homeTeamId) : 0;
  const awayFormPts = hasRealFormData ? calcFormPointsSL(currentAwayForm,  awayTeamId) : 0;
  const usingStandingsFallback = homeStandingStats !== null || awayStandingStats !== null;
  const { hasFormIssue, hasH2HIssue, hasWeatherIssue } = detailIssueFlags(dataIssues);
  const formDataPending = (loading || secondaryLoading || !contextLoadDone || !contextBelongsToEvent) && !hasFormIssue;
  const formNoticeMessage = (kind: 'performance' | 'comparison' | 'homeAway' | 'prediction' | 'character') => {
    if (!formDataPending) return detailDataMessage(kind, hasFormIssue ? 'sourceError' : 'empty');
    switch (kind) {
      case 'performance': return 'Performans verisi yükleniyor...';
      case 'comparison': return 'Takım karşılaştırması hazırlanıyor...';
      case 'homeAway': return 'İç saha / deplasman analizi hazırlanıyor...';
      case 'prediction': return 'Scout tahmini hesaplanıyor...';
      case 'character': return 'Maç karakteri hazırlanıyor...';
      default: return 'Veriler yükleniyor...';
    }
  };

  const weatherRisk = isWeatherRisk(weatherData);
  const homeTrend   = hasRealFormData ? getFormTrendSL(currentHomeForm, homeTeamId) : null;
  const awayTrend   = hasRealFormData ? getFormTrendSL(currentAwayForm, awayTeamId) : null;
  const analysis    = buildMatchAnalysis(home, away, homeStats, awayStats, homeFormPts, awayFormPts, h2hData.length, weatherRisk, hasFormData, homeTrend, awayTrend);
  const scoutAnalysisReady = hasFormData && !secondaryLoading;

  // Auto-save pick for upcoming/live matches; update existing with context-based pick
  useEffect(() => {
    if (isFinished || !analysis.scoutPick || !eventId) return;
    const { label, tone } = analysis.scoutPick;
    const dateStr = event?.dateEvent || new Date().toISOString().split('T')[0];
    const pick = {
      id: eventId,
      date: dateStr,
      homeTeam: home,
      awayTeam: away,
      pickLabel: label,
      pickTone: tone,
      isSuperLig: true,
      savedAt: new Date().toISOString(),
    };
    savePick(pick).then(saved => {
      if (saved) { setPickSaved(true); return; }
      // Only update stored pick once form data is loaded (accurate pick)
      if (scoutAnalysisReady) {
        updatePickIfUnresolved(eventId, label, tone);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.scoutPick?.label, analysis.scoutPick?.tone, scoutAnalysisReady]);

  const { homeRadar, awayRadar, radarLabels, homeLeadsRadar: hLeadsRadar } =
    buildDetailRadar(homeStats, awayStats, homeFormPts, awayFormPts);
  const hStyle        = hasFormData ? getTeamStyle(homeStats) : null;
  const aStyle        = hasFormData ? getTeamStyle(awayStats)  : null;
  const characterDetail = hasFormData
    ? buildMatchCharacterDetail(home, away, homeStats, awayStats, homeFormPts, awayFormPts, strHash(home + away + 'character'), hStyle?.label, aStyle?.label, homeTrend, awayTrend)
    : '';
  const refProfile    = refName ? getRefereeProfile(refName, leagueApiId) : null;
  const weatherCom    = getWeatherComment(weatherData);
  const riskWarns     = getRiskWarnings(homeStats, awayStats, h2hData.length, analysis, 2);
  const compareComment    = hasFormData ? getCompareComment(homeStats, awayStats, home, away) : '';
  const h2hComment        = getH2HCommentSL(h2hData, home, away);
  const homeAwayComment   = hasRealFormData ? getHomeAwayComment(homeFormCalc, awayFormCalc, home, away) : '';
  const deepH2H           = getDeepH2HStatsSL(h2hData, home, away);
  const motivationComment = getMotivationComment(homePos, awayPos, leagueApiId, {
    homePts, awayPts, homePlayed, awayPlayed, leaderPts, totalTeams,
    homeAbovePts, homeBelowPts, awayAbovePts, awayBelowPts, safetyPts,
  });

  if (!loading && !event) return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Text style={[styles.backBtn, { color: c.primary }]}>‹ Geri</Text></TouchableOpacity>
        <View style={styles.topbarCenter}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <Text style={[styles.topbarTitle, { color: c.text }]} numberOfLines={1}>{home} - {away}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>
      <EmptyStateCard
        icon="📡"
        title="Maç verisi yüklenemedi"
        subtitle="Süper Lig maç detayı şu an alınamadı. Tekrar denemek için aşağıdaki butona dokun."
        onRetry={retry}
      />
    </View>
  );

  const scoutCardBg    = isDark ? '#1A1228' : '#f4f0ff';
  const scoutBorderCol = isDark ? '#2D2040' : '#ddd6ff';
  const scoutPurple    = isDark ? '#C19BFF' : '#5b2d8e';

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>

      {/* ── Topbar ── */}
      <View style={[styles.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={()=>router.back()}><Text style={[styles.backBtn, { color: c.primary }]}>‹ Geri</Text></TouchableOpacity>
        <View style={styles.topbarCenter}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <View style={{alignItems:'center'}}>
            <Text style={[styles.topbarTitle, { color: c.text }]} numberOfLines={1}>{home} - {away}</Text>
            <Text style={[styles.topbarSub, { color: c.textMuted }]}>{leagueName}</Text>
          </View>
        </View>
        <View style={{width:60}}/>
      </View>

      <ScrollView style={styles.scroll}>

      {/* ── Hero ── */}
      <View style={[styles.hero, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <View style={styles.teamsRow}>
          <Text style={[styles.teamNameLeft, { color: c.text }]}  numberOfLines={1}>{home}</Text>
          <View style={styles.vsBlock}>
            {shouldShowScore ? (
              <>
                <Text style={[styles.vsScore, { color: c.text }]}>{displayHomeScore} : {displayAwayScore}</Text>
                {shouldShowFinished&&<Text style={[styles.vsStatusLabel, { color: c.textMuted }]}>MS</Text>}
                {isLive&&<Text style={[styles.vsStatusLabel,{color:c.loss}]}>CANLI</Text>}
                {!shouldShowFinished&&!isLive&&<Text style={[styles.vsStatusLabel, { color: c.textMuted }]}>devam ediyor</Text>}
              </>
            ) : (
              <Text style={[styles.vsTime, { color: c.text }]}>{timeParam || '–'}</Text>
            )}
            {matchDate ? (
              <Text style={[styles.vsLabel, { color: c.textMuted }]}>{matchDate}</Text>
            ) : round ? (
              <Text style={[styles.vsLabel, { color: c.textMuted }]}>{round}</Text>
            ) : null}
          </View>
          <Text style={[styles.teamNameRight, { color: c.text }]} numberOfLines={1}>{away}</Text>
        </View>
        <View style={styles.heroBadgeRow}>
          <View style={[styles.badgeLiga, { backgroundColor: c.primaryLight }]}><Text style={[styles.badgeLigaText, { color: c.primaryDark }]}>{leagueName}{round?` · ${round}`:''}</Text></View>
          {scoutAnalysisReady && <View style={[styles.confidenceBadge,{backgroundColor:analysis.badgeBg}]}>
            <Text style={[styles.confidenceBadgeText,{color:analysis.badgeColor}]}>{analysis.badgeLabel}</Text>
          </View>}
        </View>
        {venue&&<Text style={[styles.venueText, { color: c.textMuted }]}>🏟️ {venue}</Text>}
      </View>

      {staleNotice && (
        <View style={[styles.limitedDataBanner, { backgroundColor: isDark ? '#18202A' : '#F3F7FC', borderColor: c.cardBorder, flexDirection: 'row', alignItems: 'center' }]}>
          <Text style={[styles.limitedDataText, { color: c.textSub, flex: 1 }]}>{staleAnalysisMessage()}</Text>
          <TouchableOpacity onPress={retry} style={[styles.staleRetryBtn, { borderColor: c.primary }]}>
            <Text style={[styles.staleRetryText, { color: c.primary }]}>Yenile</Text>
          </TouchableOpacity>
        </View>
      )}
      {usingStandingsFallback && (
        <DetailStatusBanner
          message="📊 Maç bazlı Süper Lig form verisi sınırlı. Analiz sezon tablosuyla güçlendiriliyor; iç/dış saha ayrımı yalnızca yeterli maç verisi varsa gösterilir."
          boxStyle={[styles.limitedDataBanner, { backgroundColor: isDark ? '#0D1A10' : '#EAF7ED', borderColor: isDark ? '#1A4A25' : '#27AE60' }]}
          textStyle={[styles.limitedDataText, { color: isDark ? '#3FB950' : '#1B6B3A' }]}
        />
      )}
      {!hasRealFormData && hasAnyRealFormData && (
        <DetailStatusBanner
          message="⚠️ Bu maç için maç bazlı form örneği 5 maçın altında. Son form ve iç/dış saha yüzdeleri yeterli veri gelene kadar gizleniyor."
          boxStyle={[styles.limitedDataBanner, { backgroundColor: isDark ? '#1A1205' : '#FFF8E1', borderColor: isDark ? '#4A3600' : '#E6A817' }]}
          textStyle={[styles.limitedDataText, { color: isDark ? '#E3B341' : '#7A5700' }]}
        />
      )}

      {/* ── Scout Özeti ── */}
      <View style={[scStyles.card, { backgroundColor: scoutCardBg, borderBottomColor: scoutBorderCol }]}>
        <View style={scStyles.headerRow}>
          <Text style={[scStyles.headerLabel, { color: scoutPurple }]}>🧠 SCOUT ÖZETİ</Text>
          {scoutAnalysisReady ? <View style={[scStyles.guvenPill,
            analysis.guven==='Yüksek'?{backgroundColor: isDark ? '#0D2010' : '#E8F8F0'}:
            analysis.guven==='Düşük'?{backgroundColor: isDark ? '#2C0A0A' : '#FDE8E8'}:{backgroundColor: isDark ? '#2A1F00' : '#FFF8E1'}]}>
            <Text style={[scStyles.guvenText,
              {color:analysis.guven==='Yüksek'? (isDark ? '#3FB950' : '#1B6B3A') :analysis.guven==='Düşük'? (isDark ? '#F85149' : '#A32D2D') : (isDark ? '#E3B341' : '#7A5700')}]}>
              {analysis.guven==='Yüksek'?'✅':analysis.guven==='Düşük'?'⚠️':'⚡'} Güven: {analysis.guven}
            </Text>
            <TouchableOpacity onPress={()=>setShowScoutHelp(showScoutHelp==='guven'?null:'guven')} style={scStyles.inlineHelpBtn}>
              <Text style={[scStyles.inlineHelpText,{color:analysis.guven==='Yüksek'? (isDark ? '#3FB950' : '#1B6B3A') :analysis.guven==='Düşük'? (isDark ? '#F85149' : '#A32D2D') : (isDark ? '#E3B341' : '#7A5700')}]}>{showScoutHelp==='guven'?'×':'?'}</Text>
            </TouchableOpacity>
          </View> : null}
        </View>
        {scoutAnalysisReady ? <>
        <View style={scStyles.metricsRow}>
          {(['stil','gol','tempo','risk'] as const).map(key=>{
            const val = analysis[key] as string;
            const {bg,text} = getTagColor(key, val, isDark);
            const label = key==='stil'?'Stil':key==='gol'?'Gol':key==='tempo'?'Tempo':'Risk';
            return (
              <View key={key} style={[scStyles.metricItem,{backgroundColor:bg}]}>
                <View style={scStyles.metricLabelRow}>
                  <Text style={[scStyles.metricLabel, { color: c.textMuted }]}>{label}</Text>
                  <TouchableOpacity onPress={()=>setShowScoutHelp(showScoutHelp===key?null:key)} style={scStyles.metricHelpBtn}>
                    <Text style={[scStyles.metricHelpText,{color:text}]}>{showScoutHelp===key?'×':'?'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[scStyles.metricVal,{color:text}]}>{val}</Text>
              </View>
            );
          })}
        </View>
        {showScoutHelp && (
          <View style={[scStyles.helpBox,{backgroundColor:isDark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.68)',borderColor:scoutBorderCol}]}>
            <Text style={[scStyles.helpText,{color:c.textSub}]}>
              <Text style={[scStyles.helpStrong,{color:c.text}]}>{SCOUT_HELP[showScoutHelp].title}: </Text>
              {SCOUT_HELP[showScoutHelp].body}
            </Text>
          </View>
        )}
        <Text style={[scStyles.mediumText, { color: c.textSub }]}>{analysis.medium}</Text>
        {analysis.scoutPick ? (() => {
          const pickColor =
            analysis.scoutPick.tone === 'home' ? c.primary :
            analysis.scoutPick.tone === 'away' ? c.loss :
            analysis.scoutPick.tone === 'goals' ? (isDark ? '#E3B341' : '#B7791F') :
            analysis.scoutPick.tone === 'caution' ? (isDark ? '#F85149' : '#A32D2D') :
            scoutPurple;
          return (
            <View style={[scStyles.pickBox,{backgroundColor:isDark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.72)',borderColor:pickColor}]}>
              <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
                <Text style={[scStyles.pickKicker,{color:pickColor}]}>SCOUT PICK</Text>
                {pickSaved && <Text style={{fontSize:11,color:c.textFaint}}>📋 Haftaya eklendi</Text>}
              </View>
              <Text style={[scStyles.pickLabel,{color:c.text}]}>{analysis.scoutPick.label}</Text>
              <Text style={[scStyles.pickDetail,{color:c.textSub}]}>{analysis.scoutPick.detail}</Text>
            </View>
          );
        })() : null}
        <TouchableOpacity onPress={()=>setShowNeden(v=>!v)} style={scStyles.nedenBtn}>
          <Text style={[scStyles.nedenBtnText, { color: scoutPurple }]}>{showNeden?'▲ Kapat':'▼ Neden? — Gerekçeleri göster'}</Text>
        </TouchableOpacity>
        {showNeden&&(
          <View style={[scStyles.nedenBox, { borderTopColor: scoutBorderCol }]}>
            {analysis.reasons.map((r,i)=>(
              <Text key={i} style={[scStyles.nedenBullet, { color: c.textSub }]}>• {r}</Text>
            ))}
          </View>
        )}
        </> : (
          <View style={[styles.limitedDataBanner, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)', borderColor: scoutBorderCol }]}>
            <Text style={[styles.limitedDataText, { color: c.textSub }]}>
              {formNoticeMessage('prediction')}
            </Text>
          </View>
        )}
      </View>

        {/* Performans Profili (Radar) */}
        <DetailSectionTitle style={scStyles.sectionLabel}>PERFORMANS PROFİLİ</DetailSectionTitle>
        {hasFormData ? (
          <>
            <View style={styles.radarLegendRow}>
              <View style={[styles.radarDot,{backgroundColor:hLeadsRadar?NEON:c.primary}]}/>
              <Text style={[styles.radarLegendText,{ color: c.textSub },hLeadsRadar&&{color:NEON,fontWeight:'600'}]}>{home}</Text>
              <View style={[styles.radarDot,{backgroundColor:!hLeadsRadar?NEON:c.loss}]}/>
              <Text style={[styles.radarLegendText,{ color: c.textSub },!hLeadsRadar&&{color:NEON,fontWeight:'600'}]}>{away}</Text>
            </View>
            <View style={{alignItems:'center',marginBottom:4}}>
              <RadarChart homeVals={homeRadar} awayVals={awayRadar} labels={radarLabels}/>
            </View>
            <View style={[scStyles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
              <Text style={[scStyles.insightText, { color: c.text }]}>
                {hLeadsRadar
                  ? `${home} radar grafiğinde genel olarak önde; hücum ve savunma dengesi lehine.`
                  : `${away} radar grafiğinde genel olarak önde; istatistiksel tablo daha güçlü görünüyor.`}
              </Text>
            </View>
          </>
        ) : (
          <DetailDataNotice
            message={formNoticeMessage('performance')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* Takım Karşılaştırması */}
        <DetailSectionTitle style={scStyles.sectionLabel}>TAKIM KARŞILAŞTIRMASI</DetailSectionTitle>
        {hasFormData ? (
          <>
            <View style={styles.compareHeader}>
              <Text style={[styles.compareTeam,{color:c.primary}]} numberOfLines={1}>{home}</Text>
              <View style={{width:100}}/>
              <Text style={[styles.compareTeam,{color:c.loss,textAlign:'right'}]} numberOfLines={1}>{away}</Text>
            </View>
            <CompareRow label="Gol / Maç"           homeVal={homeStats.totalAvgGf}         awayVal={awayStats.totalAvgGf}/>
            <CompareRow label="Yenilen / Maç"        homeVal={homeStats.totalAvgGa}         awayVal={awayStats.totalAvgGa}        higherIsBetter={false}/>
            <CompareRow label="Galibiyet %"           homeVal={`${homeStats.totalWinPct}%`} awayVal={`${awayStats.totalWinPct}%`}/>
            {hasRealFormData && <CompareRow label="Son 5 (puan)" homeVal={homeFormPts} awayVal={awayFormPts}/>}
            <CompareRow label="2.5 Üst %"            homeVal={`${homeStats.over25Pct}%`}   awayVal={`${awayStats.over25Pct}%`}/>
            {hasRealFormData && <CompareRow label="KG Var %" homeVal={`${homeFormCalc.kgVarPct}%`} awayVal={`${awayFormCalc.kgVarPct}%`}/>}
            {hasRealFormData && <CompareRow label="İç Saha Galibiyet %"  homeVal={`${homeFormCalc.homeWinPct}% (${homeFormCalc.homePlayed})`}  awayVal={`${awayFormCalc.homeWinPct}% (${awayFormCalc.homePlayed})`}/>}
            {hasRealFormData && <CompareRow label="Deplasman Galibiyet %" homeVal={`${homeFormCalc.awayWinPct}% (${homeFormCalc.awayPlayed})`} awayVal={`${awayFormCalc.awayWinPct}% (${awayFormCalc.awayPlayed})`}/>}
            <DetailInsightBox message={compareComment} boxStyle={scStyles.insightBox} textStyle={scStyles.insightText} />

            {/* Son Form — sadece gerçek form verisi varsa göster */}
            {hasRealFormData && (
              <>
                <DetailSectionTitle style={scStyles.sectionLabel}>SON FORM  (İ = İç Saha · D = Deplasman)</DetailSectionTitle>
                <FormHeatRowSL matches={currentHomeForm} teamId={homeTeamId} label={home}/>
                <FormHeatRowSL matches={currentAwayForm} teamId={awayTeamId}  label={away}/>
              </>
            )}
            {(homeTrend || awayTrend) && (() => {
              const trendIcon = (d: 'up'|'down'|'stable') => d === 'up' ? '▲' : d === 'down' ? '▼' : '—';
              const trendColor = (d: 'up'|'down'|'stable') => d === 'up' ? (isDark ? '#3FB950' : '#27500A') : d === 'down' ? (isDark ? '#F85149' : '#A32D2D') : (isDark ? '#8B949E' : '#888');
              return (
                <View style={{flexDirection:'row',gap:8,paddingHorizontal:14,marginTop:8,marginBottom:2}}>
                  {[{label:home,trend:homeTrend},{label:away,trend:awayTrend}].map(({label,trend},i)=>{
                    if (!trend) return null;
                    const col = trendColor(trend.direction);
                    return (
                      <View key={i} style={{flex:1,backgroundColor:c.surfaceAlt,borderRadius:8,padding:10,borderWidth:0.5,borderColor:c.border}}>
                        <Text style={{fontSize:10,color:c.textMuted,marginBottom:3}} numberOfLines={1}>{label}</Text>
                        <Text style={{fontSize:18,fontWeight:'700',color:col}}>{trendIcon(trend.direction)} {trend.direction==='up'?'Yükselişte':trend.direction==='down'?'Düşüşte':'Stabil'}</Text>
                        <Text style={{fontSize:10,color:c.textFaint,marginTop:2}}>Son 5: {trend.pts5} puan · Önceki 5: {trend.ptsPrev} puan</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </>
        ) : (
          <DetailDataNotice
            message={formNoticeMessage('comparison')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* İç Saha / Deplasman Analizi — standings fallback'te iç/dış saha ayrımı yoktur */}
        {hasRealFormData && (
          <>
            <DetailSectionTitle style={scStyles.sectionLabel}>İÇ SAHA / DEPLASMAN ANALİZİ</DetailSectionTitle>
            {hasFormData ? (
              <DetailInsightBox message={homeAwayComment} boxStyle={scStyles.insightBox} textStyle={scStyles.insightText} />
            ) : (
              <DetailDataNotice
                message={formNoticeMessage('homeAway')}
                boxStyle={styles.noDataBox}
                textStyle={styles.noDataText}
              />
            )}
          </>
        )}

        {/* Scout Tahmini */}
        {hasFormData ? (() => {
          const hWin = homeStats.homeWinPct > 0 ? homeStats.homeWinPct : (homeStats.totalWinPct ?? 0);
          const aWin = awayStats.awayWinPct > 0 ? awayStats.awayWinPct : (awayStats.totalWinPct ?? 0);
          const rawH=(hWin*0.55+(homeStats.totalWinPct??0)*0.45)*0.85;
          const rawA=(aWin*0.55+(awayStats.totalWinPct??0)*0.45)*0.85;
          const rawD=Math.max(8,100-rawH-rawA), rawTot=rawH+rawD+rawA;
          const ourH=Math.round(rawH/rawTot*100),ourD=Math.round(rawD/rawTot*100),ourA=100-ourH-ourD;
          const maxV=Math.max(ourH,ourD,ourA);
          const cols=[
            {label:home,val:ourH,color:c.primary},
            {label:'Berabere',val:ourD,color:c.textMuted},
            {label:away,val:ourA,color:c.loss},
          ];
          return (
            <>
              <DetailSectionTitle style={scStyles.sectionLabel}>SCOUT TAHMİNİ</DetailSectionTitle>
              <View style={[styles.scoutOddsCard, { backgroundColor: c.primaryLight, borderColor: c.cardBorder }]}>
                <View style={styles.scoutOddsHeader}>
                  <Text style={[styles.scoutOddsTitle, { color: c.primaryDark }]}>🎯 SCOUT TAHMİNİ</Text>
                  <Text style={[styles.scoutOddsSub, { color: c.textMuted }]}>Form verisinden hesaplandı</Text>
                </View>
                <View style={{flexDirection:'row', backgroundColor: c.surface}}>
                  {cols.map((col,i)=>(
                    <View key={i} style={[styles.scoutOddsCol,i>0&&{borderLeftWidth:0.5,borderLeftColor:c.border}]}>
                      <Text style={[styles.scoutOddsLabel, { color: c.textMuted }]} numberOfLines={1}>{col.label}</Text>
                      <Text style={[styles.scoutOddsVal,{ color: c.text },col.val===maxV&&{color:col.color,fontSize:24}]}>{col.val}%</Text>
                      <View style={[styles.scoutOddsBarWrap, { backgroundColor: c.border }]}>
                        <View style={[styles.scoutOddsBarFill,{width:`${col.val}%`,backgroundColor:col.color}]}/>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </>
          );
        })() : (
          <>
            <DetailSectionTitle style={scStyles.sectionLabel}>SCOUT TAHMİNİ</DetailSectionTitle>
            <DetailDataNotice
              message={formNoticeMessage('prediction')}
              boxStyle={styles.noDataBox}
              textStyle={styles.noDataText}
            />
          </>
        )}

        {/* Hava Etkisi */}
        <DetailSectionTitle style={scStyles.sectionLabel}>HAVA ETKİSİ</DetailSectionTitle>
        {weatherData ? (
          <>
            <View style={[styles.weatherCard, { backgroundColor: isDark ? '#0A1929' : '#f0f6ff' }]}>
              <Text style={[styles.weatherCity, { color: c.textMuted }]}>{weatherData.city}</Text>
              <Text style={styles.weatherIcon}>{(weatherData.temp??0)>25?'☀️':(weatherData.temp??0)>15?'⛅':(weatherData.temp??0)>5?'🌥️':'❄️'}</Text>
              <Text style={[styles.weatherTemp, { color: c.text }]}>{weatherData.temp}°C</Text>
              <Text style={[styles.weatherDesc, { color: c.textSub }]}>{weatherData.condition}</Text>
              <View style={styles.weatherBadgeRow}>
                <View style={[styles.weatherBadge, { backgroundColor: c.surface }]}><Text style={[styles.weatherBadgeText, { color: c.textSub }]}>💨 {weatherData.wind} km/s</Text></View>
                <View style={[styles.weatherBadge, { backgroundColor: c.surface }]}><Text style={[styles.weatherBadgeText, { color: c.textSub }]}>💧 %{weatherData.humidity} nem</Text></View>
              </View>
            </View>
            <View style={{flexDirection:'row',gap:8,paddingHorizontal:14,marginBottom:6}}>
              {[
                {icon:'🌧️',label:'Yağmur',level:/rain|shower|drizzle/.test((weatherData.condition||'').toLowerCase())?'orta':'yok',color:'#42A5F5'},
                {icon:'💨',label:'Rüzgar',level:(weatherData.wind??0)>40?'yüksek':(weatherData.wind??0)>25?'orta':'düşük',color:(weatherData.wind??0)>40?'#E65100':(weatherData.wind??0)>25?'#FF8F00':c.textFaint},
                {icon:'🌡️',label:'Sıcaklık',level:(weatherData.temp??0)>28||(weatherData.temp??0)<5?'orta':'düşük',color:(weatherData.temp??0)>28||(weatherData.temp??0)<5?'#6A1B9A':c.textFaint},
              ].map(item=>(
                <View key={item.label} style={[styles.impactBadge,{ backgroundColor: c.surfaceAlt, borderColor:item.color}]}>
                  <Text style={styles.impactIcon}>{item.icon}</Text>
                  <Text style={[styles.impactLabel, { color: c.textMuted }]}>{item.label}</Text>
                  <Text style={[styles.impactLevel,{color:item.color}]}>{item.level}</Text>
                </View>
              ))}
            </View>
            <DetailInsightBox boxStyle={scStyles.insightBox}>
              <Text style={[scStyles.insightText,{ color: c.text, fontWeight:'500'}]}>Etki: {weatherCom.impact}</Text>
              <Text style={[scStyles.insightText,{ color: c.text, marginTop:3}]}>{weatherCom.sentence}</Text>
            </DetailInsightBox>
          </>
        ) : (
          <DetailDataNotice
            message={secondaryLoading ? 'Hava durumu yükleniyor...' : detailDataMessage('weather', hasWeatherIssue ? 'sourceError' : 'empty')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* Hakem */}
        <DetailSectionTitle style={scStyles.sectionLabel}>HAKEM</DetailSectionTitle>
        {refProfile ? (
          <>
            <View style={[styles.refCard, { backgroundColor: c.surfaceAlt }]}>
              <Text style={styles.refIcon}>🧑‍⚖️</Text>
              <Text style={[styles.refName, { color: c.text }]}>{refName}</Text>
              <Text style={[styles.refSub, { color: c.textMuted }]}>{leagueName} · Model hakem profili</Text>
            </View>
            <View style={{flexDirection:'row',gap:8,paddingHorizontal:14,marginBottom:6}}>
              <View style={[styles.refTagPill,{backgroundColor:refProfile.kartColor+'18',borderColor:refProfile.kartColor+'60'}]}>
                <Text style={[styles.refTagText,{color:refProfile.kartColor}]}>{refProfile.kartEmoji} Kart: {refProfile.kart}</Text>
              </View>
              <View style={[styles.refTagPill,{ backgroundColor: c.primaryLight, borderColor: c.cardBorder }]}>
                <Text style={[styles.refTagText,{ color: c.primary }]}>⚖️ Faul: {refProfile.faul}</Text>
              </View>
              <View style={[styles.refTagPill,{ backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <Text style={[styles.refTagText,{ color: c.textSub }]}>🎮 Akış: {refProfile.akis}</Text>
              </View>
            </View>
            <DetailInsightBox message={refProfile.narrative} boxStyle={scStyles.insightBox} textStyle={scStyles.insightText} />
          </>
        ) : (
          <DetailDataNotice
            message="Hakem bilgisi maç başlamadan önce yayınlanmayabilir."
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* H2H */}
        <DetailSectionTitle style={scStyles.sectionLabel}>H2H — GEÇMİŞ KARŞILAŞMALAR</DetailSectionTitle>
        <DetailInsightBox message={h2hComment} boxStyle={scStyles.insightBox} textStyle={scStyles.insightText} />
        {deepH2H && (
          <>
            <View style={{flexDirection:'row',gap:8,paddingHorizontal:14,marginBottom:6}}>
              {[
                {label:'2.5 Üst',val:`%${deepH2H.over25Pct}`,color:deepH2H.over25Pct>=60?(isDark?'#F85149':'#A32D2D'):deepH2H.over25Pct<=35?(isDark?'#3FB950':'#27500A'):(isDark?'#E3B341':'#7A5700')},
                {label:'KG Var',val:`%${deepH2H.bttsPct}`,color:deepH2H.bttsPct>=60?(isDark?'#F85149':'#A32D2D'):deepH2H.bttsPct<=30?(isDark?'#3FB950':'#27500A'):(isDark?'#E3B341':'#7A5700')},
                {label:'Son Trend',val:deepH2H.trendDir==='home'?'🏠 Ev üstün':deepH2H.trendDir==='away'?'✈️ Dep. üstün':'⚖️ Dengeli',color:c.textSub},
              ].map((item,i)=>(
                <View key={i} style={{flex:1,backgroundColor:c.surfaceAlt,borderRadius:8,padding:9,alignItems:'center',borderWidth:0.5,borderColor:c.border}}>
                  <Text style={{fontSize:10,color:c.textMuted,marginBottom:3}}>{item.label}</Text>
                  <Text style={{fontSize:15,fontWeight:'700',color:item.color}} numberOfLines={1}>{item.val}</Text>
                </View>
              ))}
            </View>
            <DetailInsightBox message={deepH2H.deepComment} boxStyle={scStyles.insightBox} textStyle={scStyles.insightText} />
          </>
        )}
        {h2hData.length === 0 ? (
          <DetailDataNotice
            message={secondaryLoading ? 'H2H verisi yükleniyor...' : detailDataMessage('h2h', hasH2HIssue ? 'sourceError' : 'empty')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        ) : (
          <>
            {(() => {
              let hw=0,d=0,aw=0;
              h2hData.forEach((m)=>{
                const fh=m.homeScore,fa=m.awayScore;
                if(fh==null||fa==null)return;
                if (fh > fa) {
                  if (m.team1Home) hw++; else aw++;
                } else if (fh < fa) {
                  if (m.team1Home) aw++; else hw++;
                }
                else d++;
              });
              return (
                <View style={styles.summaryGrid}>
                  <View style={[styles.sumBox, { backgroundColor: c.surfaceAlt }]}><Text style={[styles.sumVal,{color:c.primary}]}>{hw}</Text><Text style={[styles.sumLbl, { color: c.textMuted }]} numberOfLines={1}>{home}</Text></View>
                  <View style={[styles.sumBox, { backgroundColor: c.surfaceAlt }]}><Text style={[styles.sumVal, { color: c.text }]}>{d}</Text><Text style={[styles.sumLbl, { color: c.textMuted }]}>Berabere</Text></View>
                  <View style={[styles.sumBox, { backgroundColor: c.surfaceAlt }]}><Text style={[styles.sumVal,{color:c.loss}]}>{aw}</Text><Text style={[styles.sumLbl, { color: c.textMuted }]} numberOfLines={1}>{away}</Text></View>
                </View>
              );
            })()}
            {h2hData.map((m,i)=>{
              const fh=m.homeScore, fa=m.awayScore;
              const dateStr = m.date
                ? new Date(m.date).toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'})
                : '';
              return (
                <View key={i} style={[styles.h2hRow, { borderBottomColor: c.border }]}>
                  <View style={styles.h2hLeft}>
                    <Text style={[styles.h2hDate, { color: c.textMuted }]}>{dateStr}{m.league ? ` · ${m.league}` : ''}</Text>
                    <Text style={[styles.h2hTeams, { color: c.text }]}>{m.home} - {m.away}</Text>
                  </View>
                  <Text style={[styles.h2hScore, { color: c.text }]}>{fh??'-'} – {fa??'-'}</Text>
                </View>
              );
            })}
          </>
        )}

        {/* Motivasyon Faktörü */}
        <DetailSectionTitle style={scStyles.sectionLabel}>MOTİVASYON FAKTÖRÜ</DetailSectionTitle>
        {motivationComment ? (
          <DetailInsightBox
            message={`🏆 ${motivationComment}`}
            accentColor={isDark ? '#E3B341' : '#E6A817'}
            textColor={isDark ? '#E3B341' : '#7A5700'}
            boxStyle={scStyles.insightBox}
            textStyle={[scStyles.insightText, { fontWeight:'600' }]}
          />
        ) : (
          <DetailDataNotice
            message="Bu maçta belirgin bir motivasyon faktörü tespit edilmedi."
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* Maç Karakteri Detayı */}
        <DetailSectionTitle style={scStyles.sectionLabel}>MAÇ KARAKTERİ DETAYI</DetailSectionTitle>
        {hasFormData && hStyle && aStyle ? (
          <>
            <View style={{flexDirection:'row',gap:10,paddingHorizontal:14,marginBottom:10}}>
              {[{team:home,style:hStyle},{team:away,style:aStyle}].map(({team,style},i)=>(
                <View key={i} style={[styles.styleBadge, { backgroundColor: c.surface, borderColor:style.color }]}>
                  <Text style={styles.styleEmoji}>{style.emoji}</Text>
                  <Text style={[styles.styleLabel,{color:style.color}]}>{style.label}</Text>
                  <Text style={[styles.styleTeam, { color: c.textMuted }]} numberOfLines={1}>{team}</Text>
                </View>
              ))}
            </View>
            <DetailInsightBox message={characterDetail} boxStyle={scStyles.insightBox} textStyle={scStyles.insightText} />
          </>
        ) : (
          <DetailDataNotice
            message={formNoticeMessage('character')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* Risk & Uyarı */}
        <DetailSectionTitle style={scStyles.sectionLabel}>RİSK & UYARI</DetailSectionTitle>
        <View style={[styles.riskBox, { borderColor: c.border }]}>
          {riskWarns.map((w,i)=>(
            <View key={i} style={[styles.riskRow, i>0&&{ borderTopWidth:0.5, borderTopColor: c.border }]}>
              <Text style={styles.riskIcon}>{w.startsWith('Belirgin')?'✅':'⚠️'}</Text>
              <Text style={[styles.riskText, { color: c.text }]}>{w}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.disclaimerBox, { backgroundColor: isDark ? '#2D1A00' : '#fff8e1', borderColor: isDark ? '#5a3a00' : '#ffe082' }]}>
          <Text style={[styles.disclaimerText, { color: isDark ? '#E3B341' : '#856404' }]}>ℹ️ Bu sayfa yalnızca bilgilendirme amaçlıdır. Analizler form verileri ve lig profillerine dayalı algoritmik tahmindir.</Text>
        </View>
        <View style={{height:30}}/>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex:1 },
  loaderContainer:    { flex:1, justifyContent:'center', alignItems:'center' },
  topbar:             { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingTop:52, paddingBottom:10, borderBottomWidth:0.5 },
  backBtn:            { fontSize:16, fontWeight:'500' },
  topbarCenter:       { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 },
  headerLogo:         { width:28, height:28, resizeMode:'contain' },
  topbarTitle:        { fontSize:13, fontWeight:'500', textAlign:'center', maxWidth:200 },
  topbarSub:          { fontSize:11, textAlign:'center' },
  hero:               { padding:16, borderBottomWidth:0.5 },
  teamsRow:           { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  teamNameLeft:       { fontSize:13, fontWeight:'500', flex:1 },
  teamNameRight:      { fontSize:13, fontWeight:'500', flex:1, textAlign:'right' },
  vsBlock:            { alignItems:'center', paddingHorizontal:10 },
  vsScore:            { fontSize:24, fontWeight:'600' },
  vsStatusLabel:      { fontSize:10, marginTop:2, fontWeight:'500' },
  vsTime:             { fontSize:20, fontWeight:'500' },
  vsLabel:            { fontSize:11, marginTop:2 },
  heroBadgeRow:       { flexDirection:'row', justifyContent:'center', gap:8, marginBottom:6 },
  badgeLiga:          { borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  badgeLigaText:      { fontSize:11 },
  confidenceBadge:    { borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  confidenceBadgeText:{ fontSize:11, fontWeight:'600' },
  venueText:          { fontSize:11, textAlign:'center', marginTop:4 },
  limitedDataBanner:  { marginHorizontal:14, marginTop:10, marginBottom:2, padding:10, borderRadius:8, borderWidth:1 },
  limitedDataText:    { fontSize:12, lineHeight:17 },
  staleRetryBtn:      { marginLeft:10, paddingHorizontal:10, paddingVertical:4, borderRadius:12, borderWidth:1 },
  staleRetryText:     { fontSize:12, fontWeight:'600' },
  scroll:             { flex:1 },
  radarLegendRow:     { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingBottom:4 },
  radarDot:           { width:10, height:10, borderRadius:5 },
  radarLegendText:    { fontSize:11 },
  compareHeader:      { flexDirection:'row', paddingHorizontal:14, paddingBottom:6 },
  compareTeam:        { flex:1, fontSize:12, fontWeight:'500' },
  noDataBox:          { margin:14, padding:16, borderRadius:10, alignItems:'center' },
  noDataText:         { fontSize:13, textAlign:'center' },
  summaryGrid:        { flexDirection:'row', gap:8, paddingHorizontal:14, marginBottom:8 },
  sumBox:             { flex:1, borderRadius:8, padding:10, alignItems:'center' },
  sumVal:             { fontSize:22, fontWeight:'500' },
  sumLbl:             { fontSize:10, marginTop:2, textAlign:'center' },
  h2hRow:             { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingVertical:10, borderBottomWidth:0.5 },
  h2hLeft:            { flex:1 },
  h2hDate:            { fontSize:11, marginBottom:2 },
  h2hTeams:           { fontSize:12 },
  h2hScore:           { fontSize:16, fontWeight:'500', minWidth:60, textAlign:'right' },
  statLegend:         { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:14, marginBottom:4 },
  legendHome:         { fontSize:11, color:'#185FA5', fontWeight:'500' },
  legendAway:         { fontSize:11, color:'#A32D2D', fontWeight:'500' },
  // Scout odds
  scoutOddsCard:      { marginHorizontal:14, marginBottom:4, borderRadius:12, borderWidth:1, overflow:'hidden' },
  scoutOddsHeader:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingTop:12, paddingBottom:8 },
  scoutOddsTitle:     { fontSize:12, fontWeight:'700' },
  scoutOddsSub:       { fontSize:10 },
  scoutOddsCol:       { flex:1, alignItems:'center', paddingVertical:14, paddingHorizontal:4 },
  scoutOddsLabel:     { fontSize:10, marginBottom:6, textAlign:'center' },
  scoutOddsVal:       { fontSize:20, fontWeight:'700', marginBottom:8 },
  scoutOddsBarWrap:   { width:'80%', height:4, borderRadius:2, overflow:'hidden' },
  scoutOddsBarFill:   { height:'100%', borderRadius:2 },
  // Weather
  weatherCard:        { margin:14, marginBottom:10, borderRadius:12, padding:20, alignItems:'center' },
  weatherCity:        { fontSize:13, marginBottom:4 },
  weatherIcon:        { fontSize:40, marginBottom:4 },
  weatherTemp:        { fontSize:32, fontWeight:'500' },
  weatherDesc:        { fontSize:13, marginBottom:12 },
  weatherBadgeRow:    { flexDirection:'row', gap:8 },
  weatherBadge:       { borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  weatherBadgeText:   { fontSize:11 },
  impactBadge:        { flex:1, borderWidth:1, borderRadius:8, padding:8, alignItems:'center' },
  impactIcon:         { fontSize:16, marginBottom:2 },
  impactLabel:        { fontSize:9, marginBottom:2 },
  impactLevel:        { fontSize:11, fontWeight:'700' },
  // Referee
  refCard:            { marginHorizontal:14, marginBottom:8, borderRadius:12, padding:14, alignItems:'center' },
  refIcon:            { fontSize:32, marginBottom:4 },
  refName:            { fontSize:14, fontWeight:'500', marginBottom:2, textAlign:'center' },
  refSub:             { fontSize:11 },
  refTagPill:         { flex:1, borderWidth:1, borderRadius:20, paddingVertical:5, alignItems:'center', justifyContent:'center' },
  refTagText:         { fontSize:11, fontWeight:'600' },
  // Style badges
  styleBadge:         { flex:1, borderWidth:1.5, borderRadius:10, padding:12, alignItems:'center' },
  styleEmoji:         { fontSize:22, marginBottom:4 },
  styleLabel:         { fontSize:13, fontWeight:'700', marginBottom:2, textAlign:'center' },
  styleTeam:          { fontSize:10, textAlign:'center' },
  // Risk
  riskBox:            { marginHorizontal:14, marginBottom:10, borderRadius:10, borderWidth:0.5, overflow:'hidden' },
  riskRow:            { flexDirection:'row', alignItems:'flex-start', padding:12, gap:8 },
  riskIcon:           { fontSize:14, marginTop:1 },
  riskText:           { flex:1, fontSize:12, lineHeight:17 },
  disclaimerBox:      { marginHorizontal:14, marginBottom:4, padding:12, borderRadius:8, borderWidth:0.5 },
  disclaimerText:     { fontSize:11, textAlign:'center', lineHeight:16 },
});

const scStyles = scoutStyles;

