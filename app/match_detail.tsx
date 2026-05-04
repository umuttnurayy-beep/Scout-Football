import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import CompareRow from '../components/CompareRow';
import { DetailDataNotice, DetailInsightBox, DetailSectionTitle } from '../components/DetailDataState';
import EmptyStateCard from '../components/EmptyStateCard';
import FormHeatRow from '../components/FormHeatRow';
import RadarChart from '../components/RadarChart';
import { SkeletonMatchDetail } from '../components/SkeletonLoader';
import ShotGauge from '../components/ShotGauge';
import scoutStyles from '../utils/scoutStyles';
import { useTheme } from '../context/ThemeContext';
import { FDMatch, FDMatchDetail, OddsData, WeatherData, getH2H, getMatchContext, getMatchStats, getOdds, getTeamForm, getWeather, isStaleApiData, recordContextFallback } from '../services/api';
import { detailDataMessage, staleAnalysisMessage } from '../utils/emptyStates';
import { DetailDataIssue, buildDetailDataIssues, buildDetailRadar, detailIssueFlags, fulfilledOr, hasStaleDetailData } from '../utils/matchDetailDataState';
import {
  buildMatchAnalysis,
  buildMatchCharacterDetail,
  calcFormPoints,
  calcFormStats,
  getCompareComment,
  getDeepH2HStats,
  getDrawAnalysis,
  getFormTrend,
  getH2HComment,
  getHomeAwayComment,
  getMotivationComment,
  getOddsComment,
  getRefereeProfile,
  getRiskWarnings,
  getStat,
  getTagColor,
  getTeamStyle,
  getUclKnockoutMotivation,
  getWeatherComment,
  isWeatherRisk,
  resolveMatchContext,
  strHash,
} from '../utils/matchAnalysis';
import { SCOUT_HELP, ScoutHelpKey } from '../utils/scoutHelpText';

const DETAIL_SECONDARY_CACHE_PREFIX = 'match_detail_secondary_v1';
const NEON = '#00E676';

const UCL_LEAGUE_PHASE_STAGES = new Set(['LEAGUE_PHASE', 'GROUP_STAGE']);

function buildRouteFallbackMatch({
  matchId,
  home,
  away,
  homeTeamId,
  awayTeamId,
  utcDate,
  leagueApiId,
  league,
  scoreParam,
  finishedParam,
  isFromLive,
}: {
  matchId: string;
  home: string;
  away: string;
  homeTeamId: number;
  awayTeamId: number;
  utcDate: string;
  leagueApiId: number;
  league: string;
  scoreParam: string;
  finishedParam: boolean;
  isFromLive: boolean;
}): FDMatchDetail | null {
  if (!matchId || !home || !away) return null;
  const [homeScoreRaw, awayScoreRaw] = scoreParam ? scoreParam.split(/\s*[-:]\s*/) : [];
  const homeScore = homeScoreRaw !== undefined ? Number(homeScoreRaw) : null;
  const awayScore = awayScoreRaw !== undefined ? Number(awayScoreRaw) : null;
  const hasScore = Number.isFinite(homeScore) && Number.isFinite(awayScore);
  return {
    id: Number(matchId),
    utcDate: utcDate || new Date().toISOString(),
    status: finishedParam ? 'FINISHED' : isFromLive ? 'LIVE' : 'SCHEDULED',
    homeTeam: { id: homeTeamId, name: home, shortName: home },
    awayTeam: { id: awayTeamId, name: away, shortName: away },
    score: {
      fullTime: {
        home: hasScore ? homeScore : null,
        away: hasScore ? awayScore : null,
      },
    },
    competition: { id: leagueApiId, name: league },
  };
}

