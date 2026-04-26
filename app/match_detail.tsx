import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { getH2H, getMatchStats, getOdds, getTeamForm, getWeather } from '../services/api';
import {
  ANALYSIS_DELTA as DELTA,
  Level,
  MatchFormStats,
  Stil,
  buildReasons,
  getGuven,
  getPersona,
  pickFrom,
  shiftLevel,
  strHash,
} from '../utils/matchAnalysis';
import { MEDIUM_BANK, SHORT_BANK } from '../utils/matchTextBanks';

// ── Types ──────────────────────────────────────────────────────────────────

interface MatchAnalysis {
  stil: Stil; gol: Level; tempo: Level; risk: Level; guven: Level;
  short: string; medium: string; reasons: string[];
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
    const tot  = hAtk + aAtk;
    const avgO = (hSt.over25Pct + aSt.over25Pct) / 2;

    gol   = tot >= 3.0 || avgO >= 62 ? 'Yüksek' : tot < 1.8 || avgO <= 35 ? 'Düşük' : 'Orta';
    tempo = tot >= 2.8 || avgO >= 58 ? 'Yüksek' : tot < 2.0 && avgO <= 40 ? 'Düşük' : 'Orta';

    const atkDiff = Math.abs(hAtk - aAtk);
    const defDiff = Math.abs(hDef - aDef);
    if (atkDiff > 0.5 || (atkDiff > 0.35 && defDiff > 0.35)) {
      stil = hAtk > aAtk && hDef <= aDef ? 'Hücumcu' : 'Savunmacı';
    } else if (hDef < 0.95 && aDef < 0.95) {
      stil = 'Savunmacı';
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
  const persona = getPersona(stil, gol, tempo, risk);
  const short   = pickFrom(SHORT_BANK[persona]  || SHORT_BANK.dengeli,  hash + 5);
  const medium  = pickFrom(MEDIUM_BANK[persona] || MEDIUM_BANK.dengeli, hash + 13);
  const reasons = hasFormData
    ? buildReasons(home, away, hSt, aSt, hFP, aFP, h2hCount, hash + 17)
    : ['Veri henüz yüklenmedi; form ve H2H verileri değerlendirmeye alınamadı.',
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

  return { stil, gol, tempo, risk, guven, short, medium, reasons, badgeLabel, badgeColor, badgeBg };
}

// ── Tag Color ──────────────────────────────────────────────────────────────

function getTagColor(type: string, value: string, isDark: boolean): { bg: string; text: string } {
  if (type === 'stil') {
    if (value === 'Hücumcu')   return { bg: isDark ? '#2C0A0A' : '#FDE8E8', text: isDark ? '#F85149' : '#A32D2D' };
    if (value === 'Savunmacı') return { bg: isDark ? '#0D2010' : '#E8F8F0', text: isDark ? '#3FB950' : '#27500A' };
    return { bg: isDark ? '#0A1929' : '#E6F1FB', text: isDark ? '#58A6FF' : '#185FA5' };
  }
  if (type === 'risk' || type === 'guven') {
    if (value === 'Yüksek') return type === 'risk'
      ? { bg: isDark ? '#2C0A0A' : '#FDE8E8', text: isDark ? '#F85149' : '#A32D2D' }
      : { bg: isDark ? '#0D2010' : '#E8F8F0', text: isDark ? '#3FB950' : '#27500A' };
    if (value === 'Düşük')  return type === 'risk'
      ? { bg: isDark ? '#0D2010' : '#E8F8F0', text: isDark ? '#3FB950' : '#27500A' }
      : { bg: isDark ? '#2C0A0A' : '#FDE8E8', text: isDark ? '#F85149' : '#A32D2D' };
    return { bg: isDark ? '#2A1F00' : '#FFF8E1', text: isDark ? '#E3B341' : '#7A5700' };
  }
  if (type === 'gol') {
    if (value === 'Yüksek') return { bg: isDark ? '#2C0A0A' : '#FDE8E8', text: isDark ? '#F85149' : '#A32D2D' };
    if (value === 'Düşük')  return { bg: isDark ? '#21262D' : '#f0f0f0', text: isDark ? '#8B949E' : '#555' };
    return { bg: isDark ? '#2A1F00' : '#FFF8E1', text: isDark ? '#E3B341' : '#7A5700' };
  }
  // tempo
  if (value === 'Yüksek') return { bg: isDark ? '#2A1F00' : '#FFF8E1', text: isDark ? '#E3B341' : '#7A5700' };
  if (value === 'Düşük')  return { bg: isDark ? '#21262D' : '#f0f0f0', text: isDark ? '#8B949E' : '#555' };
  return { bg: isDark ? '#0A1929' : '#E6F1FB', text: isDark ? '#58A6FF' : '#185FA5' };
}

function TagPill({ label, type, value }: { label: string; type: string; value: string }) {
  const { isDark } = useTheme();
  const { bg, text } = getTagColor(type, value, isDark);
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, marginRight: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: text }}>{label}</Text>
    </View>
  );
}

