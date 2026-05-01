import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { DetailDataNotice, DetailStatusBanner } from '../components/DetailDataState';
import { useTheme } from '../context/ThemeContext';
import { FDMatch, FDMatchDetail, getCityForTeam, getH2H, getMatchContext, getMatchStats, getOdds, getTeamForm, getWeather, isStaleApiData, recordContextFallback } from '../services/api';
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
  buildScoutSummary,
  getCompareComment,
  getDeepH2HStats,
  getDrawAnalysis,
  getFormTrend,
  getGuven,
  getHomeAwayComment,
  getMotivationComment,
  getPersonaEnriched,
  getRiskWarnings,
  getWeatherComment,
  isWeatherRisk,
  pickFrom,
  shiftLevel,
  strHash,
} from '../utils/matchAnalysis';
import { MEDIUM_BANK, SHORT_BANK } from '../utils/matchTextBanks';
import { SCOUT_HELP, ScoutHelpKey } from '../utils/scoutHelpText';

const DETAIL_SECONDARY_CACHE_PREFIX = 'match_detail_secondary_v1';

// ── Types ──────────────────────────────────────────────────────────────────

interface MatchAnalysis {
  stil: Stil; gol: Level; tempo: Level; risk: Level; guven: Level;
  short: string; medium: string; reasons: string[];
  scoutPick: ScoutPick | null;
  badgeLabel: string; badgeColor: string; badgeBg: string;
}

// ── League Base Profiles ───────────────────────────────────────────────────

const LEAGUE_BASE: Record<number, { stil: Stil; gol: Level; tempo: Level; risk: Level }> = {
  2021: { stil: 'Dengeli',    gol: 'Orta',   tempo: 'Yüksek', risk: 'Düşük'  },
  2014: { stil: 'Savunmacı', gol: 'Orta',   tempo: 'Orta',   risk: 'Düşük'  },
  2002: { stil: 'Hücumcu',   gol: 'Yüksek', tempo: 'Yüksek', risk: 'Orta'   },
  2019: { stil: 'Savunmacı', gol: 'Düşük',  tempo: 'Düşük',  risk: 'Orta'   },
  2015: { stil: 'Dengeli',   gol: 'Orta',   tempo: 'Orta',   risk: 'Yüksek' },
  2001: { stil: 'Dengeli',   gol: 'Orta',   tempo: 'Orta',   risk: 'Düşük'  },
  203:  { stil: 'Dengeli',   gol: 'Orta',   tempo: 'Yüksek', risk: 'Yüksek' },
};

// ── Sentence Banks ─────────────────────────────────────────────────────────

// ── Analysis Engine ────────────────────────────────────────────────────────

