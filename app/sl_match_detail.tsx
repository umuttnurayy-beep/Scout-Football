import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { getCityForTeam, getSuperLigMatch, getSuperLigTeamForm, getWeather } from '../services/api';
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
    if (value === 'Düşük') return type === 'risk'
      ? { bg: isDark ? '#0D2010' : '#E8F8F0', text: isDark ? '#3FB950' : '#27500A' }
      : { bg: isDark ? '#2C0A0A' : '#FDE8E8', text: isDark ? '#F85149' : '#A32D2D' };
    return { bg: isDark ? '#2A1F00' : '#FFF8E1', text: isDark ? '#E3B341' : '#7A5700' };
  }
  if (type === 'gol') {
    if (value === 'Yüksek') return { bg: isDark ? '#2C0A0A' : '#FDE8E8', text: isDark ? '#F85149' : '#A32D2D' };
    if (value === 'Düşük')  return { bg: isDark ? '#21262D' : '#f0f0f0', text: isDark ? '#8B949E' : '#555' };
    return { bg: isDark ? '#2A1F00' : '#FFF8E1', text: isDark ? '#E3B341' : '#7A5700' };
  }
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

// ── Stat Helpers (SL format) ───────────────────────────────────────────────

function calcFormStatsSL(matches: any[], teamId: number) {
  let homeWin=0,homeDraw=0,homeLoss=0,homeGf=0,homeGa=0,homePlayed=0;
  let awayWin=0,awayDraw=0,awayLoss=0,awayGf=0,awayGa=0,awayPlayed=0;
  let over25=0,kgVar=0,total=0;

  matches.forEach((m: any) => {
    const fh = parseInt(m.homeScore), fa = parseInt(m.awayScore);
    if (isNaN(fh) || isNaN(fa)) return;
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

function calcFormPointsSL(matches: any[], teamId: number): number {
  return matches
    .filter((m: any) => !isNaN(parseInt(m.homeScore)))
    .slice(-5)
    .reduce((pts: number, m: any) => {
      const isHome = m.homeTeamId === teamId;
      const gf = isHome ? parseInt(m.homeScore) : parseInt(m.awayScore);
      const ga = isHome ? parseInt(m.awayScore) : parseInt(m.homeScore);
      return pts + (gf > ga ? 3 : gf === ga ? 1 : 0);
    }, 0);
}

function getTeamStyle(stats: ReturnType<typeof calcFormStatsSL>): { label: string; color: string; emoji: string } {
  const atk = parseFloat(stats.totalAvgGf as string);
  const def = parseFloat(stats.totalAvgGa as string);
  if (atk>=2.0&&def<=1.0) return {label:'Dominant',      color:'#1565C0',emoji:'👑'};
  if (atk>=1.8&&def>=1.5) return {label:'Açık Futbol',   color:'#E65100',emoji:'⚡'};
  if (atk>=1.7&&def<=1.1) return {label:'Güçlü Hücum',   color:'#185FA5',emoji:'⚽'};
  if (atk<=1.0&&def<=0.9) return {label:'Katı Savunmacı',color:'#1B5E20',emoji:'🛡️'};
  if (atk<=1.2&&def<=1.1) return {label:'Savunmacı',     color:'#388E3C',emoji:'🛡️'};
  if (def>=1.6)            return {label:'Savunması Açık',color:'#A32D2D',emoji:'🚨'};
  return                          {label:'Dengeli',        color:'#555',   emoji:'⚖️'};
}

// ── Commentary Helpers ─────────────────────────────────────────────────────

function getH2HCommentSL(h2hData: any[], homeTeamId: number, home: string, away: string): string {
  if (h2hData.length < 2) return 'Geçmiş karşılaşma sayısı sınırlı; bu veriye fazla ağırlık vermemek gerekebilir.';
  let hw=0,d=0,aw=0,totalG=0,cnt=0;
  h2hData.forEach((m: any) => {
    const fh=parseInt(m.homeScore), fa=parseInt(m.awayScore);
    if (isNaN(fh)||isNaN(fa)) return;
    cnt++; totalG+=fh+fa;
    const isHomeTeamHome = m.homeTeamId === homeTeamId;
    if (fh > fa) {
      if (isHomeTeamHome) hw++;
      else aw++;
    } else if (fh < fa) {
      if (isHomeTeamHome) aw++;
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
  hSt: ReturnType<typeof calcFormStatsSL>,
  aSt: ReturnType<typeof calcFormStatsSL>,
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
  hSt: ReturnType<typeof calcFormStatsSL>,
  aSt: ReturnType<typeof calcFormStatsSL>,
  h2hCount: number, analysis: MatchAnalysis,
): string[] {
  const w: string[] = [];
  if (hSt.total < 5) w.push(`Ev sahibi için sınırlı veri (${hSt.total} maç) — yüzdeler yanıltıcı olabilir.`);
  if (aSt.total < 5) w.push(`Deplasman için sınırlı veri (${aSt.total} maç) — yüzdeler yanıltıcı olabilir.`);
  if (h2hCount < 2)  w.push('H2H geçmişi yetersiz — doğrudan karşılaşma verisi az.');
  if (analysis.guven === 'Düşük') w.push('Veri güveni düşük — tahminler genel eğilimlere dayanıyor.');
  if (analysis.risk  === 'Yüksek') w.push('Form verileri değişken — bu tür maçlarda sürpriz sık görülür.');
  if (w.length === 0) w.push('Belirgin bir veri riski tespit edilmedi; analiz güvenilir tablo sunuyor.');
  return w;
}

function getRefereeProfile(refName: string) {
  const hash = Math.abs(refName.split('').reduce((h,c)=>(Math.imul(31,h)+c.charCodeAt(0))|0,0));
  let kartBase = hash % 3;
  if (kartBase === 2) kartBase = Math.max(0, kartBase - 1); // SL genelde orta-yüksek
  const kartLabels = ['düşük','orta','yüksek'];
  const kartColors = ['#27AE60','#E6A817','#A32D2D'];
  const kartEmoji  = ['🟢','🟡','🔴'];
  const faulLabel  = ['toleranslı','dengeli','titiz'][(hash>>2)%3];
  const akis       = (hash>>4)%2===0?'akıcı':'duraksatıcı';
  let narrative = '';
  if (kartBase===0) narrative='Fiziksel temasa karşı toleranslı. Sınırda mücadeleler genellikle uyarı almadan geçer.';
  else if (kartBase===2) narrative='Ligin fiziksel yapısına rağmen kurallara sıkı bağlı. Görece yüksek kart ortalaması bekleniyor.';
  else narrative='Lig karakteriyle uyumlu dengeli yönetim. Aşırı faullere hızlı tepki veriyor.';
  return { kart:kartLabels[kartBase], kartColor:kartColors[kartBase], kartEmoji:kartEmoji[kartBase], faul:faulLabel, akis, narrative };
}

// ── Event Parsing (TheSportsDB) ────────────────────────────────────────────

function parseEvents(raw?: string | null): { minute: string; player: string }[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map(s => {
      const m = s.match(/(\d+[+]?\d*)':(.+)/);
      return m ? { minute: m[1], player: m[2].trim() } : null;
    })
    .filter((x): x is { minute: string; player: string } => x !== null);
}

// ── Visual Components ──────────────────────────────────────────────────────

const NEON = '#00E676';

function RadarChart({ homeVals, awayVals, labels }: { homeVals: number[]; awayVals: number[]; labels: string[] }) {
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
  const hS=hLeads?NEON:rc.primary, aS=!hLeads?NEON:rc.loss;
  const hF=hLeads?'rgba(0,230,118,0.18)':'rgba(24,95,165,0.12)';
  const aF=!hLeads?'rgba(0,230,118,0.18)':'rgba(163,45,45,0.12)';
  const gridStroke = rDark ? '#30363D' : '#eee';
  const lblFill = rDark ? '#8B949E' : '#444';
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
        return<SvgText key={i} x={tip.x} y={tip.y} textAnchor="middle" fontSize={11} fontWeight="600" fill={lblFill}>{labels[i]}</SvgText>;
      })}
      {homeVals.map((v,i)=>{const{x,y}=pt(angles[i],Math.min(Math.max(v,0),1)*maxR);return<Circle key={i} cx={x} cy={y} r={3.5} fill={hS}/>;  })}
      {awayVals.map((v,i)=>{const{x,y}=pt(angles[i],Math.min(Math.max(v,0),1)*maxR);return<Circle key={i} cx={x} cy={y} r={3.5} fill={aS}/>;  })}
    </Svg>
  );
}

function FormHeatRowSL({ matches, teamId, label }: { matches: any[]; teamId: number; label: string }) {
  const { colors: fc } = useTheme();
  const last5 = matches.filter((m: any) => !isNaN(parseInt(m.homeScore))).slice(-5);
  if (last5.length === 0) return null;
  return (
    <View style={fStyles.row}>
      <Text style={[fStyles.label, { color: fc.textSub }]} numberOfLines={1}>{label}</Text>
      <View style={fStyles.badges}>
        {last5.map((m: any, i: number) => {
          const isHome = m.homeTeamId === teamId;
          const gf = isHome ? parseInt(m.homeScore) : parseInt(m.awayScore);
          const ga = isHome ? parseInt(m.awayScore) : parseInt(m.homeScore);
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

function CompareRow({ label, homeVal, awayVal, higherIsBetter=true }: { label:string; homeVal:number|string; awayVal:number|string; higherIsBetter?:boolean }) {
  const { colors: cc } = useTheme();
  const h=parseFloat(String(homeVal)),a=parseFloat(String(awayVal));
  const hW=higherIsBetter?h>a:h<a, aW=higherIsBetter?a>h:a<h;
  return (
    <View style={[cStyles.row, { borderBottomColor: cc.borderLight }]}>
      <Text style={[cStyles.val, { color: cc.textMuted }, hW && { color: cc.primary, fontWeight: '700', fontSize: 16 }]}>{homeVal}</Text>
      <Text style={[cStyles.lbl, { color: cc.textMuted }]}>{label}</Text>
      <Text style={[cStyles.val, { color: cc.textMuted }, aW && { color: cc.loss, fontWeight: '700', fontSize: 16 }]}>{awayVal}</Text>
    </View>
  );
}

const cStyles = StyleSheet.create({
  row:        { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:9, borderBottomWidth:0.5, borderBottomColor:'#f0f0f0' },
  val:        { width:56, fontSize:14, color:'#888', textAlign:'center' },
  lbl:        { flex:1, fontSize:11, color:'#888', textAlign:'center' },
  winner:     { color:'#185FA5', fontWeight:'700', fontSize:16 },
  winnerAway: { color:'#A32D2D', fontWeight:'700', fontSize:16 },
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
  const homeTeamId = parseInt(p('homeTeamId') || '0');
  const awayTeamId = parseInt(p('awayTeamId') || '0');
  const timeParam  = p('time');
  const scoreParam = p('score');

  const [event,       setEvent]       = useState<any>(null);
  const [homeForm,    setHomeForm]     = useState<any[]>([]);
  const [awayForm,    setAwayForm]     = useState<any[]>([]);
  const [weatherData, setWeatherData]  = useState<any>(null);
  const [loading,     setLoading]      = useState(true);
  const [showNeden,   setShowNeden]    = useState(false);

  const city = getCityForTeam(home);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ev, hf, af, weather] = await Promise.all([
          getSuperLigMatch(eventId),
          homeTeamId ? getSuperLigTeamForm(homeTeamId) : Promise.resolve([]),
          awayTeamId ? getSuperLigTeamForm(awayTeamId) : Promise.resolve([]),
          getWeather(city),
        ]);
        setEvent(ev);
        setHomeForm(hf);
        setAwayForm(af);
        setWeatherData(weather);
      } catch(e) { console.log('SLMatchDetail load hata:', e); }
      setLoading(false);
    }
    if (eventId) load(); else setLoading(false);
    // Route params are captured for this event load; eventId is the intended reload key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Derived values
  const homeScore  = event?.intHomeScore ?? null;
  const awayScore  = event?.intAwayScore ?? null;
  const isFinished = ['FT', 'AET', 'PEN', 'Match Finished'].includes(event?.strStatus || '');
  const isLive     = event?.strStatus === 'In Progress' || event?.strStatus === 'HT';
  const hasScore   = homeScore !== null && awayScore !== null;
  const venue      = event?.strVenue || null;
  const round      = event?.intRound ? `${event.intRound}. Hafta` : null;
  const refName    = event?.strReferee || '';
  const matchDate  = event?.dateEvent
    ? new Date(event.dateEvent).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })
    : '';

  // Events from TheSportsDB
  const homeGoals   = parseEvents(event?.strHomeGoalDetails);
  const awayGoals   = parseEvents(event?.strAwayGoalDetails);
  const homeYellows = parseEvents(event?.strHomeYellowCards);
  const awayYellows = parseEvents(event?.strAwayYellowCards);
  const homeReds    = parseEvents(event?.strHomeRedCards);
  const awayReds    = parseEvents(event?.strAwayRedCards);
  const hasEvents   = homeGoals.length+awayGoals.length+homeYellows.length+awayYellows.length+homeReds.length+awayReds.length > 0;

  const timeline = [
    ...homeGoals.map(e => ({ ...e, team:'home' as const, type:'goal'   as const })),
    ...awayGoals.map(e => ({ ...e, team:'away' as const, type:'goal'   as const })),
    ...homeYellows.map(e => ({ ...e, team:'home' as const, type:'yellow' as const })),
    ...awayYellows.map(e => ({ ...e, team:'away' as const, type:'yellow' as const })),
    ...homeReds.map(e => ({ ...e, team:'home' as const, type:'red'    as const })),
    ...awayReds.map(e => ({ ...e, team:'away' as const, type:'red'    as const })),
  ].sort((a, b) => parseInt(a.minute) - parseInt(b.minute));

  // H2H: find matches in home team's form history where opponent is away team
  const h2hData = homeForm.filter(m =>
    m.homeTeamId === awayTeamId || m.awayTeamId === awayTeamId
  ).slice(-8);

  // Form stats
  const homeStats   = calcFormStatsSL(homeForm, homeTeamId);
  const awayStats   = calcFormStatsSL(awayForm,  awayTeamId);
  const homeFormPts = calcFormPointsSL(homeForm, homeTeamId);
  const awayFormPts = calcFormPointsSL(awayForm,  awayTeamId);
  const hasFormData = homeStats.total > 0 && awayStats.total > 0;

  const weatherRisk = !!weatherData && (weatherData.wind>35 || /rain|shower|drizzle/.test((weatherData.condition||'').toLowerCase()));
  const analysis    = buildMatchAnalysis(home, away, homeStats, awayStats, homeFormPts, awayFormPts, h2hData.length, weatherRisk, hasFormData);

  const homeRadar = [
    Math.min(parseFloat(homeStats.totalAvgGf)/3, 1),
    Math.max(0, 1-parseFloat(homeStats.totalAvgGa)/3),
    homeFormPts/15,
    homeStats.totalWinPct/100,
    homeStats.over25Pct/100,
  ];
  const awayRadar = [
    Math.min(parseFloat(awayStats.totalAvgGf)/3, 1),
    Math.max(0, 1-parseFloat(awayStats.totalAvgGa)/3),
    awayFormPts/15,
    awayStats.totalWinPct/100,
    awayStats.over25Pct/100,
  ];
  const radarLabels   = ['Hücum','Savunma','Form','Galibiyet','2.5 Üst'];
  const hLeadsRadar   = homeRadar.reduce((s,v)=>s+v,0) >= awayRadar.reduce((s,v)=>s+v,0);
  const hStyle        = hasFormData ? getTeamStyle(homeStats) : null;
  const aStyle        = hasFormData ? getTeamStyle(awayStats)  : null;
  const refProfile    = refName ? getRefereeProfile(refName) : null;
  const weatherCom    = getWeatherComment(weatherData);
  const riskWarns     = getRiskWarnings(homeStats, awayStats, h2hData.length, analysis);
  const compareComment = hasFormData ? getCompareComment(homeStats, awayStats, home, away) : '';
  const h2hComment     = getH2HCommentSL(h2hData, homeTeamId, home, away);

  if (loading) return <View style={styles.loaderContainer}><ActivityIndicator size="large" color={c.primary}/></View>;

  const scoutCardBg    = isDark ? '#1E0F3D' : '#f4f0ff';
  const scoutBorderCol = isDark ? '#2D1B5E' : '#ddd6ff';
  const scoutPurple    = isDark ? '#A371F7' : '#5b2d8e';

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>

      {/* ── Topbar ── */}
      <View style={[styles.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={()=>router.back()}><Text style={[styles.backBtn, { color: c.primary }]}>‹ Geri</Text></TouchableOpacity>
        <View style={styles.topbarCenter}>
          <Image source={require('../assets/images/sf-logo.png')} style={styles.headerLogo} />
          <View style={{alignItems:'center'}}>
            <Text style={[styles.topbarTitle, { color: c.text }]} numberOfLines={1}>{home} - {away}</Text>
            <Text style={[styles.topbarSub, { color: c.textMuted }]}>Süper Lig</Text>
          </View>
        </View>
        <View style={{width:60}}/>
      </View>

      {/* ── Hero ── */}
      <View style={[styles.hero, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <View style={styles.teamsRow}>
          <Text style={[styles.teamNameLeft, { color: c.text }]}  numberOfLines={1}>{home}</Text>
          <View style={styles.vsBlock}>
            {hasScore ? (
              <>
                <Text style={[styles.vsScore, { color: c.text }]}>{homeScore} : {awayScore}</Text>
                {isFinished&&<Text style={[styles.vsStatusLabel, { color: c.textMuted }]}>MS</Text>}
                {isLive&&<Text style={[styles.vsStatusLabel,{color:c.loss}]}>CANLI</Text>}
                {!isFinished&&!isLive&&<Text style={[styles.vsStatusLabel, { color: c.textMuted }]}>devam ediyor</Text>}
              </>
            ) : (
              <Text style={[styles.vsTime, { color: c.text }]}>{timeParam || scoreParam || '–'}</Text>
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
          <View style={[styles.badgeLiga, { backgroundColor: c.primaryLight }]}><Text style={[styles.badgeLigaText, { color: c.primaryDark }]}>Süper Lig{round?` · ${round}`:''}</Text></View>
          <View style={[styles.confidenceBadge,{backgroundColor:analysis.badgeBg}]}>
            <Text style={[styles.confidenceBadgeText,{color:analysis.badgeColor}]}>{analysis.badgeLabel}</Text>
          </View>
        </View>
        {venue&&<Text style={[styles.venueText, { color: c.textMuted }]}>🏟️ {venue}</Text>}
      </View>

      {/* ── Scout Özeti ── */}
      <View style={[scStyles.card, { backgroundColor: scoutCardBg, borderBottomColor: scoutBorderCol }]}>
        <View style={scStyles.headerRow}>
          <Text style={[scStyles.headerLabel, { color: scoutPurple }]}>🧠 SCOUT ÖZETİ</Text>
          <View style={[scStyles.guvenPill,
            analysis.guven==='Yüksek'?{backgroundColor: isDark ? '#0D2010' : '#E8F8F0'}:
            analysis.guven==='Düşük'?{backgroundColor: isDark ? '#2C0A0A' : '#FDE8E8'}:{backgroundColor: isDark ? '#2A1F00' : '#FFF8E1'}]}>
            <Text style={[scStyles.guvenText,
              {color:analysis.guven==='Yüksek'? (isDark ? '#3FB950' : '#1B6B3A') :analysis.guven==='Düşük'? (isDark ? '#F85149' : '#A32D2D') : (isDark ? '#E3B341' : '#7A5700')}]}>
              {analysis.guven==='Yüksek'?'✅':analysis.guven==='Düşük'?'⚠️':'⚡'} Güven: {analysis.guven}
            </Text>
          </View>
        </View>
        <View style={scStyles.metricsRow}>
          {(['stil','gol','tempo','risk'] as const).map(key=>{
            const val = analysis[key] as string;
            const {bg,text} = getTagColor(key, val, isDark);
            const label = key==='stil'?'Stil':key==='gol'?'Gol':key==='tempo'?'Tempo':'Risk';
            return (
              <View key={key} style={[scStyles.metricItem,{backgroundColor:bg}]}>
                <Text style={[scStyles.metricLabel, { color: c.textMuted }]}>{label}</Text>
                <Text style={[scStyles.metricVal,{color:text}]}>{val}</Text>
              </View>
            );
          })}
        </View>
        <Text style={[scStyles.mediumText, { color: c.textSub }]}>{analysis.medium}</Text>
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
      </View>

      {/* ── Hızlı Etiketler ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[styles.tagsBar, { borderBottomColor: c.border }]} contentContainerStyle={styles.tagsBarContent}>
        <TagPill type="stil"  value={analysis.stil}  label={`Stil: ${analysis.stil}`}/>
        <TagPill type="gol"   value={analysis.gol}   label={`Gol: ${analysis.gol}`}/>
        <TagPill type="tempo" value={analysis.tempo}  label={`Tempo: ${analysis.tempo}`}/>
        <TagPill type="risk"  value={analysis.risk}   label={`Risk: ${analysis.risk}`}/>
        <TagPill type="guven" value={analysis.guven}  label={`Güven: ${analysis.guven}`}/>
        {analysis.gol==='Yüksek'&&<TagPill type="gol" value="Yüksek" label="2.5 Üst Eğilimi"/>}
      </ScrollView>

      {/* ── Main Scroll ── */}
      <ScrollView style={styles.scroll}>

        {/* Maç Olayları (TheSportsDB gol/kart detayları) */}
        {isFinished && (
          <>
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>MAÇ OLAYLARI</Text>
            {!hasEvents ? (
              <View style={[styles.noDataBox, { backgroundColor: c.surfaceAlt }]}><Text style={[styles.noDataText, { color: c.textSub }]}>Olay detayı bu maç için mevcut değil.</Text></View>
            ) : (
              <>
                <View style={styles.statLegend}>
                  <Text style={[styles.legendHome, { color: c.primary }]}>{home}</Text>
                  <Text style={[styles.legendAway, { color: c.loss }]}>{away}</Text>
                </View>
                {timeline.map((ev, i) => {
                  const isHome = ev.team === 'home';
                  const icon = ev.type==='goal'?'⚽':ev.type==='yellow'?'🟨':'🟥';
                  return (
                    <View key={i} style={[styles.eventRow, isHome?styles.eventLeft:styles.eventRight]}>
                      {isHome ? (
                        <>
                          <Text style={[styles.eventPlayer, { color: c.text }]} numberOfLines={1}>{ev.player}</Text>
                          <Text style={[styles.eventMin, { color: c.textMuted }]}>{`${ev.minute}'`}</Text>
                          <Text style={styles.eventIcon}>{icon}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.eventIcon}>{icon}</Text>
                          <Text style={[styles.eventMin, { color: c.textMuted }]}>{`${ev.minute}'`}</Text>
                          <Text style={[styles.eventPlayer, { color: c.text }, {textAlign:'right'}]} numberOfLines={1}>{ev.player}</Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* Performans Profili (Radar) */}
        {hasFormData && (
          <>
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>PERFORMANS PROFİLİ</Text>
            <View style={styles.radarLegendRow}>
              <View style={[styles.radarDot,{backgroundColor:hLeadsRadar?NEON:c.primary}]}/>
              <Text style={[styles.radarLegendText,{ color: c.textSub },hLeadsRadar&&{color:NEON,fontWeight:'600'}]}>{home}</Text>
              <View style={[styles.radarDot,{backgroundColor:!hLeadsRadar?NEON:c.loss}]}/>
              <Text style={[styles.radarLegendText,{ color: c.textSub },!hLeadsRadar&&{color:NEON,fontWeight:'600'}]}>{away}</Text>
            </View>
            <View style={{alignItems:'center',marginBottom:4}}>
              <RadarChart homeVals={homeRadar} awayVals={awayRadar} labels={radarLabels}/>
            </View>
            <View style={[styles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
              <Text style={[styles.insightText, { color: c.text }]}>
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
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>TAKIM KARŞILAŞTIRMASI</Text>
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
            <View style={[styles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
              <Text style={[styles.insightText, { color: c.text }]}>{compareComment}</Text>
            </View>

            {/* Son Form */}
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>SON FORM  (İ = İç Saha · D = Deplasman)</Text>
            <FormHeatRowSL matches={homeForm} teamId={homeTeamId} label={home}/>
            <FormHeatRowSL matches={awayForm} teamId={awayTeamId}  label={away}/>
          </>
        )}

        {/* Scout Tahmini */}
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
          return (
            <>
              <Text style={[styles.sectionLabel, { color: c.textMuted }]}>SCOUT TAHMİNİ</Text>
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
        })()}

        {/* Hava Etkisi */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>HAVA ETKİSİ</Text>
        {weatherData ? (
          <>
            <View style={[styles.weatherCard, { backgroundColor: isDark ? '#0D1F3C' : '#f0f6ff' }]}>
              <Text style={[styles.weatherCity, { color: c.textMuted }]}>{weatherData.city}</Text>
              <Text style={styles.weatherIcon}>{weatherData.temp>25?'☀️':weatherData.temp>15?'⛅':weatherData.temp>5?'🌥️':'❄️'}</Text>
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
                {icon:'💨',label:'Rüzgar',level:weatherData.wind>40?'yüksek':weatherData.wind>25?'orta':'düşük',color:weatherData.wind>40?'#E65100':weatherData.wind>25?'#FF8F00':c.textVeryFaint},
                {icon:'🌡️',label:'Sıcaklık',level:weatherData.temp>28||weatherData.temp<5?'orta':'düşük',color:weatherData.temp>28||weatherData.temp<5?'#6A1B9A':c.textVeryFaint},
              ].map(item=>(
                <View key={item.label} style={[styles.impactBadge,{ backgroundColor: c.surfaceAlt, borderColor:item.color}]}>
                  <Text style={styles.impactIcon}>{item.icon}</Text>
                  <Text style={[styles.impactLabel, { color: c.textMuted }]}>{item.label}</Text>
                  <Text style={[styles.impactLevel,{color:item.color}]}>{item.level}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
              <Text style={[styles.insightText,{ color: c.text, fontWeight:'500'}]}>Etki: {weatherCom.impact}</Text>
              <Text style={[styles.insightText,{ color: c.text, marginTop:3}]}>{weatherCom.sentence}</Text>
            </View>
          </>
        ) : (
          <View style={[styles.noDataBox, { backgroundColor: c.surfaceAlt }]}><Text style={[styles.noDataText, { color: c.textSub }]}>Hava durumu verisi alınamadı.</Text></View>
        )}

        {/* Hakem */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>HAKEM</Text>
        {refProfile ? (
          <>
            <View style={[styles.refCard, { backgroundColor: c.surfaceAlt }]}>
              <Text style={styles.refIcon}>🧑‍⚖️</Text>
              <Text style={[styles.refName, { color: c.text }]}>{refName}</Text>
              <Text style={[styles.refSub, { color: c.textMuted }]}>Süper Lig · Maç Hakemi</Text>
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
            <View style={[styles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
              <Text style={[styles.insightText, { color: c.text }]}>{refProfile.narrative}</Text>
            </View>
          </>
        ) : (
          <View style={[styles.noDataBox, { backgroundColor: c.surfaceAlt }]}><Text style={[styles.noDataText, { color: c.textSub }]}>Hakem bilgisi maç başlamadan önce yayınlanmayabilir.</Text></View>
        )}

        {/* H2H */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>H2H — GEÇMIŞ KARŞILAŞMALAR</Text>
        <View style={[styles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
          <Text style={[styles.insightText, { color: c.text }]}>{h2hComment}</Text>
        </View>
        {h2hData.length === 0 ? (
          <View style={[styles.noDataBox, { backgroundColor: c.surfaceAlt }]}><Text style={[styles.noDataText, { color: c.textSub }]}>Bu sezon karşılaşma kaydı bulunamadı.</Text></View>
        ) : (
          <>
            {(() => {
              let hw=0,d=0,aw=0;
              h2hData.forEach((m:any)=>{
                const fh=parseInt(m.homeScore),fa=parseInt(m.awayScore);
                if(isNaN(fh)||isNaN(fa))return;
                const isHomeTeamHome = m.homeTeamId === homeTeamId;
                if (fh > fa) {
                  if (isHomeTeamHome) hw++;
                  else aw++;
                } else if (fh < fa) {
                  if (isHomeTeamHome) aw++;
                  else hw++;
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
            {h2hData.map((m:any,i:number)=>{
              const fh=m.homeScore, fa=m.awayScore;
              const dateStr = m.date
                ? new Date(m.date).toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'})
                : '';
              return (
                <View key={i} style={[styles.h2hRow, { borderBottomColor: c.border }]}>
                  <View style={styles.h2hLeft}>
                    <Text style={[styles.h2hDate, { color: c.textMuted }]}>{dateStr}</Text>
                    <Text style={[styles.h2hTeams, { color: c.text }]}>{m.home} - {m.away}</Text>
                  </View>
                  <Text style={[styles.h2hScore, { color: c.text }]}>{fh??'-'} – {fa??'-'}</Text>
                </View>
              );
            })}
          </>
        )}

        {/* Maç Karakteri Detayı */}
        {hasFormData && hStyle && aStyle && (
          <>
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>MAÇ KARAKTERİ DETAYI</Text>
            <View style={{flexDirection:'row',gap:10,paddingHorizontal:14,marginBottom:10}}>
              {[{team:home,style:hStyle},{team:away,style:aStyle}].map(({team,style},i)=>(
                <View key={i} style={[styles.styleBadge, { backgroundColor: c.surface, borderColor:style.color }]}>
                  <Text style={styles.styleEmoji}>{style.emoji}</Text>
                  <Text style={[styles.styleLabel,{color:style.color}]}>{style.label}</Text>
                  <Text style={[styles.styleTeam, { color: c.textMuted }]} numberOfLines={1}>{team}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.insightBox, { backgroundColor: c.primaryLight, borderLeftColor: c.primary }]}>
              <Text style={[styles.insightText, { color: c.text }]}>{analysis.medium}</Text>
            </View>
          </>
        )}

        {/* Risk & Uyarı */}
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>RİSK & UYARI</Text>
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
  container:          { flex:1, backgroundColor:'#fff' },
  loaderContainer:    { flex:1, justifyContent:'center', alignItems:'center' },
  topbar:             { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingTop:52, paddingBottom:10, borderBottomWidth:0.5, borderBottomColor:'#eee' },
  backBtn:            { fontSize:16, color:'#185FA5', fontWeight:'500' },
  topbarCenter:       { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 },
  headerLogo:         { width:28, height:28, resizeMode:'contain' },
  topbarTitle:        { fontSize:13, fontWeight:'500', color:'#111', textAlign:'center', maxWidth:200 },
  topbarSub:          { fontSize:11, color:'#888', textAlign:'center' },
  hero:               { padding:16, borderBottomWidth:0.5, borderBottomColor:'#eee' },
  teamsRow:           { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  teamNameLeft:       { fontSize:13, fontWeight:'500', color:'#111', flex:1 },
  teamNameRight:      { fontSize:13, fontWeight:'500', color:'#111', flex:1, textAlign:'right' },
  vsBlock:            { alignItems:'center', paddingHorizontal:10 },
  vsScore:            { fontSize:24, fontWeight:'600', color:'#111' },
  vsStatusLabel:      { fontSize:10, color:'#888', marginTop:2, fontWeight:'500' },
  vsTime:             { fontSize:20, fontWeight:'500', color:'#111' },
  vsLabel:            { fontSize:11, color:'#888', marginTop:2 },
  heroBadgeRow:       { flexDirection:'row', justifyContent:'center', gap:8, marginBottom:6 },
  badgeLiga:          { backgroundColor:'#E6F1FB', borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  badgeLigaText:      { fontSize:11, color:'#0C447C' },
  confidenceBadge:    { borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  confidenceBadgeText:{ fontSize:11, fontWeight:'600' },
  venueText:          { fontSize:11, color:'#888', textAlign:'center', marginTop:4 },
  tagsBar:            { borderBottomWidth:0.5, borderBottomColor:'#eee', maxHeight:42 },
  tagsBarContent:     { paddingHorizontal:14, paddingVertical:8, flexDirection:'row' },
  scroll:             { flex:1 },
  sectionLabel:       { fontSize:11, color:'#888', fontWeight:'500', paddingHorizontal:14, paddingTop:14, paddingBottom:6, letterSpacing:0.5 },
  insightBox:         { marginHorizontal:14, marginBottom:10, padding:11, backgroundColor:'#f4f8ff', borderRadius:8, borderLeftWidth:3, borderLeftColor:'#185FA5' },
  insightText:        { fontSize:12, color:'#1a3a5c', lineHeight:17 },
  radarLegendRow:     { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingBottom:4 },
  radarDot:           { width:10, height:10, borderRadius:5 },
  radarLegendText:    { fontSize:11, color:'#555' },
  compareHeader:      { flexDirection:'row', paddingHorizontal:14, paddingBottom:6 },
  compareTeam:        { flex:1, fontSize:12, fontWeight:'500' },
  noDataBox:          { margin:14, padding:16, backgroundColor:'#f8f8f8', borderRadius:10, alignItems:'center' },
  noDataText:         { fontSize:13, color:'#555', textAlign:'center' },
  summaryGrid:        { flexDirection:'row', gap:8, paddingHorizontal:14, marginBottom:8 },
  sumBox:             { flex:1, backgroundColor:'#f8f8f8', borderRadius:8, padding:10, alignItems:'center' },
  sumVal:             { fontSize:22, fontWeight:'500', color:'#111' },
  sumLbl:             { fontSize:10, color:'#888', marginTop:2, textAlign:'center' },
  h2hRow:             { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingVertical:10, borderBottomWidth:0.5, borderBottomColor:'#eee' },
  h2hLeft:            { flex:1 },
  h2hDate:            { fontSize:11, color:'#888', marginBottom:2 },
  h2hTeams:           { fontSize:12, color:'#111' },
  h2hScore:           { fontSize:16, fontWeight:'500', color:'#111', minWidth:60, textAlign:'right' },
  statLegend:         { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:14, marginBottom:4 },
  legendHome:         { fontSize:11, color:'#185FA5', fontWeight:'500' },
  legendAway:         { fontSize:11, color:'#A32D2D', fontWeight:'500' },
  // Events
  eventRow:           { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:6, gap:6 },
  eventLeft:          { justifyContent:'flex-start' },
  eventRight:         { justifyContent:'flex-end' },
  eventIcon:          { fontSize:16, width:22, textAlign:'center' },
  eventMin:           { fontSize:12, color:'#888', width:34, textAlign:'center' },
  eventPlayer:        { fontSize:13, color:'#1a1a2e', flex:1 },
  // Scout odds
  scoutOddsCard:      { marginHorizontal:14, marginBottom:4, borderRadius:12, borderWidth:1, borderColor:'#C8DAFF', backgroundColor:'#EBF3FF', overflow:'hidden' },
  scoutOddsHeader:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingTop:12, paddingBottom:8 },
  scoutOddsTitle:     { fontSize:12, fontWeight:'700', color:'#0C447C' },
  scoutOddsSub:       { fontSize:10, color:'#6B8CBF' },
  scoutOddsCol:       { flex:1, alignItems:'center', paddingVertical:14, paddingHorizontal:4 },
  scoutOddsLabel:     { fontSize:10, color:'#888', marginBottom:6, textAlign:'center' },
  scoutOddsVal:       { fontSize:20, fontWeight:'700', color:'#111', marginBottom:8 },
  scoutOddsBarWrap:   { width:'80%', height:4, backgroundColor:'#eee', borderRadius:2, overflow:'hidden' },
  scoutOddsBarFill:   { height:'100%', borderRadius:2 },
  // Weather
  weatherCard:        { margin:14, marginBottom:10, backgroundColor:'#f0f6ff', borderRadius:12, padding:20, alignItems:'center' },
  weatherCity:        { fontSize:13, color:'#888', marginBottom:4 },
  weatherIcon:        { fontSize:40, marginBottom:4 },
  weatherTemp:        { fontSize:32, fontWeight:'500', color:'#111' },
  weatherDesc:        { fontSize:13, color:'#666', marginBottom:12 },
  weatherBadgeRow:    { flexDirection:'row', gap:8 },
  weatherBadge:       { backgroundColor:'#fff', borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  weatherBadgeText:   { fontSize:11, color:'#555' },
  impactBadge:        { flex:1, borderWidth:1, borderRadius:8, padding:8, alignItems:'center', backgroundColor:'#fafafa' },
  impactIcon:         { fontSize:16, marginBottom:2 },
  impactLabel:        { fontSize:9, color:'#888', marginBottom:2 },
  impactLevel:        { fontSize:11, fontWeight:'700' },
  // Referee
  refCard:            { marginHorizontal:14, marginBottom:8, backgroundColor:'#f8f8f8', borderRadius:12, padding:14, alignItems:'center' },
  refIcon:            { fontSize:32, marginBottom:4 },
  refName:            { fontSize:14, fontWeight:'500', color:'#111', marginBottom:2, textAlign:'center' },
  refSub:             { fontSize:11, color:'#888' },
  refTagPill:         { flex:1, borderWidth:1, borderRadius:20, paddingVertical:5, alignItems:'center', justifyContent:'center' },
  refTagText:         { fontSize:11, fontWeight:'600' },
  // Style badges
  styleBadge:         { flex:1, borderWidth:1.5, borderRadius:10, padding:12, alignItems:'center', backgroundColor:'#fafafa' },
  styleEmoji:         { fontSize:22, marginBottom:4 },
  styleLabel:         { fontSize:13, fontWeight:'700', marginBottom:2, textAlign:'center' },
  styleTeam:          { fontSize:10, color:'#888', textAlign:'center' },
  // Risk
  riskBox:            { marginHorizontal:14, marginBottom:10, borderRadius:10, borderWidth:0.5, borderColor:'#eee', overflow:'hidden' },
  riskRow:            { flexDirection:'row', alignItems:'flex-start', padding:12, gap:8 },
  riskIcon:           { fontSize:14, marginTop:1 },
  riskText:           { flex:1, fontSize:12, color:'#333', lineHeight:17 },
  disclaimerBox:      { marginHorizontal:14, marginBottom:4, padding:12, backgroundColor:'#fff8e1', borderRadius:8, borderWidth:0.5, borderColor:'#ffe082' },
  disclaimerText:     { fontSize:11, color:'#856404', textAlign:'center', lineHeight:16 },
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