// ── Stat Helpers ───────────────────────────────────────────────────────────

function calcFormStats(matches: any[], teamId: number) {
  let homeWin=0,homeDraw=0,homeLoss=0,homeGf=0,homeGa=0,homePlayed=0;
  let awayWin=0,awayDraw=0,awayLoss=0,awayGf=0,awayGa=0,awayPlayed=0;
  let over25=0,kgVar=0,total=0;

  matches.forEach((m: any) => {
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

function calcFormPoints(matches: any[], teamId: number): number {
  return matches
    .filter((m:any)=>m.score?.fullTime?.home!=null)
    .slice(-5)
    .reduce((pts:number,m:any)=>{
      const isHome=m.homeTeam?.id===teamId;
      const gf=isHome?m.score.fullTime.home:m.score.fullTime.away;
      const ga=isHome?m.score.fullTime.away:m.score.fullTime.home;
      return pts+(gf>ga?3:gf===ga?1:0);
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

function getH2HComment(h2hData: any[], home: string, away: string): string {
  if (h2hData.length < 3) return 'Geçmiş karşılaşma sayısı sınırlı; bu veriye fazla ağırlık vermemek gerekebilir.';
  let hw=0,d=0,aw=0,totalG=0,cnt=0;
  h2hData.forEach((m:any)=>{
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

function getCompareComment(
  hSt: ReturnType<typeof calcFormStats>,
  aSt: ReturnType<typeof calcFormStats>,
  home: string, away: string,
): string {
  const hAtk=parseFloat(hSt.totalAvgGf as string);
  const aAtk=parseFloat(aSt.totalAvgGf as string);
  const hDef=parseFloat(hSt.totalAvgGa as string);
  const aDef=parseFloat(aSt.totalAvgGa as string);
  const atkLead = hAtk>aAtk+0.3?home : aAtk>hAtk+0.3?away : null;
  const defLead = hDef<aDef-0.25?home : aDef<hDef-0.25?away : null;
  if (atkLead&&defLead&&atkLead===defLead) return `${atkLead} hem hücumda hem savunmada önde; istatistiksel açıdan belirgin üstünlük var.`;
  if (atkLead&&defLead&&atkLead!==defLead) return `${atkLead} hücumda daha üretken, ${defLead} savunmada daha sağlam; dengeli bir güç dağılımı.`;
  if (atkLead) return `${atkLead} gol üretiminde öne çıkıyor; savunmada fark belirgin değil.`;
  if (defLead) return `${defLead} savunmada daha sağlam; hücum üretiminde belirgin fark yok.`;
  return 'Hücum ve savunma metrikleri her iki takım için birbirine yakın; belirgin istatistiksel üstünlük görünmüyor.';
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
  return `Piyasa ${mktFav} takımına hafif avantaj veriyor (${favOdd}). Form farkı bu kadar net değil; değer fırsatı olabilir.`;
}

function getWeatherComment(weatherData: any): { impact: Level; sentence: string } {
  if (!weatherData) return { impact: 'Düşük', sentence: 'Hava durumu verisi alınamadı.' };
  const t=weatherData.temp??15, w=weatherData.wind??0;
  const cond=(weatherData.condition||'').toLowerCase();
  const isRain=/rain|shower|drizzle|yağ/.test(cond);
  if ((isRain&&w>20)||w>40) return { impact:'Yüksek', sentence:`Rüzgar (${w} km/s)${isRain?' ve yağmur':''} uzun top kombinasyonlarını zorlaştırıyor; duran toplar belirleyici olabilir.` };
  if (isRain)   return { impact:'Orta',   sentence:'Islak zemin bireysel hataları artırabilir; deplasman savunması için ekstra risk oluşturuyor.' };
  if (w>25)     return { impact:'Orta',   sentence:`Rüzgar (${w} km/s) yüksek pas hataları yaratabilir. Kısa kombinasyon oynayan takım avantajlı olabilir.` };
  if (t>28)     return { impact:'Orta',   sentence:`Yüksek sıcaklık (${t}°C) ikinci yarı temposunu düşürebilir. Az rotasyon yapan takım dezavantajlı.` };
  if (t<5)      return { impact:'Düşük',  sentence:`Soğuk hava (${t}°C) yüksek pressing sürdürmeyi güçleştirir. Pozisyonel ve kontrollü oyun avantajlı.` };
  return { impact:'Düşük', sentence:`Hava koşulları maç için elverişli (${t}°C, ${w} km/s rüzgar). Belirleyici etki beklenmez.` };
}

function getRiskWarnings(
  hSt: ReturnType<typeof calcFormStats>,
  aSt: ReturnType<typeof calcFormStats>,
  h2hCount: number,
  analysis: MatchAnalysis,
): string[] {
  const w: string[] = [];
  if (hSt.total < 5) w.push(`Ev sahibi için sınırlı veri (${hSt.total} maç) — yüzdeler yanıltıcı olabilir.`);
  if (aSt.total < 5) w.push(`Deplasman için sınırlı veri (${aSt.total} maç) — yüzdeler yanıltıcı olabilir.`);
  if (h2hCount < 3)  w.push('H2H geçmişi yetersiz — doğrudan karşılaşma verisi az.');
  if (analysis.guven === 'Düşük') w.push('Veri güveni düşük — tahminler genel eğilimlere dayanıyor.');
  if (analysis.risk  === 'Yüksek') w.push('Form verileri değişken — bu tür maçlarda sürpriz sık görülür.');
  if (w.length === 0) w.push('Belirgin bir veri riski tespit edilmedi; analiz güvenilir tablo sunuyor.');
  return w;
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
    if (kartBase===0) narrative='Fiziksel temasa karşı toleranslı. Sınırda mücadeleler genellikle uyarı almadan geçer.';
    else if (kartBase===2) narrative='Ligin fiziksel yapısına rağmen kurallara sıkı bağlı. Görece yüksek kart ortalaması bekleniyor.';
    else narrative='Lig karakteriyle uyumlu dengeli yönetim. Aşırı faullere hızlı tepki veriyor.';
  } else if (techLgs.includes(leagueApiId)) {
    if (kartBase===2) narrative='Teknik ligin hassas pozisyonlarını doğru değerlendiriyor. Kart eşiği düşük.';
    else if (kartBase===0) narrative='Teknik bir ligde görece serbest yönetim. Oyun akışını bölmemek öncelikli.';
    else narrative='Standart profil. Duruma göre esneklik gösteriyor.';
  } else {
    if (kartBase===0) narrative='Oyun akışını öncelik belirliyor; küçük ihlallere tolerans var.';
    else if (kartBase===2) narrative='Kart eşiği düşük. Sert girişlere sıfır tolerans; takımlar ihtiyatlı olmalı.';
    else narrative='Dengeli profil. Büyük maçlarda kontrolü elde tutmayı tercih ediyor.';
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

function FormHeatRow({matches,teamId,label}:{matches:any[];teamId:number;label:string}){
  const { colors: fc } = useTheme();
  const last5=matches.filter((m:any)=>m.score?.fullTime?.home!=null).slice(-5);
  if(last5.length===0) return null;
  return (
    <View style={fStyles.row}>
      <Text style={[fStyles.label,{color:fc.textSub}]} numberOfLines={1}>{label}</Text>
      <View style={fStyles.badges}>
        {last5.map((m:any,i:number)=>{
          const isHome=m.homeTeam?.id===teamId;
          const gf=isHome?m.score.fullTime.home:m.score.fullTime.away;
          const ga=isHome?m.score.fullTime.away:m.score.fullTime.home;
          const result=gf>ga?'G':gf===ga?'B':'M';
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

// ── Main Screen ────────────────────────────────────────────────────────────

export default function MatchDetail() {
  const { colors: c, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [matchData,  setMatchData]  = useState<any>(null);
  const [h2hData,    setH2hData]    = useState<any[]>([]);
  const [weatherData,setWeatherData]= useState<any>(null);
  const [oddsData,   setOddsData]   = useState<any>(null);
  const [homeForm,   setHomeForm]   = useState<any[]>([]);
  const [awayForm,   setAwayForm]   = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showNeden,  setShowNeden]  = useState(false);

  const p = (k: string) => Array.isArray(params[k]) ? (params[k] as string[])[0] : ((params[k] as string) || '');
  const home        = p('home');
  const away        = p('away');
  const league      = p('league');
  const city        = p('city') || 'London';
  const matchId     = p('id');
  const utcDate     = p('utcDate');
  const leagueApiId = parseInt(p('leagueApiId') || '0');
  const homeTeamId  = parseInt(p('homeTeamId')  || '0');
  const awayTeamId  = parseInt(p('awayTeamId')  || '0');
  const liveParam      = p('live');
  const scoreParam     = p('score');
  const isFromLive     = liveParam === '1';
  const finishedParam  = p('finished') === '1';

  const matchDate = utcDate ? new Date(utcDate).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}) : '';
  const matchTime = utcDate ? new Date(utcDate).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '';

  useEffect(()=>{ setMatchData(null);setH2hData([]);setWeatherData(null);setOddsData(null);setHomeForm([]);setAwayForm([]); },[matchId]);

  useEffect(()=>{
    async function load(){
      setLoading(true);
      const [statsR,h2hR,weatherR,oddsR,hFormR,aFormR] = await Promise.allSettled([
        getMatchStats(matchId),getH2H(matchId,finishedParam),getWeather(city),
        getOdds(home,away,leagueApiId),getTeamForm(homeTeamId),getTeamForm(awayTeamId),
      ]);
      setMatchData(statsR.status==='fulfilled'?statsR.value:null);
      setH2hData(h2hR.status==='fulfilled'?(h2hR.value||[]):[]);
      setWeatherData(weatherR.status==='fulfilled'?weatherR.value:null);
      setOddsData(oddsR.status==='fulfilled'?oddsR.value:null);
      setHomeForm(hFormR.status==='fulfilled'?(hFormR.value||[]):[]);
      setAwayForm(aFormR.status==='fulfilled'?(aFormR.value||[]):[]);
      setLoading(false);
    }
    if(matchId) load(); else setLoading(false);
    // Route params are captured for this match load; matchId is the intended reload key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[matchId]);

  const status    = matchData?.status;
  const fullHome  = matchData?.score?.fullTime?.home;
  const fullAway  = matchData?.score?.fullTime?.away;
  const halfHome  = matchData?.score?.halfTime?.home;
  const halfAway  = matchData?.score?.halfTime?.away;
  const isFinished= status==='FINISHED';
  const isLive    = status==='IN_PLAY'||status==='LIVE'||status==='PAUSED';

  let displayHome: number|string|null=null, displayAway: number|string|null=null;
  if (isFinished&&fullHome!=null)       { displayHome=fullHome; displayAway=fullAway; }
  else if (isLive) {
    if (fullHome!=null)                 { displayHome=fullHome; displayAway=fullAway; }
    else if (halfHome!=null)            { displayHome=halfHome; displayAway=halfAway; }
  } else if (isFromLive&&scoreParam) {
    displayHome=scoreParam.split(' - ')[0]; displayAway=scoreParam.split(' - ')[1];
  }
  const hasScore = displayHome !== null;
  const refName  = matchData?.referees?.[0]?.name || '';

  const homeStats  = calcFormStats(homeForm, homeTeamId);
  const awayStats  = calcFormStats(awayForm,  awayTeamId);
  const homeFormPts= calcFormPoints(homeForm, homeTeamId);
  const awayFormPts= calcFormPoints(awayForm,  awayTeamId);
  const hasFormData= homeStats.total>0 && awayStats.total>0;

  const weatherRisk= !!weatherData&&(weatherData.wind>35||/rain|shower|drizzle/.test((weatherData.condition||'').toLowerCase()));
  const analysis   = buildMatchAnalysis(home,away,leagueApiId,homeStats,awayStats,homeFormPts,awayFormPts,h2hData.length,weatherRisk,hasFormData);

  const homeRadar=[
    Math.min(parseFloat(homeStats.totalAvgGf)/3,1),
    Math.max(0,1-parseFloat(homeStats.totalAvgGa)/3),
    homeFormPts/15,
    homeStats.totalWinPct/100,
    homeStats.over25Pct/100,
  ];
  const awayRadar=[
    Math.min(parseFloat(awayStats.totalAvgGf)/3,1),
    Math.max(0,1-parseFloat(awayStats.totalAvgGa)/3),
    awayFormPts/15,
    awayStats.totalWinPct/100,
    awayStats.over25Pct/100,
  ];
  const radarLabels=['Hücum','Savunma','Form','Galibiyet','2.5 Üst'];
  const hLeadsRadar= homeRadar.reduce((s,v)=>s+v,0)>=awayRadar.reduce((s,v)=>s+v,0);
  const hStyle = hasFormData ? getTeamStyle(homeStats) : null;
  const aStyle = hasFormData ? getTeamStyle(awayStats)  : null;
  const refProfile= refName ? getRefereeProfile(refName,leagueApiId) : null;
  const weatherCom= getWeatherComment(weatherData);
  const riskWarns = getRiskWarnings(homeStats,awayStats,h2hData.length,analysis);
  const compareComment= hasFormData?getCompareComment(homeStats,awayStats,home,away):'';
  const h2hComment    = getH2HComment(h2hData,home,away);
  const oddsComment   = getOddsComment(oddsData,home,analysis);

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
    bahisBtn:        { backgroundColor: c.surfaceAlt, borderColor: c.border },
    bahisType:       { color: c.textMuted },
    bahisOdd:        { color: c.text },
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
            <Text style={[styles.topbarTitle,{color:c.text}]} numberOfLines={1}>{home} - {away}</Text>
            <Text style={[styles.topbarSub,{color:c.textMuted}]}>{league}</Text>
          </View>
        </View>
        <View style={{width:60}}/>
      </View>

      {/* ── Hero ── */}
      <View style={[styles.hero,{backgroundColor:c.surface,borderBottomColor:c.border}]}>
        <View style={styles.teamsRow}>
          <Text style={[styles.teamNameLeft,{color:c.text}]} numberOfLines={1}>{home}</Text>
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
          <Text style={[styles.teamNameRight,{color:c.text}]} numberOfLines={1}>{away}</Text>
        </View>
        <View style={styles.heroBadgeRow}>
          <View style={[styles.badgeLiga,{backgroundColor:c.primaryLight}]}><Text style={[styles.badgeLigaText,{color:c.primaryDark}]}>{league}</Text></View>
          <View style={[styles.confidenceBadge,{backgroundColor:
            analysis.badgeLabel.includes('Favori')
              ? (isDark ? '#0D2010' : '#E8F8F0')
              : analysis.badgeLabel.includes('Riskli')
                ? (isDark ? '#2C0A0A' : '#FDE8E8')
                : (isDark ? '#2A1F00' : '#FFF8E1')
          }]}>
            <Text style={[styles.confidenceBadgeText,{color:analysis.badgeColor}]}>{analysis.badgeLabel}</Text>
          </View>
        </View>
      </View>

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
          </View>
        </View>

        <View style={scStyles.metricsRow}>
          {(['stil','gol','tempo','risk'] as const).map(key=>{
            const val = analysis[key] as string;
            const {bg,text}=getTagColor(key,val,isDark);
            const label = key==='stil'?'Stil':key==='gol'?'Gol':key==='tempo'?'Tempo':'Risk';
            return(
              <View key={key} style={[scStyles.metricItem,{backgroundColor:bg}]}>
                <Text style={[scStyles.metricLabel,{color:c.textMuted}]}>{label}</Text>
                <Text style={[scStyles.metricVal,{color:text}]}>{val}</Text>
              </View>
            );
          })}
        </View>

        <Text style={[scStyles.mediumText,{color:c.textSub}]}>{analysis.medium}</Text>

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

      {/* ── Hızlı Etiketler ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.tagsBar,{borderBottomColor:c.border,backgroundColor:c.surface}]} contentContainerStyle={styles.tagsBarContent}>
        <TagPill type="stil"  value={analysis.stil}  label={`Stil: ${analysis.stil}`}/>
        <TagPill type="gol"   value={analysis.gol}   label={`Gol: ${analysis.gol}`}/>
        <TagPill type="tempo" value={analysis.tempo}  label={`Tempo: ${analysis.tempo}`}/>
        <TagPill type="risk"  value={analysis.risk}   label={`Risk: ${analysis.risk}`}/>
        <TagPill type="guven" value={analysis.guven}  label={`Güven: ${analysis.guven}`}/>
        {analysis.gol==='Yüksek'&&<TagPill type="gol" value="Yüksek" label="2.5 Üst Eğilimi"/>}
      </ScrollView>

      {/* ── Main Scroll ── */}
      <ScrollView style={[styles.scroll,{backgroundColor:c.bg}]}>

        {/* Canlı / Biten Maç İstatistikleri */}
        {matchData?.statistics?.length>0 && (() => {
          const hS=matchData.statistics[0]?.statistics;
          const aS=matchData.statistics[1]?.statistics;
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
                <Text style={[styles.legendHome,{color:c.primary}]}>{home}</Text>
                <Text style={[styles.legendAway,{color:c.loss}]}>{away}</Text>
              </View>
              {matchData.statistics[0]?.statistics?.map((stat:any,i:number)=>{
                const hv=parseInt(stat.value)||0;
                const av=parseInt(matchData.statistics[1]?.statistics?.[i]?.value)||0;
                const tot=hv+av, hp=tot>0?(hv/tot)*100:50;
                return(
                  <View key={i} style={styles.statRow}>
                    <Text style={[styles.statVal,{color:c.text}]}>{stat.value}</Text>
                    <View style={[styles.barWrap,{backgroundColor:c.border}]}><View style={[styles.barHome,{width:`${hp}%`,backgroundColor:c.primary}]}/></View>
                    <Text style={[styles.statName,{color:c.textMuted}]}>{stat.type}</Text>
                    <View style={[styles.barWrap,{backgroundColor:c.border}]}><View style={[styles.barAway,{width:`${100-hp}%`,backgroundColor:c.loss}]}/></View>
                    <Text style={[styles.statVal,{color:c.text}]}>{matchData.statistics[1]?.statistics?.[i]?.value??'-'}</Text>
                  </View>
                );
              })}
              {(hTot>0||aTot>0)&&(
                <>
                  <Text style={[styles.sectionLabel,{color:c.textMuted}]}>BİTİRİCİLİK (İSABETLİ ŞUT ORANI)</Text>
                  <View style={{flexDirection:'row',paddingHorizontal:8,marginBottom:4}}>
                    <View style={{flex:1,alignItems:'center'}}>
                      <ShotGauge shotsOn={hOn} shotsTotal={hTot}/>
                      <Text style={{fontSize:11,color:c.primary,fontWeight:'500',marginTop:2}} numberOfLines={1}>{home}</Text>
                    </View>
                    <View style={{flex:1,alignItems:'center'}}>
                      <ShotGauge shotsOn={aOn} shotsTotal={aTot}/>
                      <Text style={{fontSize:11,color:c.loss,fontWeight:'500',marginTop:2}} numberOfLines={1}>{away}</Text>
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
        {hasFormData && (
          <>
            <Text style={[styles.sectionLabel,{color:c.textMuted}]}>PERFORMANS PROFİLİ</Text>
            <View style={styles.radarLegendRow}>
              <View style={[styles.radarDot,{backgroundColor:hLeadsRadar?NEON:'#185FA5'}]}/>
              <Text style={[styles.radarLegendText,{color:c.textSub},hLeadsRadar&&{color:NEON,fontWeight:'600'}]}>{home}</Text>
              <View style={[styles.radarDot,{backgroundColor:!hLeadsRadar?NEON:'#A32D2D'}]}/>
              <Text style={[styles.radarLegendText,{color:c.textSub},!hLeadsRadar&&{color:NEON,fontWeight:'600'}]}>{away}</Text>
            </View>
            <View style={{alignItems:'center',marginBottom:4}}>
              <RadarChart homeVals={homeRadar} awayVals={awayRadar} labels={radarLabels}/>
            </View>
            <View style={[styles.insightBox,ts.insightBox]}>
              <Text style={[styles.insightText,ts.insightText]}>
                {hLeadsRadar
                  ? `${home} radar grafiğinde genel olarak önde; hücum ve savunma dengesi lehine.`
                  : `${away} radar grafiğinde genel olarak önde; istatistiksel tablo daha güçlü görünüyor.`}
              </Text>
            </View>
          </>
        )}

        {/* Takım Karşılaştırması */}
        {hasFormData && (
          <>
            <Text style={[styles.sectionLabel,{color:c.textMuted}]}>TAKIM KARŞILAŞTIRMASI</Text>
            <View style={styles.compareHeader}>
              <Text style={[styles.compareTeam,{color:c.primary}]} numberOfLines={1}>{home}</Text>
              <View style={{width:100}}/>
              <Text style={[styles.compareTeam,{color:c.loss,textAlign:'right'}]} numberOfLines={1}>{away}</Text>
            </View>
            <CompareRow label="Gol / Maç"           homeVal={homeStats.totalAvgGf}         awayVal={awayStats.totalAvgGf}/>
            <CompareRow label="Yenilen / Maç"        homeVal={homeStats.totalAvgGa}         awayVal={awayStats.totalAvgGa}        higherIsBetter={false}/>
            <CompareRow label="Galibiyet %"           homeVal={`${homeStats.totalWinPct}%`} awayVal={`${awayStats.totalWinPct}%`}/>
            <CompareRow label="Son 5 (puan)"          homeVal={homeFormPts}                  awayVal={awayFormPts}/>
            <CompareRow label="2.5 Üst %"            homeVal={`${homeStats.over25Pct}%`}   awayVal={`${awayStats.over25Pct}%`}/>
            <CompareRow label="KG Var %"             homeVal={`${homeStats.kgVarPct}%`}    awayVal={`${awayStats.kgVarPct}%`}/>
            <CompareRow label="İç Saha Galibiyet %"  homeVal={`${homeStats.homeWinPct}%`}  awayVal={`${awayStats.homeWinPct}%`}/>
            <CompareRow label="Deplasman Galibiyet %" homeVal={`${homeStats.awayWinPct}%`} awayVal={`${awayStats.awayWinPct}%`}/>
            <View style={[styles.insightBox,ts.insightBox]}>
              <Text style={[styles.insightText,ts.insightText]}>{compareComment}</Text>
            </View>

            {/* Son Form */}
            <Text style={[styles.sectionLabel,{color:c.textMuted}]}>SON FORM  (İ = İç Saha · D = Deplasman)</Text>
            <FormHeatRow matches={homeForm} teamId={homeTeamId} label={home}/>
            <FormHeatRow matches={awayForm} teamId={awayTeamId}  label={away}/>
          </>
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
            {label:home,val:ourH,color:c.primary},
            {label:'Berabere',val:ourD,color:c.textMuted},
            {label:away,val:ourA,color:c.loss},
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
                {label:home,val:oddsData.home},{label:'Berabere',val:oddsData.draw},{label:away,val:oddsData.away}
              ].map((btn,i)=>(
                <View key={i} style={[styles.bahisBtn,ts.bahisBtn]}>
                  <Text style={[styles.bahisType,ts.bahisType]} numberOfLines={1}>{btn.label}</Text>
                  <Text style={[styles.bahisOdd,ts.bahisOdd]}>{btn.val}</Text>
                </View>
              ))}
            </View>
            {/* Bahisçi vs Scout */}
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
                  ?(diffH>0?`${home} formuna göre değer taşıyor (%${Math.abs(diffH)} fark)`:`${home} oranı form tahminine göre düşük`)
                  :(diffA>0?`${away} formuna göre değer taşıyor (%${Math.abs(diffA)} fark)`:`${away} oranı form tahminine göre düşük`))
                :'Piyasa ve form tahmini dengede — belirgin değer farkı yok';
              const cols2=[{label:home,imp:impH,our:ourH},{label:'Berabere',imp:impD,our:ourD},{label:away,imp:impA,our:ourA}];
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
                      <Text style={{fontSize:11,color:hasValue?c.win:c.textMuted,lineHeight:16}}>{hasValue?`💡 ${valueText}`:valueText}</Text>
                    </View>
                  </View>
                </View>
              );
            })()}
          </>
        ) : (
          <View style={[styles.noDataBox,ts.noDataBox]}><Text style={[styles.noDataText,ts.noDataText]}>📅 Bu maç için henüz oran yayınlanmadı.</Text></View>
        )}
        <View style={[styles.insightBox,ts.insightBox]}>
          <Text style={[styles.insightText,ts.insightText]}>{oddsComment}</Text>
        </View>

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
          <View style={[styles.noDataBox,ts.noDataBox]}><Text style={[styles.noDataText,ts.noDataText]}>Hava durumu verisi alınamadı.</Text></View>
        )}

        {/* Hakem */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>HAKEM</Text>
        {refProfile ? (
          <>
            <View style={[styles.refCard,ts.refCard]}>
              <Text style={styles.refIcon}>🧑‍⚖️</Text>
              <Text style={[styles.refName,ts.refName]}>{refName}</Text>
              <Text style={[styles.refSub,ts.refSub]}>{league} · Maç Hakemi</Text>
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
          <View style={[styles.noDataBox,ts.noDataBox]}>
            <Text style={[styles.noDataText,ts.noDataText]}>{(!isFinished && !isLive) ? '📅 Hakem maç gününe yakın açıklanacak.' : 'Hakem bilgisi bulunamadı.'}</Text>
          </View>
        )}

        {/* H2H */}
        <Text style={[styles.sectionLabel,{color:c.textMuted}]}>H2H — GEÇMIŞ KARŞILAŞMALAR</Text>
        <View style={[styles.insightBox,ts.insightBox]}>
          <Text style={[styles.insightText,ts.insightText]}>{h2hComment}</Text>
        </View>
        {h2hData.length===0 ? (
          <View style={[styles.noDataBox,ts.noDataBox]}><Text style={[styles.noDataText,ts.noDataText]}>H2H verisi bulunamadı.</Text></View>
        ) : (
          <>
            {(() => {
              let hw=0,d=0,aw=0;
              h2hData.forEach((m:any)=>{
                const fh=m.score?.fullTime?.home,fa=m.score?.fullTime?.away;
                if(fh==null||fa==null)return;
                const ih=m.homeTeam?.shortName===home||m.homeTeam?.name?.includes(home);
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
                  <View style={[styles.sumBox,ts.sumBox]}><Text style={[styles.sumVal,ts.sumVal,{color:c.primary}]}>{hw}</Text><Text style={[styles.sumLbl,ts.sumLbl]} numberOfLines={1}>{home}</Text></View>
                  <View style={[styles.sumBox,ts.sumBox]}><Text style={[styles.sumVal,ts.sumVal]}>{d}</Text><Text style={[styles.sumLbl,ts.sumLbl]}>Berabere</Text></View>
                  <View style={[styles.sumBox,ts.sumBox]}><Text style={[styles.sumVal,ts.sumVal,{color:c.loss}]}>{aw}</Text><Text style={[styles.sumLbl,ts.sumLbl]} numberOfLines={1}>{away}</Text></View>
                </View>
              );
            })()}
            {h2hData.map((m:any,i:number)=>{
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
        {hasFormData && hStyle && aStyle && (
          <>
            <Text style={[styles.sectionLabel,{color:c.textMuted}]}>MAÇ KARAKTERİ DETAYI</Text>
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
                {analysis.medium}
              </Text>
            </View>
          </>
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
  tagsBar:           { borderBottomWidth:0.5, borderBottomColor:'#eee', maxHeight:42 },
  tagsBarContent:    { paddingHorizontal:14, paddingVertical:8, flexDirection:'row' },
  scroll:            { flex:1 },
  sectionLabel:      { fontSize:11, color:'#888', fontWeight:'500', paddingHorizontal:14, paddingTop:14, paddingBottom:6, letterSpacing:0.5 },
  insightBox:        { marginHorizontal:14, marginBottom:10, padding:11, backgroundColor:'#f4f8ff', borderRadius:8, borderLeftWidth:3, borderLeftColor:'#185FA5' },
  insightText:       { fontSize:12, color:'#1a3a5c', lineHeight:17 },
  radarLegendRow:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingBottom:4 },
  radarDot:          { width:10, height:10, borderRadius:5 },
  radarLegendText:   { fontSize:11, color:'#555' },
  compareHeader:     { flexDirection:'row', paddingHorizontal:14, paddingBottom:6 },
  compareTeam:       { flex:1, fontSize:12, fontWeight:'500' },
  noDataBox:         { margin:14, padding:16, backgroundColor:'#f8f8f8', borderRadius:10, alignItems:'center' },
  noDataText:        { fontSize:13, color:'#555', textAlign:'center' },
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
  bahisBtn:          { flex:1, backgroundColor:'#f8f8f8', borderRadius:8, padding:10, alignItems:'center', borderWidth:0.5, borderColor:'#eee' },
  bahisType:         { fontSize:10, color:'#888', marginBottom:4, textAlign:'center' },
  bahisOdd:          { fontSize:18, fontWeight:'600', color:'#111' },
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
  card:        { backgroundColor:'#f4f0ff', borderBottomWidth:0.5, borderBottomColor:'#ddd6ff', paddingHorizontal:14, paddingTop:12, paddingBottom:14 },
  headerRow:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  headerLabel: { fontSize:11, fontWeight:'700', color:'#5b2d8e', letterSpacing:0.6 },
  guvenPill:   { borderRadius:20, paddingHorizontal:9, paddingVertical:3 },
  guvenText:   { fontSize:10, fontWeight:'600' },
  metricsRow:  { flexDirection:'row', gap:7, marginBottom:12 },
  metricItem:  { flex:1, borderRadius:8, paddingVertical:8, paddingHorizontal:4, alignItems:'center' },
  metricLabel: { fontSize:9, color:'#666', marginBottom:3 },
  metricVal:   { fontSize:12, fontWeight:'700' },
  mediumText:  { fontSize:12, color:'#333', lineHeight:18, marginBottom:10, fontStyle:'italic' },
  nedenBtn:    { alignSelf:'flex-start', paddingVertical:4 },
  nedenBtnText:{ fontSize:11, color:'#5b2d8e', fontWeight:'600' },
  nedenBox:    { marginTop:8, paddingTop:8, borderTopWidth:0.5, borderTopColor:'#ddd6ff' },
  nedenBullet: { fontSize:12, color:'#444', lineHeight:19, marginBottom:3 },
});