function buildMatchAnalysis(
  home: string, away: string, leagueApiId: number,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  hFP: number, aFP: number,
  h2hCount: number, weatherRisk: boolean, hasFormData: boolean,
  hTrend?: { direction: 'up' | 'down' | 'stable'; pts5: number; ptsPrev: number } | null,
  aTrend?: { direction: 'up' | 'down' | 'stable'; pts5: number; ptsPrev: number } | null,
  leagueAvg: number = 1.5,
): MatchAnalysis {
  const base = LEAGUE_BASE[leagueApiId] ?? { stil: 'Dengeli' as Stil, gol: 'Orta' as Level, tempo: 'Orta' as Level, risk: 'Orta' as Level };
  const hash = strHash(home + away);

  let stil:  Stil  = base.stil;
  let gol:   Level = shiftLevel(base.gol,   DELTA[hash % 11]);
  let tempo: Level = shiftLevel(base.tempo, DELTA[(hash + 3) % 11]);
  let risk:  Level = shiftLevel(base.risk,  DELTA[(hash + 7) % 11]);

  if (hasFormData) {
    const hAtk = parseFloat(hSt.totalAvgGf as string);
    const aAtk = parseFloat(aSt.totalAvgGf as string);
    const hDef = parseFloat(hSt.totalAvgGa as string);
    const aDef = parseFloat(aSt.totalAvgGa as string);
    const la   = leagueAvg > 0 ? leagueAvg : 1.5;
    const tot  = (hAtk * aDef + aAtk * hDef) / la;
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
  const persona = getPersonaEnriched(stil, gol, tempo, risk, hasFormData ? hSt : undefined, hasFormData ? aSt : undefined, hTrend, aTrend);
  const short   = pickFrom(SHORT_BANK[persona]  || SHORT_BANK.dengeli,  hash + 5);
  const bankMedium = pickFrom(MEDIUM_BANK[persona] || MEDIUM_BANK.dengeli, hash + 13);
  const medium  = hasFormData
    ? buildScoutSummary(home, away, hSt, aSt, hFP, aFP, h2hCount, weatherRisk, hash + 13, hTrend, aTrend)
    : bankMedium;
  const reasons = hasFormData
    ? buildReasons(home, away, hSt, aSt, hFP, aFP, h2hCount, hash + 17, hTrend, aTrend, weatherRisk)
    : ['Veri henüz yüklenmedi; form ve H2H verileri değerlendirmeye alınamadı.',
       'Lig profili baz alınarak tahmin üretildi.',
       'Sonuçlar genel eğilimi yansıtmakla birlikte maç bazlı doğrulanmadı.'];
  const scoutPick = hasFormData ? buildScoutPick(home, away, hSt, aSt, hFP, aFP, h2hCount, weatherRisk) : null;

  let badgeLabel: string, badgeColor: string, badgeBg: string;
  if (risk === 'Düşük' && guven !== 'Düşük') {
    badgeLabel = '🟢 Güçlü sinyal'; badgeColor = '#1B6B3A'; badgeBg = '#E8F8F0';
  } else if (risk === 'Yüksek') {
    badgeLabel = '🔴 Risk yüksek'; badgeColor = '#A32D2D'; badgeBg = '#FDE8E8';
  } else {
    badgeLabel = '⚖️ Dengeli profil'; badgeColor = '#7A5700'; badgeBg = '#FFF8E1';
  }

  return { stil, gol, tempo, risk, guven, short, medium, reasons, scoutPick, badgeLabel, badgeColor, badgeBg };
}

// ── Tag Color ──────────────────────────────────────────────────────────────

function getTagColor(type: string, value: string, isDark: boolean): { bg: string; text: string } {
  const high = { bg: isDark ? '#2C0A0A' : '#FDE8E8', text: isDark ? '#F85149' : '#A32D2D' };
  const mid = { bg: isDark ? '#2A1F00' : '#FFF8E1', text: isDark ? '#E3B341' : '#7A5700' };
  const low = { bg: isDark ? '#0D2010' : '#E8F8F0', text: isDark ? '#3FB950' : '#1B6B3A' };

  if (value === 'Yüksek' || value === 'Hücumcu') return high;
  if (value === 'Düşük' || value === 'Savunmacı') return low;
  return mid;
}

// ── Stat Helpers ───────────────────────────────────────────────────────────

function calcFormStats(matches: FDMatch[], teamId: number) {
  let homeWin=0,homeDraw=0,homeLoss=0,homeGf=0,homeGa=0,homePlayed=0;
  let awayWin=0,awayDraw=0,awayLoss=0,awayGf=0,awayGa=0,awayPlayed=0;
  let over25=0,kgVar=0,total=0;

  matches.forEach(m => {
    const fh=m.score?.fullTime?.home, fa=m.score?.fullTime?.away;
    if (fh==null||fa==null) return;
    total++;
    const isHome=m.homeTeam?.id===teamId;
    const gf=isHome?fh:fa, ga=isHome?fa:fh;
    if (fh+fa>2.5) over25++;
    if (fh>0&&fa>0) kgVar++;
    if (isHome) {
      homePlayed++; homeGf+=gf; homeGa+=ga;
      if (gf>ga) homeWin++; else if (gf===ga) homeDraw++; else homeLoss++;
    } else {
      awayPlayed++; awayGf+=gf; awayGa+=ga;
      if (gf>ga) awayWin++; else if (gf===ga) awayDraw++; else awayLoss++;
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

function calcFormPoints(matches: FDMatch[], teamId: number): number {
  return [...matches]
    .filter(m=>m.score?.fullTime?.home!=null)
    .sort((a,b)=>new Date(a.utcDate??0).getTime()-new Date(b.utcDate??0).getTime())
    .slice(-5)
    .reduce((pts,m)=>{
      const isHome=m.homeTeam?.id===teamId;
      const gf=isHome?m.score.fullTime.home:m.score.fullTime.away;
      const ga=isHome?m.score.fullTime.away:m.score.fullTime.home;
      return pts+(gf!=null&&ga!=null?(gf>ga?3:gf===ga?1:0):0);
    },0);
}

function getStat(stats:any[]|undefined,...keys:string[]):number{
  if(!stats)return 0;
  for(const key of keys){
    const s=stats.find((x:any)=>x.type?.toLowerCase().includes(key.toLowerCase()));
    if(s)return parseInt(s.value)||0;
  }
  return 0;
}

function getTeamStyle(stats: ReturnType<typeof calcFormStats>): { label: string; color: string; emoji: string } {
  const atk=parseFloat(stats.totalAvgGf as string);
  const def=parseFloat(stats.totalAvgGa as string);
  if (atk>=2.0&&def<=1.0) return {label:'Dominant',     color:'#1565C0',emoji:'👑'};
  if (atk>=1.8&&def>=1.5) return {label:'Açık Futbol',  color:'#E65100',emoji:'⚡'};
  if (atk>=1.7&&def<=1.1) return {label:'Güçlü Hücum',  color:'#185FA5',emoji:'⚽'};
  if (atk<=1.0&&def<=0.9) return {label:'Katı Savunmacı',color:'#1B5E20',emoji:'🛡️'};
  if (atk<=1.2&&def<=1.1) return {label:'Savunmacı',    color:'#388E3C',emoji:'🛡️'};
  if (def>=1.6)            return {label:'Savunması Açık',color:'#A32D2D',emoji:'🚨'};
  return                          {label:'Dengeli',       color:'#555',   emoji:'⚖️'};
}

// ── Commentary Helpers ─────────────────────────────────────────────────────

function getH2HComment(h2hData: FDMatch[], home: string, away: string): string {
  if (h2hData.length < 3) return 'Geçmiş karşılaşma sayısı sınırlı; bu veriye fazla ağırlık vermemek gerekebilir.';
  let hw=0,d=0,aw=0,totalG=0,cnt=0;
  h2hData.forEach(m=>{
    const fh=m.score?.fullTime?.home, fa=m.score?.fullTime?.away;
    if (fh==null||fa==null) return;
    cnt++; totalG+=fh+fa;
    const ih=m.homeTeam?.shortName===home||m.homeTeam?.name?.includes(home);
    if (fh > fa) {
      if (ih) hw++;
      else aw++;
    } else if (fh < fa) {
      if (ih) aw++;
      else hw++;
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

function getOddsComment(oddsData: any, home: string, analysis: MatchAnalysis): string {
  if (!oddsData) return 'Bu maç için oran verisi henüz yayınlanmadı.';
  const hO=parseFloat(oddsData.home)||0;
  const aO=parseFloat(oddsData.away)||0;
  if (!hO||!aO) return 'Oran verisi eksik.';
  const mktFav=hO<aO?home:(aO<hO?'deplasman':null);
  const favOdd=Math.min(hO,aO);
  if (!mktFav) return 'Piyasa bu maçı dengeli görüyor; her iki taraf için benzer oranlar mevcut.';
  if (favOdd<=1.5) return `Piyasa ${mktFav} için çok güçlü favori konumu biçiyor (${favOdd}). Oran düşük, getiri sınırlı.`;
  if (favOdd<=2.0) return `Piyasa ${mktFav} takımını favori görüyor (${favOdd}). Form verisi bu tercihi ${analysis.risk==='Düşük'?'destekliyor':'kısmen destekliyor'}.`;
  return `Piyasa ${mktFav} takımını hafif öne çıkarıyor (${favOdd}). Form verisi bu avantajı aynı netlikte desteklemiyor; bu yüzden maç dengeli okunmalı.`;
}

// ── Referee Profile ────────────────────────────────────────────────────────

function getRefereeProfile(refName: string, leagueApiId: number) {
  const hash = Math.abs(refName.split('').reduce((h,c)=>(Math.imul(31,h)+c.charCodeAt(0))|0,0));
  const physLgs = [2021,2002,203];
  const techLgs = [2014,2019];
  let kartBase = hash % 3;
  if (physLgs.includes(leagueApiId)) kartBase = Math.max(0, kartBase-1);

  const kartLabels = ['düşük','orta','yüksek'];
  const kartColors = ['#27AE60','#E6A817','#A32D2D'];
  const kartEmoji  = ['🟢','🟡','🔴'];
  const faulLabel  = ['toleranslı','dengeli','titiz'][(hash>>2)%3];
  const akis       = (hash>>4)%2===0?'akıcı':'duraksatıcı';

  let narrative='';
  if (physLgs.includes(leagueApiId)) {
    if (kartBase===0) narrative='Lig karakteri ve hakem ismine göre oluşturulan model profili daha toleranslı bir yönetime işaret ediyor; gerçek maç içi kararlar değişebilir.';
    else if (kartBase===2) narrative='Model profili daha sıkı bir yönetim ihtimalini öne çıkarıyor; bu gerçek kart ortalaması değil, temkinli okunmalı.';
    else narrative='Model profili dengeli yönetime işaret ediyor. Kart ve faul yorumu gerçek hakem istatistiği değil, yardımcı sinyal olarak okunmalı.';
  } else if (techLgs.includes(leagueApiId)) {
    if (kartBase===2) narrative='Model profili teknik maçlarda daha düşük kart eşiği ihtimalini öne çıkarıyor.';
    else if (kartBase===0) narrative='Model profili oyunun akışına daha fazla izin veren bir yönetim ihtimalini gösteriyor.';
    else narrative='Model profili standart ve esnek bir yönetim ihtimaline işaret ediyor.';
  } else {
    if (kartBase===0) narrative='Model profili oyun akışına daha fazla izin verilebileceğini gösteriyor; küçük temaslarda tolerans ihtimali var.';
    else if (kartBase===2) narrative='Model profili daha düşük kart eşiği ihtimalini öne çıkarıyor; takımların sert temaslarda dikkatli olması gerekir.';
    else narrative='Model profili dengeli bir yönetim ihtimaline işaret ediyor; büyük maç temposunda kontrol arayışı öne çıkabilir.';
  }

  return { kart:kartLabels[kartBase], kartColor:kartColors[kartBase], kartEmoji:kartEmoji[kartBase], faul:faulLabel, akis, narrative };
}

// ── Visual Components ──────────────────────────────────────────────────────

function ShotGauge({shotsOn,shotsTotal}:{shotsOn:number;shotsTotal:number}){
  const { colors: sc, isDark: sDark } = useTheme();
  const W=140,H=92,cx=W/2,cy=H-8,R=52;
  const ratio=shotsTotal>0?Math.min(Math.max(shotsOn/shotsTotal,0.001),0.999):0.001;
  const angle=(1-ratio)*Math.PI;
  const eax=cx+R*Math.cos(angle), eay=cy-R*Math.sin(angle);
  const gc=ratio>=0.65?'#2E7D32':ratio>=0.4?'#E65100':'#B71C1C';
  const lbl=ratio>=0.65?'Bitiricilik Yüksek':ratio>=0.4?'Tehlikeli Hücum':'İsabet Düşük';
  const nx=cx+(R-7)*Math.cos(angle), ny=cy-(R-7)*Math.sin(angle);
  const needleColor = sDark ? '#C9D1D9' : '#333';
  const trackColor  = sDark ? '#30363D' : '#e8e8e8';
  return (
    <View style={{alignItems:'center',flex:1}}>
      <Svg width={W} height={H}>
        <Path d={`M ${cx-R},${cy} A ${R},${R},0,0,0,${cx+R},${cy}`} fill="none" stroke={trackColor} strokeWidth={12} strokeLinecap="round"/>
        {shotsTotal>0&&<Path d={`M ${cx-R},${cy} A ${R},${R},0,0,0,${eax},${eay}`} fill="none" stroke={gc} strokeWidth={12} strokeLinecap="round"/>}
        <Line x1={cx} y1={cy} x2={nx} y2={ny} stroke={needleColor} strokeWidth={2.5} strokeLinecap="round"/>
        <Circle cx={cx} cy={cy} r={5} fill={needleColor}/>
        <SvgText x={cx} y={cy-20} textAnchor="middle" fontSize={14} fontWeight="bold" fill={gc}>{shotsTotal>0?`${Math.round(ratio*100)}%`:'-'}</SvgText>
      </Svg>
      <Text style={{fontSize:11,fontWeight:'600',color:gc,marginTop:-4,textAlign:'center'}}>{shotsTotal>0?lbl:'Veri Yok'}</Text>
      <Text style={{fontSize:10,color:sc.textMuted,marginTop:2}}>{shotsOn}/{shotsTotal} isabetli</Text>
    </View>
  );
}

const NEON='#00E676';
function RadarChart({homeVals,awayVals,labels}:{homeVals:number[];awayVals:number[];labels:string[]}){
  const { colors: rc, isDark: rDark } = useTheme();
  const SIZE=240,cx=SIZE/2,cy=SIZE/2+4,maxR=80,n=labels.length;
  const toRad=(deg:number)=>deg*(Math.PI/180);
  const angles=Array.from({length:n},(_,i)=>toRad(-90+(360/n)*i));
  const pt=(a:number,r:number)=>({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)});
  const toPath=(vals:number[])=>vals.map((v,i)=>{const{x,y}=pt(angles[i],Math.min(Math.max(v,0),1)*maxR);return`${i===0?'M':'L'}${x},${y}`;}).join(' ')+'Z';
  const rings=[0.25,0.5,0.75,1.0];
  const hSum=homeVals.reduce((s,v)=>s+v,0);
  const aSum=awayVals.reduce((s,v)=>s+v,0);
  const hLeads=hSum>=aSum;
  const hS=hLeads?NEON:rc.primary;
  const aS=!hLeads?NEON:rc.loss;
  const hF=hLeads?'rgba(0,230,118,0.18)':rDark?'rgba(88,166,255,0.12)':'rgba(24,95,165,0.12)';
  const aF=!hLeads?'rgba(0,230,118,0.18)':rDark?'rgba(248,81,73,0.12)':'rgba(163,45,45,0.12)';
  const gridStroke=rDark?'#30363D':'#eee';
  const labelFill=rDark?'#8B949E':'#444';
  return (
    <Svg width={SIZE} height={SIZE}>
      {rings.map(r=>(
        <Polygon key={r} points={angles.map(a=>{const p=pt(a,r*maxR);return`${p.x},${p.y}`;}).join(' ')} fill="none" stroke={gridStroke} strokeWidth={1}/>
      ))}
      {angles.map((a,i)=>{const tip=pt(a,maxR);return<Line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={gridStroke} strokeWidth={1}/>;  })}
      <Path d={toPath(awayVals)} fill={aF} stroke={aS} strokeWidth={hLeads?1.5:2.5}/>
      <Path d={toPath(homeVals)} fill={hF} stroke={hS} strokeWidth={hLeads?2.5:1.5}/>
      {angles.map((a,i)=>{
        const tip=pt(a,maxR+24);
        return<SvgText key={i} x={tip.x} y={tip.y} textAnchor="middle" fontSize={11} fontWeight="600" fill={labelFill}>{labels[i]}</SvgText>;
      })}
      {homeVals.map((v,i)=>{const{x,y}=pt(angles[i],Math.min(Math.max(v,0),1)*maxR);return<Circle key={i} cx={x} cy={y} r={3.5} fill={hS}/>;  })}
      {awayVals.map((v,i)=>{const{x,y}=pt(angles[i],Math.min(Math.max(v,0),1)*maxR);return<Circle key={i} cx={x} cy={y} r={3.5} fill={aS}/>;  })}
    </Svg>
  );
}

function FormHeatRow({matches,teamId,label}:{matches:FDMatch[];teamId:number;label:string}){
  const { colors: fc } = useTheme();
  const last5=[...matches]
    .filter(m=>m.score?.fullTime?.home!=null)
    .sort((a,b)=>new Date(a.utcDate??0).getTime()-new Date(b.utcDate??0).getTime())
    .slice(-5);
  if(last5.length===0) return null;
  return (
    <View style={fStyles.row}>
      <Text style={[fStyles.label,{color:fc.textSub}]} numberOfLines={1}>{label}</Text>
      <View style={fStyles.badges}>
        {last5.map((m,i)=>{
          const isHome=m.homeTeam?.id===teamId;
          const gf=isHome?m.score.fullTime.home:m.score.fullTime.away;
          const ga=isHome?m.score.fullTime.away:m.score.fullTime.home;
          const result=gf!=null&&ga!=null?(gf>ga?'G':gf===ga?'B':'M'):'M';
          const bg=result==='G'?fc.win:result==='B'?fc.draw:fc.loss;
          return(
            <View key={i} style={[fStyles.badge,{backgroundColor:bg}]}>
              <Text style={fStyles.badgeText}>{result}</Text>
              <Text style={fStyles.badgeSub}>{isHome?'İ':'D'}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const fStyles=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingVertical:6,gap:10},
  label:{width:90,fontSize:11,fontWeight:'500'},
  badges:{flexDirection:'row',gap:5},
  badge:{width:32,height:36,borderRadius:6,alignItems:'center',justifyContent:'center'},
  badgeText:{fontSize:11,fontWeight:'700',color:'#fff'},
  badgeSub:{fontSize:8,color:'rgba(255,255,255,0.75)'},
});

function CompareRow({label,homeVal,awayVal,higherIsBetter=true}:{label:string;homeVal:number|string;awayVal:number|string;higherIsBetter?:boolean}){
  const { colors: cc } = useTheme();
  const h=parseFloat(String(homeVal)),a=parseFloat(String(awayVal));
  const hW=higherIsBetter?h>a:h<a, aW=higherIsBetter?a>h:a<h;
  return(
    <View style={[cStyles.row,{borderBottomColor:cc.borderLight}]}>
      <Text style={[cStyles.val,{color:cc.textMuted},hW&&{color:cc.primary,fontWeight:'700',fontSize:16}]}>{homeVal}</Text>
      <Text style={[cStyles.lbl,{color:cc.textMuted}]}>{label}</Text>
      <Text style={[cStyles.val,{color:cc.textMuted},aW&&{color:cc.loss,fontWeight:'700',fontSize:16}]}>{awayVal}</Text>
    </View>
  );
}
const cStyles=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingVertical:9,borderBottomWidth:0.5},
  val:{width:56,fontSize:14,textAlign:'center'},
  lbl:{flex:1,fontSize:11,textAlign:'center'},
  winner:{fontWeight:'700',fontSize:16},
  winnerAway:{fontWeight:'700',fontSize:16},
});

// ── UCL Knockout Motivation ────────────────────────────────────────────────

const UCL_LEAGUE_PHASE_STAGES = new Set(['LEAGUE_PHASE', 'GROUP_STAGE']);

function getUclKnockoutMotivation(stage: string): string {
  if (stage === 'FINAL') return 'Şampiyonlar Ligi FİNALİ — galip gelen Avrupa\'nın şampiyonu. İki takım da tüm sezonun birikimini bu geceye yatırıyor; maksimum motivasyon garanti.';
  if (stage === 'SEMI_FINALS') return 'UCL Yarı Finali — bir final bileti için tek eleme maçı. Lig fazı sıralaması bu aşamada anlamsız; sahada hayatta kalmak tek hedef.';
  if (stage === 'QUARTER_FINALS') return 'UCL Çeyrek Finali — eleme aşaması. Bu noktaya gelen her takım sezonun en yüksek motivasyonuyla sahaya çıkıyor.';
  if (stage === 'ROUND_OF_16') return 'UCL Son 16 — lig fazı bitti, eleme başladı. Her iki taraf da çeyrek finale geçmek için tam güçle oynayacak.';
  if (stage === 'KNOCKOUT_ROUND_PLAY_OFF') return 'UCL Play-off — Son 16 bileti için tek eleme. Bu aşamada lig tablosu değil, bu geceki performans belirleyici.';
  return 'UCL eleme aşaması — kazanan tur atlıyor. İki takım da maksimum motivasyonla sahaya çıkıyor.';
}

// ── Main Screen ────────────────────────────────────────────────────────────

function resolveFormTeamIds(stats: FDMatchDetail | null, routeHomeTeamId: number, routeAwayTeamId: number) {
  return {
    home: stats?.homeTeam?.id || routeHomeTeamId,
    away: stats?.awayTeam?.id || routeAwayTeamId,
  };
}

function resolveWeatherCity(routeCity: string | null, stats: FDMatchDetail | null, routeHomeName: string) {
  return routeCity ||
    getCityForTeam(stats?.homeTeam?.name || '') ||
    getCityForTeam(stats?.homeTeam?.shortName || '') ||
    getCityForTeam(routeHomeName);
}

function resolveMatchContext(stats: FDMatchDetail | null, route: {
  home: string;
  away: string;
  city: string | null;
  homeTeamId: number;
  awayTeamId: number;
}) {
  const teamIds = resolveFormTeamIds(stats, route.homeTeamId, route.awayTeamId);
  return {
    homeName: stats?.homeTeam?.shortName || stats?.homeTeam?.name || route.home,
    awayName: stats?.awayTeam?.shortName || stats?.awayTeam?.name || route.away,
    city: resolveWeatherCity(route.city, stats, route.home),
    homeTeamId: teamIds.home,
    awayTeamId: teamIds.away,
    status: stats?.status,
    stage: stats?.stage,
  };
}

export default function MatchDetail() {
  const { colors: c, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [matchData,  setMatchData]  = useState<FDMatchDetail | null>(null);
  const [h2hData,    setH2hData]    = useState<FDMatch[]>([]);
  const [weatherData,setWeatherData]= useState<any>(null);
  const [oddsData,   setOddsData]   = useState<any>(null);
  const [homeForm,   setHomeForm]   = useState<FDMatch[]>([]);
  const [awayForm,   setAwayForm]   = useState<FDMatch[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showNeden,  setShowNeden]  = useState(false);
  const [showScoutHelp, setShowScoutHelp] = useState<ScoutHelpKey | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [dataIssues, setDataIssues] = useState<Set<DetailDataIssue>>(new Set());

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

  useEffect(()=>{ setMatchData(null);setH2hData([]);setWeatherData(null);setOddsData(null);setHomeForm([]);setAwayForm([]);setStaleNotice(false);setSecondaryLoading(false);setDataIssues(new Set()); },[matchId]);

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
      const contextPayload = await getMatchContext(matchId, finishedParam);
      const stats = contextPayload?.match || await getMatchStats(matchId);
      if (cancelled) return;
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
        matchMissing: !stats,
        formRejected,
        h2hRejected: contextIssues.has('h2h'),
        weatherRejected: false,
        oddsRejected: false,
      }));
      setLoading(false);

      setSecondaryLoading(true);
      try {
        const [h2hR, weatherR, oddsR] = await Promise.allSettled([
          contextPayload ? Promise.resolve(h2hValue) : getH2H(matchId, finishedParam),
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
    // Route params are captured for this match load; matchId is the intended reload key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[matchId]);

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

  const ts = {
    insightBox:      { backgroundColor: isDark ? '#0D2038' : '#f4f8ff', borderLeftColor: c.primary },
    insightText:     { color: isDark ? c.textSub : '#1a3a5c' },
    noDataBox:       { backgroundColor: c.surfaceAlt },
    noDataText:      { color: c.textSub },
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
  };

  if (loading) return <View style={[styles.loaderContainer,{backgroundColor:c.bg}]}><ActivityIndicator size="large" color={c.primary}/></View>;

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
        <DetailStatusBanner
          message={staleAnalysisMessage()}
          boxStyle={[styles.limitedDataBanner, { backgroundColor: isDark ? '#18202A' : '#F3F7FC', borderColor: c.cardBorder }]}
          textStyle={[styles.limitedDataText, { color: c.textSub }]}
        />
      )}

      {/* ── Scout Özeti ── */}
      <View style={[scStyles.card,{backgroundColor:isDark?'#1A1228':'#f4f0ff',borderBottomColor:isDark?'#2D2040':'#ddd6ff'}]}>
        <View style={scStyles.headerRow}>
          <Text style={[scStyles.headerLabel,{color:isDark?'#C19BFF':'#5b2d8e'}]}>🧠 SCOUT ÖZETİ</Text>
          <View style={[scStyles.guvenPill,{backgroundColor:
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
          </View>
        </View>

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

        <Text style={[scStyles.mediumText,{color:c.textSub}]} numberOfLines={4}>{analysis.medium}</Text>
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
              <Text style={[styles.sectionLabel,{color:c.textMuted}]}>MAÇ İSTATİSTİKLERİ</Text>
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
                  <Text style={[styles.sectionLabel,{color:c.textMuted}]}>BİTİRİCİLİK (İSABETLİ ŞUT ORANI)</Text>
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
                  <Text style={[styles.sectionLabel,{color:c.textMuted}]}>MAÇIN SERTLİK SEVİYESİ</Text>
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
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>PERFORMANS PROFİLİ</Text>
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
            <View style={[styles.insightBox,ts.insightBox]}>
              <Text style={[styles.insightText,ts.insightText]}>
                {hLeadsRadar
                  ? `${displayHomeName} form radarında önde. Bu doğrudan maç sonucu tahmini değil; hücum, savunma, form ve gol trendinin toplam gücünü gösterir.`
                  : `${displayAwayName} form radarında önde. Bu doğrudan maç sonucu tahmini değil; hücum, savunma, form ve gol trendinin toplam gücünü gösterir.`}
              </Text>
            </View>
          </>
        ) : (
          <DetailDataNotice
            message={detailDataMessage('performance', hasFormIssue ? 'sourceError' : 'empty')}
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
          />
        )}

        {/* Takım Karşılaştırması */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>TAKIM KARŞILAŞTIRMASI</Text>
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
            <View style={[styles.insightBox,ts.insightBox]}>
              <Text style={[styles.insightText,ts.insightText]}>{compareComment}</Text>
            </View>
          </>
        ) : (
          <DetailDataNotice
            message={detailDataMessage('comparison', hasFormIssue ? 'sourceError' : 'empty')}
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
          />
        )}

        {/* Son Form */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>SON FORM  (İ = İç Saha · D = Deplasman)</Text>
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
            message={detailDataMessage('form', hasFormIssue ? 'sourceError' : 'empty')}
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
          />
        )}

        {/* İç Saha / Deplasman Analizi */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>İÇ SAHA / DEPLASMAN ANALİZİ</Text>
        {hasFormData ? (
          <View style={[styles.insightBox,ts.insightBox]}>
            <Text style={[styles.insightText,ts.insightText]}>{homeAwayComment}</Text>
          </View>
        ) : (
          <DetailDataNotice
            message={detailDataMessage('homeAway', hasFormIssue ? 'sourceError' : 'empty')}
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
          />
        )}

        {/* Oran + Yorum */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>ORAN + YORUM</Text>
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
              const hO=parseFloat(oddsData.home)||0,dO=parseFloat(oddsData.draw)||0,aO=parseFloat(oddsData.away)||0;
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
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
          />
        )}
        <View style={[styles.insightBox,ts.insightBox]}>
          <Text style={[styles.insightText,ts.insightText]}>{oddsComment}</Text>
        </View>
        {drawAnalysis ? (
          <View style={[styles.insightBox,ts.insightBox,{marginTop:0}]}>
            <Text style={[styles.insightText,ts.insightText]}>🤝 {drawAnalysis}</Text>
          </View>
        ) : null}

        {/* Hava Etkisi */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>HAVA ETKİSİ</Text>
        {weatherData ? (
          <>
            <View style={[styles.weatherCard,ts.weatherCard]}>
              <Text style={[styles.weatherCity,ts.weatherCity]}>{weatherData.city}</Text>
              <Text style={styles.weatherIcon}>{weatherData.temp>25?'☀️':weatherData.temp>15?'⛅':weatherData.temp>5?'🌥️':'❄️'}</Text>
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
                {icon:'💨',label:'Rüzgar',level:weatherData.wind>40?'yüksek':weatherData.wind>25?'orta':'düşük',color:weatherData.wind>40?'#E65100':weatherData.wind>25?'#FF8F00':c.textFaint},
                {icon:'🌡️',label:'Sıcaklık',level:weatherData.temp>28||weatherData.temp<5?'orta':'düşük',color:weatherData.temp>28||weatherData.temp<5?'#6A1B9A':c.textFaint},
              ].map(item=>(
                <View key={item.label} style={[styles.impactBadge,ts.impactBadge,{borderColor:item.color}]}>
                  <Text style={styles.impactIcon}>{item.icon}</Text>
                  <Text style={[styles.impactLabel,ts.impactLabel]}>{item.label}</Text>
                  <Text style={[styles.impactLevel,{color:item.color}]}>{item.level}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.insightBox,ts.insightBox]}>
              <Text style={[styles.insightText,ts.insightText,{fontWeight:'500'}]}>Etki: {weatherCom.impact}</Text>
              <Text style={[styles.insightText,ts.insightText,{marginTop:3}]}>{weatherCom.sentence}</Text>
            </View>
          </>
        ) : (
          <DetailDataNotice
            message={secondaryLoading ? 'Hava durumu yükleniyor...' : detailDataMessage('weather', hasWeatherIssue ? 'sourceError' : 'empty')}
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
          />
        )}

        {/* Hakem */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>HAKEM</Text>
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
            <View style={[styles.insightBox,ts.insightBox]}>
              <Text style={[styles.insightText,ts.insightText]}>{refProfile.narrative}</Text>
            </View>
          </>
        ) : (
          <DetailDataNotice
            message={(!isFinished && !isLive) ? '📅 Hakem maç gününe yakın açıklanacak.' : 'Hakem bilgisi bulunamadı.'}
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
          />
        )}

        {/* H2H */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>H2H — GEÇMIŞ KARŞILAŞMALAR</Text>
        <View style={[styles.insightBox,ts.insightBox]}>
          <Text style={[styles.insightText,ts.insightText]}>{h2hComment}</Text>
        </View>
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
            <View style={[styles.insightBox,ts.insightBox]}>
              <Text style={[styles.insightText,ts.insightText]}>{deepH2H.deepComment}</Text>
            </View>
          </>
        )}
        {h2hData.length===0 ? (
          <DetailDataNotice
            message={secondaryLoading ? 'H2H verisi yükleniyor...' : detailDataMessage('h2h', hasH2HIssue ? 'sourceError' : 'empty')}
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
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
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>MAÇ KARAKTERİ DETAYI</Text>
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
            <View style={[styles.insightBox,ts.insightBox]}>
              <Text style={[styles.insightText,ts.insightText]}>
                {characterDetail}
              </Text>
            </View>
          </>
        ) : (
          <DetailDataNotice
            message={detailDataMessage('character', hasFormIssue ? 'sourceError' : 'empty')}
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
          />
        )}

        {/* Motivasyon Faktörü */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>MOTİVASYON FAKTÖRÜ</Text>
        {motivationComment ? (
          <View style={[styles.insightBox,ts.insightBox,{borderLeftColor:isDark?'#E3B341':'#E6A817',borderLeftWidth:3}]}>
            <Text style={[styles.insightText,{color:isDark?'#E3B341':'#7A5700',fontWeight:'600'}]}>🏆 {motivationComment}</Text>
          </View>
        ) : (
          <DetailDataNotice
            message="Bu maçta belirgin bir motivasyon faktörü tespit edilmedi."
            boxStyle={[styles.noDataBox, ts.noDataBox]}
            textStyle={[styles.noDataText, ts.noDataText]}
          />
        )}

        {/* Risk & Uyarı */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>RİSK & UYARI</Text>
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
  container:         { flex:1, backgroundColor:'#fff' },
  loaderContainer:   { flex:1, justifyContent:'center', alignItems:'center' },
  topbar:            { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingTop:52, paddingBottom:10, borderBottomWidth:0.5, borderBottomColor:'#eee' },
  backBtn:           { fontSize:16, color:'#185FA5', fontWeight:'500' },
  topbarCenter:      { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 },
  headerLogo:        { width:28, height:28, resizeMode:'contain' },
  topbarTitle:       { fontSize:13, fontWeight:'500', color:'#111', textAlign:'center', maxWidth:200 },
  topbarSub:         { fontSize:11, color:'#888', textAlign:'center' },
  hero:              { padding:16, borderBottomWidth:0.5, borderBottomColor:'#eee' },
  teamsRow:          { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  teamNameLeft:      { fontSize:13, fontWeight:'500', color:'#111', flex:1 },
  teamNameRight:     { fontSize:13, fontWeight:'500', color:'#111', flex:1, textAlign:'right' },
  vsBlock:           { alignItems:'center', paddingHorizontal:10 },
  vsScore:           { fontSize:24, fontWeight:'600', color:'#111' },
  vsStatusLabel:     { fontSize:10, color:'#888', marginTop:2, fontWeight:'500' },
  vsTime:            { fontSize:20, fontWeight:'500', color:'#111' },
  vsLabel:           { fontSize:11, color:'#888', marginTop:2 },
  heroBadgeRow:      { flexDirection:'row', justifyContent:'center', gap:8 },
  badgeLiga:         { backgroundColor:'#E6F1FB', borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  badgeLigaText:     { fontSize:11, color:'#0C447C' },
  confidenceBadge:   { borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  confidenceBadgeText:{ fontSize:11, fontWeight:'600' },
  scroll:            { flex:1 },
  sectionLabel:      { fontSize:11, color:'#888', fontWeight:'500', paddingHorizontal:14, paddingTop:14, paddingBottom:6, letterSpacing:0.5 },
  insightBox:        { marginHorizontal:14, marginBottom:10, padding:11, backgroundColor:'#f4f8ff', borderRadius:8, borderLeftWidth:3, borderLeftColor:'#185FA5', alignSelf:'stretch' },
  insightText:       { width:'100%', flexShrink:1, flexWrap:'wrap', fontSize:12, color:'#1a3a5c', lineHeight:17 },
  radarLegendRow:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingBottom:4 },
  radarDot:          { width:10, height:10, borderRadius:5 },
  radarLegendText:   { fontSize:11, color:'#555' },
  compareHeader:     { flexDirection:'row', paddingHorizontal:14, paddingBottom:6 },
  compareTeam:       { flex:1, fontSize:12, fontWeight:'500' },
  noDataBox:         { margin:14, padding:16, backgroundColor:'#f8f8f8', borderRadius:10, alignItems:'center' },
  noDataText:        { fontSize:13, color:'#555', textAlign:'center' },
  limitedDataBanner: { marginHorizontal:14, marginTop:10, marginBottom:2, padding:10, borderRadius:8, borderWidth:1 },
  limitedDataText:   { fontSize:12, lineHeight:17 },
  summaryGrid:       { flexDirection:'row', gap:8, paddingHorizontal:14, marginBottom:8 },
  sumBox:            { flex:1, backgroundColor:'#f8f8f8', borderRadius:8, padding:10, alignItems:'center' },
  sumVal:            { fontSize:22, fontWeight:'500', color:'#111' },
  sumLbl:            { fontSize:10, color:'#888', marginTop:2, textAlign:'center' },
  h2hRow:            { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingVertical:10, borderBottomWidth:0.5, borderBottomColor:'#eee' },
  h2hLeft:           { flex:1 },
  h2hDate:           { fontSize:11, color:'#888', marginBottom:2 },
  h2hTeams:          { fontSize:12, color:'#111' },
  h2hScore:          { fontSize:16, fontWeight:'500', color:'#111', minWidth:60, textAlign:'right' },
  statLegend:        { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:14, marginBottom:4 },
  legendHome:        { fontSize:11, color:'#185FA5', fontWeight:'500' },
  legendAway:        { fontSize:11, color:'#A32D2D', fontWeight:'500' },
  statRow:           { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:6, gap:6 },
  statVal:           { fontSize:12, fontWeight:'500', color:'#111', minWidth:30, textAlign:'center' },
  statName:          { fontSize:10, color:'#888', width:100, textAlign:'center' },
  barWrap:           { flex:1, height:4, borderRadius:2, backgroundColor:'#f0f0f0', overflow:'hidden' },
  barHome:           { height:'100%', backgroundColor:'#185FA5', borderRadius:2 },
  barAway:           { height:'100%', backgroundColor:'#A32D2D', borderRadius:2 },
  scoutOddsCard:     { marginHorizontal:14, marginBottom:4, borderRadius:12, borderWidth:1, borderColor:'#C8DAFF', backgroundColor:'#EBF3FF', overflow:'hidden' },
  scoutOddsHeader:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingTop:12, paddingBottom:8 },
  scoutOddsTitle:    { fontSize:12, fontWeight:'700', color:'#0C447C' },
  scoutOddsSub:      { fontSize:10, color:'#6B8CBF' },
  scoutOddsCol:      { flex:1, alignItems:'center', paddingVertical:14, paddingHorizontal:4 },
  scoutOddsLabel:    { fontSize:10, color:'#888', marginBottom:6, textAlign:'center' },
  scoutOddsVal:      { fontSize:20, fontWeight:'700', color:'#111', marginBottom:8 },
  scoutOddsBarWrap:  { width:'80%', height:4, backgroundColor:'#eee', borderRadius:2, overflow:'hidden' },
  scoutOddsBarFill:  { height:'100%', borderRadius:2 },
  marketBtn:         { flex:1, backgroundColor:'#f8f8f8', borderRadius:8, padding:10, alignItems:'center', borderWidth:0.5, borderColor:'#eee' },
  marketType:        { fontSize:10, color:'#888', marginBottom:4, textAlign:'center' },
  marketOdd:         { fontSize:18, fontWeight:'600', color:'#111' },
  weatherCard:       { margin:14, marginBottom:10, backgroundColor:'#f0f6ff', borderRadius:12, padding:20, alignItems:'center' },
  weatherCity:       { fontSize:13, color:'#888', marginBottom:4 },
  weatherIcon:       { fontSize:40, marginBottom:4 },
  weatherTemp:       { fontSize:32, fontWeight:'500', color:'#111' },
  weatherDesc:       { fontSize:13, color:'#666', marginBottom:12 },
  weatherBadgeRow:   { flexDirection:'row', gap:8 },
  weatherBadge:      { backgroundColor:'#fff', borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  weatherBadgeText:  { fontSize:11, color:'#555' },
  impactBadge:       { flex:1, borderWidth:1, borderRadius:8, padding:8, alignItems:'center', backgroundColor:'#fafafa' },
  impactIcon:        { fontSize:16, marginBottom:2 },
  impactLabel:       { fontSize:9, color:'#888', marginBottom:2 },
  impactLevel:       { fontSize:11, fontWeight:'700' },
  refCard:           { marginHorizontal:14, marginBottom:8, backgroundColor:'#f8f8f8', borderRadius:12, padding:14, alignItems:'center' },
  refIcon:           { fontSize:32, marginBottom:4 },
  refName:           { fontSize:14, fontWeight:'500', color:'#111', marginBottom:2, textAlign:'center' },
  refSub:            { fontSize:11, color:'#888' },
  refTagPill:        { flex:1, borderWidth:1, borderRadius:20, paddingVertical:5, alignItems:'center', justifyContent:'center' },
  refTagText:        { fontSize:11, fontWeight:'600' },
  styleBadge:        { flex:1, borderWidth:1.5, borderRadius:10, padding:12, alignItems:'center', backgroundColor:'#fafafa' },
  styleEmoji:        { fontSize:22, marginBottom:4 },
  styleLabel:        { fontSize:13, fontWeight:'700', marginBottom:2, textAlign:'center' },
  styleTeam:         { fontSize:10, color:'#888', textAlign:'center' },
  riskBox:           { marginHorizontal:14, marginBottom:10, borderRadius:10, borderWidth:0.5, borderColor:'#eee', overflow:'hidden' },
  riskRow:           { flexDirection:'row', alignItems:'flex-start', padding:12, gap:8 },
  riskIcon:          { fontSize:14, marginTop:1 },
  riskText:          { flex:1, fontSize:12, color:'#333', lineHeight:17 },
  disclaimerBox:     { marginHorizontal:14, marginBottom:4, padding:12, backgroundColor:'#fff8e1', borderRadius:8, borderWidth:0.5, borderColor:'#ffe082' },
  disclaimerText:    { fontSize:11, color:'#856404', textAlign:'center', lineHeight:16 },
});

const scStyles = StyleSheet.create({
  card:        { backgroundColor:'#f4f0ff', borderBottomWidth:0.5, borderBottomColor:'#ddd6ff', paddingHorizontal:14, paddingTop:12, paddingBottom:12 },
  headerRow:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:9 },
  headerLabel: { fontSize:11, fontWeight:'700', color:'#5b2d8e', letterSpacing:0.6 },
  guvenPill:   { borderRadius:20, paddingLeft:9, paddingRight:5, paddingVertical:3, flexDirection:'row', alignItems:'center', gap:4 },
  guvenText:   { fontSize:10, fontWeight:'600' },
  metricsRow:  { flexDirection:'row', gap:7, marginBottom:9 },
  metricItem:  { flex:1, borderRadius:8, paddingVertical:7, paddingHorizontal:4, alignItems:'center' },
  metricLabelRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, marginBottom:3 },
  metricLabel: { fontSize:9, color:'#666' },
  metricVal:   { fontSize:12, fontWeight:'700' },
  metricHelpBtn: { width:15, height:15, borderRadius:8, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(255,255,255,0.12)' },
  metricHelpText: { fontSize:10, fontWeight:'900', lineHeight:13 },
  inlineHelpBtn: { width:16, height:16, borderRadius:8, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(255,255,255,0.12)' },
  inlineHelpText: { fontSize:10, fontWeight:'900', lineHeight:13 },
  helpBox:     { borderWidth:0.5, borderRadius:10, padding:9, marginTop:-1, marginBottom:9 },
  helpText:    { fontSize:11, lineHeight:16 },
  helpStrong:  { fontWeight:'800' },
  mediumText:  { fontSize:12, color:'#333', lineHeight:18, marginBottom:9, fontStyle:'italic' },
  pickBox:     { borderWidth:1, borderRadius:10, padding:8, marginBottom:8 },
  pickKicker:  { fontSize:8.5, fontWeight:'800', letterSpacing:0.7, marginBottom:2 },
  pickLabel:   { fontSize:13, fontWeight:'800', color:'#111', marginBottom:2 },
  pickDetail:  { width:'100%', flexShrink:1, flexWrap:'wrap', fontSize:10.5, color:'#555', lineHeight:15 },
  nedenBtn:    { alignSelf:'flex-start', paddingVertical:4 },
  nedenBtnText:{ fontSize:11, color:'#5b2d8e', fontWeight:'600' },
  nedenBox:    { marginTop:8, paddingTop:8, borderTopWidth:0.5, borderTopColor:'#ddd6ff' },
  nedenBullet: { fontSize:12, color:'#444', lineHeight:19, marginBottom:3 },
});