export default function MatchDetail() {
  const { colors: c, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [matchData,  setMatchData]  = useState<FDMatchDetail | null>(null);
  const [h2hData,    setH2hData]    = useState<FDMatch[]>([]);
  const [weatherData,setWeatherData]= useState<WeatherData | null>(null);
  const [oddsData,   setOddsData]   = useState<OddsData | null>(null);
  const [homeForm,   setHomeForm]   = useState<FDMatch[]>([]);
  const [awayForm,   setAwayForm]   = useState<FDMatch[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showNeden,  setShowNeden]  = useState(false);
  const [showScoutHelp, setShowScoutHelp] = useState<ScoutHelpKey | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [dataIssues, setDataIssues] = useState<Set<DetailDataIssue>>(new Set());
  const [refreshCount, setRefreshCount] = useState(0);
  const retry = () => setRefreshCount(n => n + 1);

  const p = (k: string) => Array.isArray(params[k]) ? (params[k] as string[])[0] : ((params[k] as string) || '');
  const home        = p('home');
  const away        = p('away');
  const league      = p('league');
  const city        = p('city') || null;
  const matchId     = p('id');
  const utcDate     = p('utcDate');
  const leagueApiId = parseInt(p('leagueApiId') || '0');
  const homeTeamId  = parseInt(p('homeTeamId')  || '0');
  const awayTeamId  = parseInt(p('awayTeamId')  || '0');
  const liveParam      = p('live');
  const scoreParam     = p('score');
  const isFromLive     = liveParam === '1';
  const finishedParam  = p('finished') === '1';
  const homePos        = parseInt(p('homePos') || '0') || undefined;
  const awayPos        = parseInt(p('awayPos') || '0') || undefined;
  const homePts        = parseInt(p('homePts') || '0') || undefined;
  const awayPts        = parseInt(p('awayPts') || '0') || undefined;
  const homePlayed     = parseInt(p('homePlayed') || '0') || undefined;
  const awayPlayed     = parseInt(p('awayPlayed') || '0') || undefined;
  const leaderPts      = parseInt(p('leaderPts') || '0') || undefined;
  const totalTeams     = parseInt(p('totalTeams') || '0') || undefined;
  const homeAbovePts   = parseInt(p('homeAbovePts') || '0') || undefined;
  const homeBelowPts   = parseInt(p('homeBelowPts') || '0') || undefined;
  const awayAbovePts   = parseInt(p('awayAbovePts') || '0') || undefined;
  const awayBelowPts   = parseInt(p('awayBelowPts') || '0') || undefined;
  const safetyPts      = parseInt(p('safetyPts') || '0') || undefined;
  const leagueAvgParam = parseFloat(p('leagueAvg') || '0') || 1.5;

  const matchDate = utcDate ? new Date(utcDate).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}) : '';
  const matchTime = utcDate ? new Date(utcDate).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '';
  const secondaryCacheKey = `${DETAIL_SECONDARY_CACHE_PREFIX}_${matchId || 'unknown'}`;
  const routeFallbackMatch = useMemo(() => buildRouteFallbackMatch({
    matchId,
    home,
    away,
    homeTeamId,
    awayTeamId,
    utcDate,
    leagueApiId,
    league,
    scoreParam,
    finishedParam,
    isFromLive,
  }), [away, awayTeamId, finishedParam, home, homeTeamId, isFromLive, league, leagueApiId, matchId, scoreParam, utcDate]);

  useEffect(()=>{ setMatchData(null);setH2hData([]);setWeatherData(null);setOddsData(null);setHomeForm([]);setAwayForm([]);setStaleNotice(false);setSecondaryLoading(false);setDataIssues(new Set()); },[matchId, refreshCount]);

  useEffect(() => {
    let cancelled = false;
    async function loadCachedSecondaryData() {
      try {
        const raw = await AsyncStorage.getItem(secondaryCacheKey);
        if (!raw || cancelled) return;
        const cached = JSON.parse(raw);
        if (Array.isArray(cached.h2h)) setH2hData(cached.h2h);
        if (cached.weather) setWeatherData(cached.weather);
        if (cached.odds) setOddsData(cached.odds);
      } catch {}
    }
    if (matchId) loadCachedSecondaryData();
    return () => { cancelled = true; };
  }, [matchId, secondaryCacheKey]);

  useEffect(()=>{
    let cancelled = false;
    async function load(){
      setLoading(true);
      if (routeFallbackMatch) {
        setMatchData(routeFallbackMatch);
        setLoading(false);
        setSecondaryLoading(true);
      }
      const contextPayload = await getMatchContext(matchId, finishedParam, { silent: Boolean(routeFallbackMatch) });
      const stats = contextPayload?.match || routeFallbackMatch || await getMatchStats(matchId);
      if (cancelled) return;
      if (!stats) {
        setLoading(false);
        setSecondaryLoading(false);
        return;
      }
      const matchContext = resolveMatchContext(stats, { home, away, city, homeTeamId, awayTeamId });
      const contextIssues = new Set(contextPayload?.issues || []);
      let homeFormValue = contextPayload?.homeForm || [];
      let awayFormValue = contextPayload?.awayForm || [];
      let h2hValue = contextPayload?.h2h || [];
      let formRejected = contextIssues.has('form');

      if (!contextPayload) {
        recordContextFallback('match', 'missing_context_payload', matchId);
        const [hFormR,aFormR] = await Promise.allSettled([
          getTeamForm(matchContext.homeTeamId),
          getTeamForm(matchContext.awayTeamId),
        ]);
        if (cancelled) return;
        homeFormValue = fulfilledOr(hFormR, []);
        awayFormValue = fulfilledOr(aFormR, []);
        formRejected = hFormR.status === 'rejected' || aFormR.status === 'rejected';
      }

      setMatchData(stats);
      setHomeForm(homeFormValue);
      setAwayForm(awayFormValue);
      if (contextPayload) setH2hData(h2hValue);
      setStaleNotice(hasStaleDetailData([stats, homeFormValue, awayFormValue], isStaleApiData));
      setDataIssues(buildDetailDataIssues({
        matchMissing: !contextPayload?.match && stats === routeFallbackMatch,
        formRejected,
        h2hRejected: contextIssues.has('h2h'),
        weatherRejected: false,
        oddsRejected: false,
      }));
      setLoading(false);

      setSecondaryLoading(true);
      try {
        const [h2hR, weatherR, oddsR] = await Promise.allSettled([
          contextPayload ? Promise.resolve(h2hValue) : getH2H(matchId, finishedParam, { silent: true }),
          matchContext.city ? getWeather(matchContext.city) : Promise.resolve(null),
          getOdds(matchContext.homeName, matchContext.awayName, leagueApiId),
        ]);
        if (cancelled) return;
      h2hValue = fulfilledOr(h2hR, []);
      const weatherValue = fulfilledOr(weatherR, null);
      const oddsValue = fulfilledOr(oddsR, null);
      setH2hData(h2hValue);
      if (weatherValue) setWeatherData(weatherValue);
      if (oddsValue) setOddsData(oddsValue);
      AsyncStorage.getItem(secondaryCacheKey)
        .then(raw => {
          const cached = raw ? JSON.parse(raw) : {};
          return AsyncStorage.setItem(secondaryCacheKey, JSON.stringify({
            ...cached,
            h2h: h2hValue,
            weather: weatherValue || cached.weather || null,
            odds: oddsValue || cached.odds || null,
            storedAt: new Date().toISOString(),
          }));
        })
        .catch(() => {});
      setStaleNotice(prev => prev || hasStaleDetailData([h2hValue, weatherValue, oddsValue], isStaleApiData));
        setDataIssues(prev => {
          const next = new Set(prev);
          if (h2hR.status === 'rejected' || contextIssues.has('h2h')) next.add('h2h');
          if (weatherR.status === 'rejected') next.add('weather');
          if (oddsR.status === 'rejected') next.add('odds');
          return next;
        });
      } finally {
        if (!cancelled) setSecondaryLoading(false);
      }
    }
    if(matchId) load(); else setLoading(false);
    return () => { cancelled = true; setSecondaryLoading(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[matchId, refreshCount, routeFallbackMatch]);

  const matchContext = resolveMatchContext(matchData, { home, away, city, homeTeamId, awayTeamId });
  const displayHomeName = matchContext.homeName;
  const displayAwayName = matchContext.awayName;
  const status    = matchContext.status;
  const fullHome  = matchData?.score?.fullTime?.home;
  const fullAway  = matchData?.score?.fullTime?.away;
  const halfHome  = matchData?.score?.halfTime?.home;
  const halfAway  = matchData?.score?.halfTime?.away;
  const isFinished= status==='FINISHED';
  const isLive    = status==='IN_PLAY'||status==='LIVE'||status==='PAUSED';
  const formTeamIds = { home: matchContext.homeTeamId, away: matchContext.awayTeamId };

  let displayHome: number|string|null=null, displayAway: number|string|null=null;
  if (isFinished&&fullHome!=null)       { displayHome=fullHome; displayAway=fullAway??null; }
  else if (isLive) {
    if (fullHome!=null)                 { displayHome=fullHome; displayAway=fullAway??null; }
    else if (halfHome!=null)            { displayHome=halfHome; displayAway=halfAway??null; }
  } else if ((finishedParam || isFromLive) && scoreParam) {
    const [routeHomeScore, routeAwayScore] = scoreParam.split(/\s*[-:]\s*/);
    if (routeHomeScore !== undefined && routeAwayScore !== undefined) {
      displayHome=routeHomeScore; displayAway=routeAwayScore;
    }
  }
  const hasScore = displayHome !== null;
  const refName  = matchData?.referees?.[0]?.name || '';

  const homeStats  = calcFormStats(homeForm, formTeamIds.home);
  const awayStats  = calcFormStats(awayForm,  formTeamIds.away);
  const homeFormPts= calcFormPoints(homeForm, formTeamIds.home);
  const awayFormPts= calcFormPoints(awayForm,  formTeamIds.away);
  const hasFormData= homeStats.total>0 && awayStats.total>0;
  const { hasFormIssue, hasH2HIssue, hasWeatherIssue, hasOddsIssue } = detailIssueFlags(dataIssues);
  const formDataPending = secondaryLoading && !hasFormData && !hasFormIssue;
  const formNoticeMessage = (kind: 'performance' | 'comparison' | 'form' | 'homeAway' | 'prediction' | 'character') => {
    if (!formDataPending) return detailDataMessage(kind, hasFormIssue ? 'sourceError' : 'empty');
    switch (kind) {
      case 'performance': return 'Performans verisi yükleniyor...';
      case 'comparison': return 'Takım karşılaştırması hazırlanıyor...';
      case 'form': return 'Son form verisi yükleniyor...';
      case 'homeAway': return 'İç saha / deplasman analizi hazırlanıyor...';
      case 'prediction': return 'Scout tahmini hesaplanıyor...';
      case 'character': return 'Maç karakteri hazırlanıyor...';
      default: return 'Veriler yükleniyor...';
    }
  };

  const weatherRisk= isWeatherRisk(weatherData);
  const homeTrend  = hasFormData ? getFormTrend(homeForm, formTeamIds.home) : null;
  const awayTrend  = hasFormData ? getFormTrend(awayForm, formTeamIds.away) : null;
  const analysis   = buildMatchAnalysis(displayHomeName,displayAwayName,leagueApiId,homeStats,awayStats,homeFormPts,awayFormPts,h2hData.length,weatherRisk,hasFormData,homeTrend,awayTrend,leagueAvgParam);

  const { homeRadar, awayRadar, radarLabels, homeLeadsRadar: hLeadsRadar } =
    buildDetailRadar(homeStats, awayStats, homeFormPts, awayFormPts);
  const hStyle = hasFormData ? getTeamStyle(homeStats) : null;
  const aStyle = hasFormData ? getTeamStyle(awayStats)  : null;
  const characterDetail = hasFormData
    ? buildMatchCharacterDetail(displayHomeName, displayAwayName, homeStats, awayStats, homeFormPts, awayFormPts, strHash(displayHomeName + displayAwayName + 'character'), hStyle?.label, aStyle?.label, homeTrend, awayTrend)
    : '';
  const refProfile= refName ? getRefereeProfile(refName,leagueApiId) : null;
  const weatherCom= getWeatherComment(weatherData);
  const riskWarns = getRiskWarnings(homeStats,awayStats,h2hData.length,analysis);
  const compareComment    = hasFormData ? getCompareComment(homeStats, awayStats, displayHomeName, displayAwayName) : '';
  const h2hComment        = getH2HComment(h2hData, displayHomeName, displayAwayName);
  const oddsComment       = getOddsComment(oddsData, displayHomeName, analysis);
  const homeAwayComment   = hasFormData ? getHomeAwayComment(homeStats, awayStats, displayHomeName, displayAwayName) : '';
  const deepH2H           = getDeepH2HStats(h2hData, displayHomeName, displayAwayName, formTeamIds.home);
  const isUclKnockout = leagueApiId === 2001 && matchContext.stage && !UCL_LEAGUE_PHASE_STAGES.has(matchContext.stage);
  const motivationComment = isUclKnockout
    ? getUclKnockoutMotivation(matchContext.stage!)
    : getMotivationComment(homePos, awayPos, leagueApiId, {
        homePts, awayPts, homePlayed, awayPlayed, leaderPts, totalTeams,
        homeAbovePts, homeBelowPts, awayAbovePts, awayBelowPts, safetyPts,
      });
  const drawAnalysis      = hasFormData ? getDrawAnalysis(oddsData, homeStats, awayStats) : '';

  const ts = useMemo(() => ({
    insightBox:      { backgroundColor: isDark ? '#0D2038' : '#f4f8ff', borderLeftColor: c.primary },
    insightText:     { color: isDark ? c.textSub : '#1a3a5c' },
    sumBox:          { backgroundColor: c.surfaceAlt },
    sumVal:          { color: c.text },
    sumLbl:          { color: c.textMuted },
    h2hRow:          { borderBottomColor: c.border },
    h2hDate:         { color: c.textMuted },
    h2hTeams:        { color: c.text },
    h2hScore:        { color: c.text },
    scoutCard:       { backgroundColor: isDark ? '#0A1929' : '#EBF3FF', borderColor: isDark ? '#1F4F7A' : '#C8DAFF' },
    scoutTitle:      { color: isDark ? c.primary : '#0C447C' },
    scoutSub:        { color: c.textMuted },
    scoutRow:        { backgroundColor: c.surface },
    scoutColBorder:  { borderLeftColor: c.border },
    scoutVal:        { color: c.text },
    scoutLabel:      { color: c.textMuted },
    marketBtn:       { backgroundColor: c.surfaceAlt, borderColor: c.border },
    marketType:      { color: c.textMuted },
    marketOdd:       { color: c.text },
    weatherCard:     { backgroundColor: isDark ? '#0A1929' : '#f0f6ff' },
    weatherCity:     { color: c.textMuted },
    weatherTemp:     { color: c.text },
    weatherDesc:     { color: c.textSub },
    weatherBadge:    { backgroundColor: c.surface },
    weatherBadgeText:{ color: c.textSub },
    impactBadge:     { backgroundColor: c.surfaceAlt },
    impactLabel:     { color: c.textMuted },
    refCard:         { backgroundColor: c.surfaceAlt },
    refName:         { color: c.text },
    refSub:          { color: c.textMuted },
    refFaulPill:     { backgroundColor: c.primaryLight, borderColor: isDark ? '#1F4F7A' : '#C8DAFF' },
    refFaulText:     { color: c.primary },
    refAkisPill:     { backgroundColor: c.surfaceAlt, borderColor: c.border },
    refAkisText:     { color: c.textSub },
    styleBadge:      { backgroundColor: c.surfaceAlt },
    styleTeam:       { color: c.textMuted },
    riskBox:         { borderColor: c.border },
    riskRow:         { borderTopColor: c.border },
    riskText:        { color: c.textSub },
    disclaimer:      { backgroundColor: isDark ? '#2A2000' : '#fff8e1', borderColor: isDark ? '#5A4000' : '#ffe082' },
    disclaimerText:  { color: isDark ? '#E6C350' : '#856404' },
  }), [isDark, c]);

  if (loading) return (
    <View style={[styles.loaderContainer, { backgroundColor: c.bg }]}>
      <SkeletonMatchDetail />
    </View>
  );

  if (!matchData) return (
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
        subtitle="Sunucu yanıt vermedi veya bağlantı kesildi. Tekrar denemek için aşağıdaki butona dokun."
        onRetry={retry}
      />
    </View>
  );

  return (
    <View style={[styles.container,{backgroundColor:c.bg}]}>

      {/* ── Topbar ── */}
      <View style={[styles.topbar,{backgroundColor:c.surface,borderBottomColor:c.border}]}>
        <TouchableOpacity onPress={()=>router.back()}><Text style={[styles.backBtn,{color:c.primary}]}>‹ Geri</Text></TouchableOpacity>
        <View style={styles.topbarCenter}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <View style={{alignItems:'center'}}>
            <Text style={[styles.topbarTitle,{color:c.text}]} numberOfLines={1}>{displayHomeName} - {displayAwayName}</Text>
            <Text style={[styles.topbarSub,{color:c.textMuted}]}>{league}</Text>
          </View>
        </View>
        <View style={{width:60}}/>
      </View>

      <ScrollView style={[styles.scroll,{backgroundColor:c.bg}]}>

      {/* ── Hero ── */}
      <View style={[styles.hero,{backgroundColor:c.surface,borderBottomColor:c.border}]}>
        <View style={styles.teamsRow}>
          <Text style={[styles.teamNameLeft,{color:c.text}]} numberOfLines={1}>{displayHomeName}</Text>
          <View style={styles.vsBlock}>
            {hasScore ? (
              <>
                <Text style={[styles.vsScore,{color:c.text}]}>{displayHome} : {displayAway}</Text>
                {isFinished&&<Text style={[styles.vsStatusLabel,{color:c.textMuted}]}>MS</Text>}
                {isLive&&<Text style={[styles.vsStatusLabel,{color:c.loss}]}>CANLI</Text>}
              </>
            ) : (
              <Text style={[styles.vsTime,{color:c.text}]}>{matchTime}</Text>
            )}
            <Text style={[styles.vsLabel,{color:c.textMuted}]}>{matchDate}</Text>
          </View>
          <Text style={[styles.teamNameRight,{color:c.text}]} numberOfLines={1}>{displayAwayName}</Text>
        </View>
        <View style={styles.heroBadgeRow}>
          <View style={[styles.badgeLiga,{backgroundColor:c.primaryLight}]}><Text style={[styles.badgeLigaText,{color:c.primaryDark}]}>{league}</Text></View>
          <View style={[styles.confidenceBadge,{backgroundColor:
            analysis.badgeLabel.includes('Güçlü')
              ? (isDark ? '#0D2010' : '#E8F8F0')
              : analysis.badgeLabel.includes('Risk')
                ? (isDark ? '#2C0A0A' : '#FDE8E8')
                : (isDark ? '#2A1F00' : '#FFF8E1')
          }]}>
            <Text style={[styles.confidenceBadgeText,{color:analysis.badgeColor}]}>{analysis.badgeLabel}</Text>
          </View>
        </View>
      </View>

      {staleNotice && (
        <View style={[styles.limitedDataBanner, { backgroundColor: isDark ? '#18202A' : '#F3F7FC', borderColor: c.cardBorder, flexDirection: 'row', alignItems: 'center' }]}>
          <Text style={[styles.limitedDataText, { color: c.textSub, flex: 1 }]}>{staleAnalysisMessage()}</Text>
          <TouchableOpacity onPress={retry} style={[styles.staleRetryBtn, { borderColor: c.primary }]}>
            <Text style={[styles.staleRetryText, { color: c.primary }]}>Yenile</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Scout Özeti ── */}
      <View style={[scStyles.card,{backgroundColor:isDark?'#1A1228':'#f4f0ff',borderBottomColor:isDark?'#2D2040':'#ddd6ff'}]}>
        <View style={scStyles.headerRow}>
          <Text style={[scStyles.headerLabel,{color:isDark?'#C19BFF':'#5b2d8e'}]}>🧠 SCOUT ÖZETİ</Text>
          {hasFormData ? <View style={[scStyles.guvenPill,{backgroundColor:
            analysis.guven==='Yüksek' ? (isDark?'#0D2010':'#E8F8F0') :
            analysis.guven==='Düşük'  ? (isDark?'#2C0A0A':'#FDE8E8') :
            (isDark?'#2A1F00':'#FFF8E1')}]}>
            <Text style={[scStyles.guvenText,
              {color:analysis.guven==='Yüksek'?(isDark?'#3FB950':'#1B6B3A'):analysis.guven==='Düşük'?(isDark?'#F85149':'#A32D2D'):(isDark?'#E3B341':'#7A5700')}]}>
              {analysis.guven==='Yüksek'?'✅':analysis.guven==='Düşük'?'⚠️':'⚡'} Güven: {analysis.guven}
            </Text>
            <TouchableOpacity onPress={()=>setShowScoutHelp(showScoutHelp==='guven'?null:'guven')} style={scStyles.inlineHelpBtn}>
              <Text style={[scStyles.inlineHelpText,{color:analysis.guven==='Yüksek'?(isDark?'#3FB950':'#1B6B3A'):analysis.guven==='Düşük'?(isDark?'#F85149':'#A32D2D'):(isDark?'#E3B341':'#7A5700')}]}>{showScoutHelp==='guven'?'×':'?'}</Text>
            </TouchableOpacity>
          </View> : null}
        </View>

        {hasFormData ? <>
        <View style={scStyles.metricsRow}>
          {(['stil','gol','tempo','risk'] as const).map(key=>{
            const val = analysis[key] as string;
            const {bg,text}=getTagColor(key,val,isDark);
            const label = key==='stil'?'Stil':key==='gol'?'Gol':key==='tempo'?'Tempo':'Risk';
            return(
              <View key={key} style={[scStyles.metricItem,{backgroundColor:bg}]}>
                <View style={scStyles.metricLabelRow}>
                  <Text style={[scStyles.metricLabel,{color:c.textMuted}]}>{label}</Text>
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
          <View style={[scStyles.helpBox,{backgroundColor:isDark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.68)',borderColor:isDark?'#2D2040':'#ddd6ff'}]}>
            <Text style={[scStyles.helpText,{color:c.textSub}]}>
              <Text style={[scStyles.helpStrong,{color:c.text}]}>{SCOUT_HELP[showScoutHelp].title}: </Text>
              {SCOUT_HELP[showScoutHelp].body}
            </Text>
          </View>
        )}

        <Text style={[scStyles.mediumText,{color:c.textSub}]}>{analysis.medium}</Text>
        {analysis.scoutPick ? (() => {
          const pickColor =
            analysis.scoutPick.tone === 'home' ? c.primary :
            analysis.scoutPick.tone === 'away' ? c.loss :
            analysis.scoutPick.tone === 'goals' ? (isDark ? '#E3B341' : '#B7791F') :
            analysis.scoutPick.tone === 'caution' ? (isDark ? '#F85149' : '#A32D2D') :
            (isDark ? '#C19BFF' : '#5b2d8e');
          return (
            <View style={[scStyles.pickBox,{backgroundColor:isDark?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.72)',borderColor:pickColor}]}>
              <Text style={[scStyles.pickKicker,{color:pickColor}]}>SCOUT PICK</Text>
              <Text style={[scStyles.pickLabel,{color:c.text}]}>{analysis.scoutPick.label}</Text>
              <Text style={[scStyles.pickDetail,{color:c.textSub}]}>{analysis.scoutPick.detail}</Text>
            </View>
          );
        })() : null}

        <TouchableOpacity onPress={()=>setShowNeden(v=>!v)} style={scStyles.nedenBtn}>
          <Text style={[scStyles.nedenBtnText,{color:isDark?'#C19BFF':'#5b2d8e'}]}>{showNeden?'▲ Kapat':'▼ Neden? — Gerekçeleri göster'}</Text>
        </TouchableOpacity>
        {showNeden && (
          <View style={[scStyles.nedenBox,{borderTopColor:isDark?'#2D2040':'#ddd6ff'}]}>
            {analysis.reasons.map((r,i)=>(
              <Text key={i} style={[scStyles.nedenBullet,{color:c.textSub}]}>• {r}</Text>
            ))}
          </View>
        )}
        </> : (
          <View style={[styles.limitedDataBanner, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)', borderColor: isDark ? '#2D2040' : '#ddd6ff' }]}>
            <Text style={[styles.limitedDataText, { color: c.textSub }]}>
              {formNoticeMessage('prediction')}
            </Text>
          </View>
        )}
      </View>

        {/* Canlı / Biten Maç İstatistikleri */}
        {(matchData?.statistics?.length ?? 0) > 0 && (() => {
          const stats=matchData!.statistics!;
          const hS=stats[0]?.statistics;
          const aS=stats[1]?.statistics;
          const hOn=getStat(hS,'shots on goal'), hTot=getStat(hS,'total shots');
          const aOn=getStat(aS,'shots on goal'), aTot=getStat(aS,'total shots');
          const fouls=getStat(hS,'fouls')+getStat(aS,'fouls');
          const yellows=getStat(hS,'yellow')+getStat(aS,'yellow');
          const reds=getStat(hS,'red')+getStat(aS,'red');
          const sertlikRaw=fouls+yellows*2+reds*5;
          const sr=Math.min(sertlikRaw/65,1);
          const sc=sr>0.83?'#B71C1C':sr>0.66?'#E53935':sr>0.5?'#E65100':sr>0.33?'#F9A825':'#2E7D32';
          const slbl=sr>0.83?'Çok Sert Maç':sr>0.66?'Gergin Atmosfer':sr>0.5?'Hareketli Maç':sr>0.33?'Normal Atmosfer':'Sakin Maç';
          return (
            <>
              <DetailSectionTitle style={scStyles.sectionLabel}>MAÇ İSTATİSTİKLERİ</DetailSectionTitle>
              <View style={styles.statLegend}>
                <Text style={[styles.legendHome,{color:c.primary}]}>{displayHomeName}</Text>
                <Text style={[styles.legendAway,{color:c.loss}]}>{displayAwayName}</Text>
              </View>
              {stats[0]?.statistics?.map((stat,i)=>{
                const hv=parseInt(stat.value)||0;
                const av=parseInt(stats[1]?.statistics?.[i]?.value??'')||0;
                const tot=hv+av, hp=tot>0?(hv/tot)*100:50;
                return(
                  <View key={i} style={styles.statRow}>
                    <Text style={[styles.statVal,{color:c.text}]}>{stat.value}</Text>
                    <View style={[styles.barWrap,{backgroundColor:c.border}]}><View style={[styles.barHome,{width:`${hp}%`,backgroundColor:c.primary}]}/></View>
                    <Text style={[styles.statName,{color:c.textMuted}]}>{stat.type}</Text>
                    <View style={[styles.barWrap,{backgroundColor:c.border}]}><View style={[styles.barAway,{width:`${100-hp}%`,backgroundColor:c.loss}]}/></View>
                    <Text style={[styles.statVal,{color:c.text}]}>{stats[1]?.statistics?.[i]?.value??'-'}</Text>
                  </View>
                );
              })}
              {(hTot>0||aTot>0)&&(
                <>
                  <DetailSectionTitle style={scStyles.sectionLabel}>BİTİRİCİLİK (İSABETLİ ŞUT ORANI)</DetailSectionTitle>
                  <View style={{flexDirection:'row',paddingHorizontal:8,marginBottom:4}}>
                    <View style={{flex:1,alignItems:'center'}}>
                      <ShotGauge shotsOn={hOn} shotsTotal={hTot}/>
                      <Text style={{fontSize:11,color:c.primary,fontWeight:'500',marginTop:2}} numberOfLines={1}>{displayHomeName}</Text>
                    </View>
                    <View style={{flex:1,alignItems:'center'}}>
                      <ShotGauge shotsOn={aOn} shotsTotal={aTot}/>
                      <Text style={{fontSize:11,color:c.loss,fontWeight:'500',marginTop:2}} numberOfLines={1}>{displayAwayName}</Text>
                    </View>
                  </View>
                </>
              )}
              {fouls>0&&(
                <>
                  <DetailSectionTitle style={scStyles.sectionLabel}>MAÇIN SERTLİK SEVİYESİ</DetailSectionTitle>
                  <View style={{marginHorizontal:14,marginBottom:12}}>
                    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                      <Text style={{fontSize:13,fontWeight:'600',color:sc}}>🌡️ {slbl}</Text>
                      <Text style={{fontSize:10,color:c.textMuted}}>{fouls} faul · {yellows} sarı{reds>0?` · ${reds} 🔴`:''}</Text>
                    </View>
                    <View style={{height:16,backgroundColor:c.border,borderRadius:8,overflow:'hidden'}}>
                      <View style={{width:`${sr*100}%`,height:'100%',backgroundColor:sc,borderRadius:8}}/>
                    </View>
                  </View>
                </>
              )}
            </>
          );
        })()}

        {/* Performans Profili */}
        <DetailSectionTitle style={scStyles.sectionLabel}>PERFORMANS PROFİLİ</DetailSectionTitle>
        {hasFormData ? (
          <>
            <View style={styles.radarLegendRow}>
              <View style={[styles.radarDot,{backgroundColor:hLeadsRadar?NEON:'#185FA5'}]}/>
              <Text style={[styles.radarLegendText,{color:c.textSub},hLeadsRadar&&{color:NEON,fontWeight:'600'}]}>{displayHomeName}</Text>
              <View style={[styles.radarDot,{backgroundColor:!hLeadsRadar?NEON:'#A32D2D'}]}/>
              <Text style={[styles.radarLegendText,{color:c.textSub},!hLeadsRadar&&{color:NEON,fontWeight:'600'}]}>{displayAwayName}</Text>
            </View>
            <View style={{alignItems:'center',marginBottom:4}}>
              <RadarChart homeVals={homeRadar} awayVals={awayRadar} labels={radarLabels}/>
            </View>
            <View style={[scStyles.insightBox,ts.insightBox]}>
              <Text style={[scStyles.insightText,ts.insightText]}>
                {hLeadsRadar
                  ? `${displayHomeName} form radarında önde. Bu doğrudan maç sonucu tahmini değil; hücum, savunma, form ve gol trendinin toplam gücünü gösterir.`
                  : `${displayAwayName} form radarında önde. Bu doğrudan maç sonucu tahmini değil; hücum, savunma, form ve gol trendinin toplam gücünü gösterir.`}
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
              <Text style={[styles.compareTeam,{color:c.primary}]} numberOfLines={1}>{displayHomeName}</Text>
              <View style={{width:100}}/>
              <Text style={[styles.compareTeam,{color:c.loss,textAlign:'right'}]} numberOfLines={1}>{displayAwayName}</Text>
            </View>
            <CompareRow label="Gol / Maç"           homeVal={homeStats.totalAvgGf}         awayVal={awayStats.totalAvgGf}/>
            <CompareRow label="Yenilen / Maç"        homeVal={homeStats.totalAvgGa}         awayVal={awayStats.totalAvgGa}        higherIsBetter={false}/>
            <CompareRow label="Galibiyet %"           homeVal={`${homeStats.totalWinPct}%`} awayVal={`${awayStats.totalWinPct}%`}/>
            <CompareRow label="Son 5 (puan)"          homeVal={homeFormPts}                  awayVal={awayFormPts}/>
            <CompareRow label="2.5 Üst %"            homeVal={`${homeStats.over25Pct}%`}   awayVal={`${awayStats.over25Pct}%`}/>
            <CompareRow label="KG Var %"             homeVal={`${homeStats.kgVarPct}%`}    awayVal={`${awayStats.kgVarPct}%`}/>
            <CompareRow label="İç Saha Galibiyet %"  homeVal={`${homeStats.homeWinPct}% (${homeStats.homePlayed})`}  awayVal={`${awayStats.homeWinPct}% (${awayStats.homePlayed})`}/>
            <CompareRow label="Deplasman Galibiyet %" homeVal={`${homeStats.awayWinPct}% (${homeStats.awayPlayed})`} awayVal={`${awayStats.awayWinPct}% (${awayStats.awayPlayed})`}/>
            <DetailInsightBox message={compareComment} boxStyle={[scStyles.insightBox,ts.insightBox]} textStyle={[scStyles.insightText,ts.insightText]} />
          </>
        ) : (
          <DetailDataNotice
            message={formNoticeMessage('comparison')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* Son Form */}
        <DetailSectionTitle style={scStyles.sectionLabel}>SON FORM  (İ = İç Saha · D = Deplasman)</DetailSectionTitle>
        {hasFormData ? (
          <>
            <FormHeatRow matches={homeForm} teamId={formTeamIds.home} label={displayHomeName}/>
            <FormHeatRow matches={awayForm} teamId={formTeamIds.away}  label={displayAwayName}/>
            {/* Form Trend */}
            {(homeTrend || awayTrend) && (() => {
              const trendIcon = (d: 'up'|'down'|'stable') => d==='up'?'▲':d==='down'?'▼':'—';
              const trendColor = (d: 'up'|'down'|'stable') => d==='up'?(isDark?'#3FB950':'#27500A'):d==='down'?(isDark?'#F85149':'#A32D2D'):(isDark?'#8B949E':'#888');
              return (
                <View style={{flexDirection:'row',gap:8,paddingHorizontal:14,marginTop:8,marginBottom:2}}>
                  {[{label:displayHomeName,trend:homeTrend},{label:displayAwayName,trend:awayTrend}].map(({label,trend},i)=>{
                    if(!trend) return null;
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
            message={formNoticeMessage('form')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* İç Saha / Deplasman Analizi */}
        <DetailSectionTitle style={scStyles.sectionLabel}>İÇ SAHA / DEPLASMAN ANALİZİ</DetailSectionTitle>
        {hasFormData ? (
          <DetailInsightBox message={homeAwayComment} boxStyle={[scStyles.insightBox,ts.insightBox]} textStyle={[scStyles.insightText,ts.insightText]} />
        ) : (
          <DetailDataNotice
            message={formNoticeMessage('homeAway')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* Oran + Yorum */}
        <DetailSectionTitle style={scStyles.sectionLabel}>ORAN + YORUM</DetailSectionTitle>
        {hasFormData && (() => {
          const rawH=(homeStats.homeWinPct*0.55+homeStats.totalWinPct*0.45)*0.85;
          const rawA=(awayStats.awayWinPct*0.55+awayStats.totalWinPct*0.45)*0.85;
          const rawD=Math.max(8,100-rawH-rawA), rawTot=rawH+rawD+rawA;
          const ourH=Math.round(rawH/rawTot*100),ourD=Math.round(rawD/rawTot*100),ourA=100-ourH-ourD;
          const maxV=Math.max(ourH,ourD,ourA);
          const cols=[
            {label:displayHomeName,val:ourH,color:c.primary},
            {label:'Berabere',val:ourD,color:c.textMuted},
            {label:displayAwayName,val:ourA,color:c.loss},
          ];
          return(
            <View style={[styles.scoutOddsCard,ts.scoutCard]}>
              <View style={styles.scoutOddsHeader}>
                <Text style={[styles.scoutOddsTitle,ts.scoutTitle]}>🎯 SCOUT TAHMİNİ</Text>
                <Text style={[styles.scoutOddsSub,ts.scoutSub]}>Form verisinden hesaplandı</Text>
              </View>
              <View style={{flexDirection:'row',backgroundColor:c.surface}}>
                {cols.map((col,i)=>(
                  <View key={i} style={[styles.scoutOddsCol,i>0&&{borderLeftWidth:0.5,borderLeftColor:c.border}]}>
                    <Text style={[styles.scoutOddsLabel,ts.scoutLabel]} numberOfLines={1}>{col.label}</Text>
                    <Text style={[styles.scoutOddsVal,ts.scoutVal,col.val===maxV&&{color:col.color,fontSize:24}]}>{col.val}%</Text>
                    <View style={[styles.scoutOddsBarWrap,{backgroundColor:c.border}]}>
                      <View style={[styles.scoutOddsBarFill,{width:`${col.val}%`,backgroundColor:col.color}]}/>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}
        {oddsData ? (
          <>
            <View style={{flexDirection:'row',gap:8,paddingHorizontal:14,marginTop:10,marginBottom:4}}>
              {[
                  {label:displayHomeName,val:oddsData.home},{label:'Berabere',val:oddsData.draw},{label:displayAwayName,val:oddsData.away}
              ].map((btn,i)=>(
                <View key={i} style={[styles.marketBtn,ts.marketBtn]}>
                  <Text style={[styles.marketType,ts.marketType]} numberOfLines={1}>{btn.label}</Text>
                  <Text style={[styles.marketOdd,ts.marketOdd]}>{btn.val}</Text>
                </View>
              ))}
            </View>
            {/* Piyasa vs Scout */}
            {hasFormData && (() => {
              const hO=parseFloat(oddsData.home)||0,dO=parseFloat(oddsData.draw??'')||0,aO=parseFloat(oddsData.away)||0;
              if(!hO||!dO||!aO) return null;
              const rH=1/hO*100,rD=1/dO*100,rA=1/aO*100,tot=rH+rD+rA;
              const impH=Math.round(rH/tot*100),impD=Math.round(rD/tot*100),impA=100-impH-impD;
              const rawH=(homeStats.homeWinPct*0.55+homeStats.totalWinPct*0.45)*0.85;
              const rawA=(awayStats.awayWinPct*0.55+awayStats.totalWinPct*0.45)*0.85;
              const rawD=Math.max(8,100-rawH-rawA),rawTot=rawH+rawD+rawA;
              const ourH=Math.round(rawH/rawTot*100),ourD=Math.round(rawD/rawTot*100),ourA=100-ourH-ourD;
              const diffH=ourH-impH,diffA=ourA-impA;
              const maxDiff=Math.max(Math.abs(diffH),Math.abs(diffA));
              const hasValue=maxDiff>9;
              const valueText=hasValue
                ?(Math.abs(diffH)>=Math.abs(diffA)
                  ?(diffH>0?`${displayHomeName} form tahmininde piyasadan ayrışıyor (%${Math.abs(diffH)} fark)`:`${displayHomeName} piyasa payı form tahminine göre yüksek`)
                  :(diffA>0?`${displayAwayName} form tahmininde piyasadan ayrışıyor (%${Math.abs(diffA)} fark)`:`${displayAwayName} piyasa payı form tahminine göre yüksek`))
                :'Piyasa ve form tahmini dengede; belirgin ayrışma yok';
              const cols2=[{label:displayHomeName,imp:impH,our:ourH},{label:'Berabere',imp:impD,our:ourD},{label:displayAwayName,imp:impA,our:ourA}];
              return(
                <View style={{marginHorizontal:14,marginBottom:4,borderWidth:0.5,borderColor:c.border,borderRadius:10,overflow:'hidden'}}>
                  <View style={{backgroundColor:c.surfaceAlt,paddingHorizontal:12,paddingVertical:8}}>
                    <Text style={{fontSize:10,color:c.textMuted,fontWeight:'500',letterSpacing:0.5}}>PİYASA vs SCOUT KARŞILAŞTIRMASI</Text>
                  </View>
                  <View style={{flexDirection:'row',paddingVertical:10,backgroundColor:c.surface}}>
                    {cols2.map((col,i)=>(
                      <View key={i} style={{flex:1,alignItems:'center',borderRightWidth:i<2?0.5:0,borderRightColor:c.border}}>
                        <Text style={{fontSize:9,color:c.textMuted,marginBottom:4,textAlign:'center'}} numberOfLines={1}>{col.label}</Text>
                        <Text style={{fontSize:16,fontWeight:'700',color:c.text}}>{col.imp}%</Text>
                        <Text style={{fontSize:9,color:c.textFaint,marginTop:1}}>piyasa</Text>
                        <Text style={{fontSize:13,fontWeight:'600',color:Math.abs(col.our-col.imp)>9?c.win:c.textMuted,marginTop:6}}>{col.our}%</Text>
                        <Text style={{fontSize:9,color:c.textFaint,marginTop:1}}>scout</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{paddingHorizontal:12,paddingBottom:10,backgroundColor:c.surface}}>
                    <View style={[{padding:8,borderRadius:6},hasValue?{backgroundColor:isDark?'#0D2010':'#f0fff4',borderWidth:0.5,borderColor:c.win}:{backgroundColor:c.surfaceAlt}]}>
                      <Text style={{fontSize:11,color:hasValue?c.win:c.textMuted,lineHeight:16,flexShrink:1,flexWrap:'wrap',width:'100%'}}>{hasValue?`💡 ${valueText}`:valueText}</Text>
                    </View>
                  </View>
                </View>
              );
            })()}
          </>
        ) : (
          <DetailDataNotice
            message={secondaryLoading ? 'Oran verisi kontrol ediliyor...' : detailDataMessage('odds', hasOddsIssue ? 'sourceError' : 'notPublished')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}
        {oddsData && (
          <DetailInsightBox message={oddsComment} boxStyle={[scStyles.insightBox,ts.insightBox]} textStyle={[scStyles.insightText,ts.insightText]} />
        )}
        {oddsData && drawAnalysis ? (
          <DetailInsightBox message={`🤝 ${drawAnalysis}`} boxStyle={[scStyles.insightBox,ts.insightBox,{marginTop:0}]} textStyle={[scStyles.insightText,ts.insightText]} />
        ) : null}

        {/* Hava Etkisi */}
        <DetailSectionTitle style={scStyles.sectionLabel}>HAVA ETKİSİ</DetailSectionTitle>
        {weatherData ? (
          <>
            <View style={[styles.weatherCard,ts.weatherCard]}>
              <Text style={[styles.weatherCity,ts.weatherCity]}>{weatherData.city}</Text>
              <Text style={styles.weatherIcon}>{(weatherData.temp??0)>25?'☀️':(weatherData.temp??0)>15?'⛅':(weatherData.temp??0)>5?'🌥️':'❄️'}</Text>
              <Text style={[styles.weatherTemp,ts.weatherTemp]}>{weatherData.temp}°C</Text>
              <Text style={[styles.weatherDesc,ts.weatherDesc]}>{weatherData.condition}</Text>
              <View style={styles.weatherBadgeRow}>
                <View style={[styles.weatherBadge,ts.weatherBadge]}><Text style={[styles.weatherBadgeText,ts.weatherBadgeText]}>💨 {weatherData.wind} km/s</Text></View>
                <View style={[styles.weatherBadge,ts.weatherBadge]}><Text style={[styles.weatherBadgeText,ts.weatherBadgeText]}>💧 %{weatherData.humidity} nem</Text></View>
              </View>
            </View>
            <View style={{flexDirection:'row',gap:8,paddingHorizontal:14,marginBottom:6}}>
              {[
                {icon:'🌧️',label:'Yağmur',level:/rain|shower|drizzle/.test((weatherData.condition||'').toLowerCase())?'orta':'yok',color:'#42A5F5'},
                {icon:'💨',label:'Rüzgar',level:(weatherData.wind??0)>40?'yüksek':(weatherData.wind??0)>25?'orta':'düşük',color:(weatherData.wind??0)>40?'#E65100':(weatherData.wind??0)>25?'#FF8F00':c.textFaint},
                {icon:'🌡️',label:'Sıcaklık',level:(weatherData.temp??0)>28||(weatherData.temp??0)<5?'orta':'düşük',color:(weatherData.temp??0)>28||(weatherData.temp??0)<5?'#6A1B9A':c.textFaint},
              ].map(item=>(
                <View key={item.label} style={[styles.impactBadge,ts.impactBadge,{borderColor:item.color}]}>
                  <Text style={styles.impactIcon}>{item.icon}</Text>
                  <Text style={[styles.impactLabel,ts.impactLabel]}>{item.label}</Text>
                  <Text style={[styles.impactLevel,{color:item.color}]}>{item.level}</Text>
                </View>
              ))}
            </View>
            <DetailInsightBox boxStyle={[scStyles.insightBox,ts.insightBox]}>
              <Text style={[scStyles.insightText,ts.insightText,{fontWeight:'500'}]}>Etki: {weatherCom.impact}</Text>
              <Text style={[scStyles.insightText,ts.insightText,{marginTop:3}]}>{weatherCom.sentence}</Text>
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
            <View style={[styles.refCard,ts.refCard]}>
              <Text style={styles.refIcon}>🧑‍⚖️</Text>
              <Text style={[styles.refName,ts.refName]}>{refName}</Text>
              <Text style={[styles.refSub,ts.refSub]}>{league} · Model hakem profili</Text>
            </View>
            <View style={{flexDirection:'row',gap:8,paddingHorizontal:14,marginBottom:6}}>
              <View style={[styles.refTagPill,{backgroundColor:refProfile.kartColor+'18',borderColor:refProfile.kartColor+'60'}]}>
                <Text style={[styles.refTagText,{color:refProfile.kartColor}]}>{refProfile.kartEmoji} Kart: {refProfile.kart}</Text>
              </View>
              <View style={[styles.refTagPill,ts.refFaulPill]}>
                <Text style={[styles.refTagText,ts.refFaulText]}>⚖️ Faul: {refProfile.faul}</Text>
              </View>
              <View style={[styles.refTagPill,ts.refAkisPill]}>
                <Text style={[styles.refTagText,ts.refAkisText]}>🎮 Akış: {refProfile.akis}</Text>
              </View>
            </View>
            <DetailInsightBox message={refProfile.narrative} boxStyle={[scStyles.insightBox,ts.insightBox]} textStyle={[scStyles.insightText,ts.insightText]} />
          </>
        ) : (
          <DetailDataNotice
            message={(!isFinished && !isLive) ? '📅 Hakem maç gününe yakın açıklanacak.' : 'Hakem bilgisi bulunamadı.'}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* H2H */}
        <DetailSectionTitle style={scStyles.sectionLabel}>H2H — GEÇMİŞ KARŞILAŞMALAR</DetailSectionTitle>
        <DetailInsightBox message={h2hComment} boxStyle={[scStyles.insightBox,ts.insightBox]} textStyle={[scStyles.insightText,ts.insightText]} />
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
            <DetailInsightBox message={deepH2H.deepComment} boxStyle={[scStyles.insightBox,ts.insightBox]} textStyle={[scStyles.insightText,ts.insightText]} />
          </>
        )}
        {h2hData.length===0 ? (
          <DetailDataNotice
            message={secondaryLoading ? 'H2H verisi yükleniyor...' : detailDataMessage('h2h', hasH2HIssue ? 'sourceError' : 'empty')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        ) : (
          <>
            {(() => {
              let hw=0,d=0,aw=0;
              h2hData.forEach(m=>{
                const fh=m.score?.fullTime?.home,fa=m.score?.fullTime?.away;
                if(fh==null||fa==null)return;
                const ih=formTeamIds.home>0?m.homeTeam?.id===formTeamIds.home:(m.homeTeam?.shortName===displayHomeName||m.homeTeam?.name?.includes(displayHomeName));
                if (fh > fa) {
                  if (ih) hw++;
                  else aw++;
                } else if (fh < fa) {
                  if (ih) aw++;
                  else hw++;
                } else d++;
              });
              return(
                <View style={styles.summaryGrid}>
                  <View style={[styles.sumBox,ts.sumBox]}><Text style={[styles.sumVal,ts.sumVal,{color:c.primary}]}>{hw}</Text><Text style={[styles.sumLbl,ts.sumLbl]} numberOfLines={1}>{displayHomeName}</Text></View>
                  <View style={[styles.sumBox,ts.sumBox]}><Text style={[styles.sumVal,ts.sumVal]}>{d}</Text><Text style={[styles.sumLbl,ts.sumLbl]}>Berabere</Text></View>
                  <View style={[styles.sumBox,ts.sumBox]}><Text style={[styles.sumVal,ts.sumVal,{color:c.loss}]}>{aw}</Text><Text style={[styles.sumLbl,ts.sumLbl]} numberOfLines={1}>{displayAwayName}</Text></View>
                </View>
              );
            })()}
            {h2hData.map((m,i)=>{
              const fh=m.score?.fullTime?.home,fa=m.score?.fullTime?.away;
              const date=new Date(m.utcDate).toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'});
              return(
                <View key={i} style={[styles.h2hRow,ts.h2hRow]}>
                  <View style={styles.h2hLeft}>
                    <Text style={[styles.h2hDate,ts.h2hDate]}>{date}</Text>
                    <Text style={[styles.h2hTeams,ts.h2hTeams]}>{m.homeTeam?.shortName||m.homeTeam?.name} - {m.awayTeam?.shortName||m.awayTeam?.name}</Text>
                  </View>
                  <Text style={[styles.h2hScore,ts.h2hScore]}>{fh??'-'} – {fa??'-'}</Text>
                </View>
              );
            })}
          </>
        )}

        {/* Maç Karakteri Detayı */}
        <DetailSectionTitle style={scStyles.sectionLabel}>MAÇ KARAKTERİ DETAYI</DetailSectionTitle>
        {hasFormData && hStyle && aStyle ? (
          <>
            <View style={{flexDirection:'row',gap:10,paddingHorizontal:14,marginBottom:10}}>
              {[
                {team:home,style:hStyle},{team:away,style:aStyle}
              ].map(({team,style},i)=>(
                <View key={i} style={[styles.styleBadge,ts.styleBadge,{borderColor:style.color}]}>
                  <Text style={styles.styleEmoji}>{style.emoji}</Text>
                  <Text style={[styles.styleLabel,{color:style.color}]}>{style.label}</Text>
                  <Text style={[styles.styleTeam,ts.styleTeam]} numberOfLines={1}>{team}</Text>
                </View>
              ))}
            </View>
            <DetailInsightBox message={characterDetail} boxStyle={[scStyles.insightBox,ts.insightBox]} textStyle={[scStyles.insightText,ts.insightText]} />
          </>
        ) : (
          <DetailDataNotice
            message={formNoticeMessage('character')}
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* Motivasyon Faktörü */}
        <DetailSectionTitle style={scStyles.sectionLabel}>MOTİVASYON FAKTÖRÜ</DetailSectionTitle>
        {motivationComment ? (
          <DetailInsightBox
            message={`🏆 ${motivationComment}`}
            accentColor={isDark ? '#E3B341' : '#E6A817'}
            textColor={isDark ? '#E3B341' : '#7A5700'}
            boxStyle={[scStyles.insightBox,ts.insightBox]}
            textStyle={[scStyles.insightText,{fontWeight:'600'}]}
          />
        ) : (
          <DetailDataNotice
            message="Bu maçta belirgin bir motivasyon faktörü tespit edilmedi."
            boxStyle={styles.noDataBox}
            textStyle={styles.noDataText}
          />
        )}

        {/* Risk & Uyarı */}
        <DetailSectionTitle style={scStyles.sectionLabel}>RİSK & UYARI</DetailSectionTitle>
        <View style={[styles.riskBox,ts.riskBox]}>
          {riskWarns.map((w,i)=>(
            <View key={i} style={[styles.riskRow,{backgroundColor:c.surface},i>0&&{borderTopWidth:0.5,...ts.riskRow}]}>
              <Text style={styles.riskIcon}>{w.startsWith('Belirgin')? '✅':'⚠️'}</Text>
              <Text style={[styles.riskText,ts.riskText]}>{w}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.disclaimerBox,ts.disclaimer]}>
          <Text style={[styles.disclaimerText,ts.disclaimerText]}>ℹ️ Bu sayfa yalnızca bilgilendirme amaçlıdır. Analizler form verileri ve lig profillerine dayalı algoritmik tahmindir.</Text>
        </View>

        <View style={{height:30}}/>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:         { flex:1 },
  loaderContainer:   { flex:1, justifyContent:'center', alignItems:'center' },
  topbar:            { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingTop:52, paddingBottom:10, borderBottomWidth:0.5 },
  backBtn:           { fontSize:16, fontWeight:'500' },
  topbarCenter:      { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 },
  headerLogo:        { width:28, height:28, resizeMode:'contain' },
  topbarTitle:       { fontSize:13, fontWeight:'500', textAlign:'center', maxWidth:200 },
  topbarSub:         { fontSize:11, textAlign:'center' },
  hero:              { padding:16, borderBottomWidth:0.5 },
  teamsRow:          { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  teamNameLeft:      { fontSize:13, fontWeight:'500', flex:1 },
  teamNameRight:     { fontSize:13, fontWeight:'500', flex:1, textAlign:'right' },
  vsBlock:           { alignItems:'center', paddingHorizontal:10 },
  vsScore:           { fontSize:24, fontWeight:'600' },
  vsStatusLabel:     { fontSize:10, marginTop:2, fontWeight:'500' },
  vsTime:            { fontSize:20, fontWeight:'500' },
  vsLabel:           { fontSize:11, marginTop:2 },
  heroBadgeRow:      { flexDirection:'row', justifyContent:'center', gap:8 },
  badgeLiga:         { borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  badgeLigaText:     { fontSize:11 },
  confidenceBadge:   { borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  confidenceBadgeText:{ fontSize:11, fontWeight:'600' },
  scroll:            { flex:1 },
  radarLegendRow:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingBottom:4 },
  radarDot:          { width:10, height:10, borderRadius:5 },
  radarLegendText:   { fontSize:11 },
  compareHeader:     { flexDirection:'row', paddingHorizontal:14, paddingBottom:6 },
  compareTeam:       { flex:1, fontSize:12, fontWeight:'500' },
  noDataBox:         { margin:14, padding:16, borderRadius:10, alignItems:'center' },
  noDataText:        { fontSize:13, textAlign:'center' },
  limitedDataBanner: { marginHorizontal:14, marginTop:10, marginBottom:2, padding:10, borderRadius:8, borderWidth:1 },
  limitedDataText:   { fontSize:12, lineHeight:17 },
  staleRetryBtn:     { marginLeft:10, paddingHorizontal:10, paddingVertical:4, borderRadius:12, borderWidth:1 },
  staleRetryText:    { fontSize:12, fontWeight:'600' },
  summaryGrid:       { flexDirection:'row', gap:8, paddingHorizontal:14, marginBottom:8 },
  sumBox:            { flex:1, borderRadius:8, padding:10, alignItems:'center' },
  sumVal:            { fontSize:22, fontWeight:'500' },
  sumLbl:            { fontSize:10, marginTop:2, textAlign:'center' },
  h2hRow:            { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingVertical:10, borderBottomWidth:0.5 },
  h2hLeft:           { flex:1 },
  h2hDate:           { fontSize:11, marginBottom:2 },
  h2hTeams:          { fontSize:12 },
  h2hScore:          { fontSize:16, fontWeight:'500', minWidth:60, textAlign:'right' },
  statLegend:        { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:14, marginBottom:4 },
  legendHome:        { fontSize:11, color:'#185FA5', fontWeight:'500' },
  legendAway:        { fontSize:11, color:'#A32D2D', fontWeight:'500' },
  statRow:           { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:6, gap:6 },
  statVal:           { fontSize:12, fontWeight:'500', minWidth:30, textAlign:'center' },
  statName:          { fontSize:10, width:100, textAlign:'center' },
  barWrap:           { flex:1, height:4, borderRadius:2, overflow:'hidden' },
  barHome:           { height:'100%', backgroundColor:'#185FA5', borderRadius:2 },
  barAway:           { height:'100%', backgroundColor:'#A32D2D', borderRadius:2 },
  scoutOddsCard:     { marginHorizontal:14, marginBottom:4, borderRadius:12, borderWidth:1, overflow:'hidden' },
  scoutOddsHeader:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingTop:12, paddingBottom:8 },
  scoutOddsTitle:    { fontSize:12, fontWeight:'700' },
  scoutOddsSub:      { fontSize:10 },
  scoutOddsCol:      { flex:1, alignItems:'center', paddingVertical:14, paddingHorizontal:4 },
  scoutOddsLabel:    { fontSize:10, marginBottom:6, textAlign:'center' },
  scoutOddsVal:      { fontSize:20, fontWeight:'700', marginBottom:8 },
  scoutOddsBarWrap:  { width:'80%', height:4, borderRadius:2, overflow:'hidden' },
  scoutOddsBarFill:  { height:'100%', borderRadius:2 },
  marketBtn:         { flex:1, borderRadius:8, padding:10, alignItems:'center', borderWidth:0.5 },
  marketType:        { fontSize:10, marginBottom:4, textAlign:'center' },
  marketOdd:         { fontSize:18, fontWeight:'600' },
  weatherCard:       { margin:14, marginBottom:10, borderRadius:12, padding:20, alignItems:'center' },
  weatherCity:       { fontSize:13, marginBottom:4 },
  weatherIcon:       { fontSize:40, marginBottom:4 },
  weatherTemp:       { fontSize:32, fontWeight:'500' },
  weatherDesc:       { fontSize:13, marginBottom:12 },
  weatherBadgeRow:   { flexDirection:'row', gap:8 },
  weatherBadge:      { borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  weatherBadgeText:  { fontSize:11 },
  impactBadge:       { flex:1, borderWidth:1, borderRadius:8, padding:8, alignItems:'center' },
  impactIcon:        { fontSize:16, marginBottom:2 },
  impactLabel:       { fontSize:9, marginBottom:2 },
  impactLevel:       { fontSize:11, fontWeight:'700' },
  refCard:           { marginHorizontal:14, marginBottom:8, borderRadius:12, padding:14, alignItems:'center' },
  refIcon:           { fontSize:32, marginBottom:4 },
  refName:           { fontSize:14, fontWeight:'500', marginBottom:2, textAlign:'center' },
  refSub:            { fontSize:11 },
  refTagPill:        { flex:1, borderWidth:1, borderRadius:20, paddingVertical:5, alignItems:'center', justifyContent:'center' },
  refTagText:        { fontSize:11, fontWeight:'600' },
  styleBadge:        { flex:1, borderWidth:1.5, borderRadius:10, padding:12, alignItems:'center' },
  styleEmoji:        { fontSize:22, marginBottom:4 },
  styleLabel:        { fontSize:13, fontWeight:'700', marginBottom:2, textAlign:'center' },
  styleTeam:         { fontSize:10, textAlign:'center' },
  riskBox:           { marginHorizontal:14, marginBottom:10, borderRadius:10, borderWidth:0.5, overflow:'hidden' },
  riskRow:           { flexDirection:'row', alignItems:'flex-start', padding:12, gap:8 },
  riskIcon:          { fontSize:14, marginTop:1 },
  riskText:          { flex:1, fontSize:12, lineHeight:17 },
  disclaimerBox:     { marginHorizontal:14, marginBottom:4, padding:12, borderRadius:8, borderWidth:0.5 },
  disclaimerText:    { fontSize:11, textAlign:'center', lineHeight:16 },
});

const scStyles = scoutStyles;
