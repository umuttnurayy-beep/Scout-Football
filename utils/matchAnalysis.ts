import { getCityForTeam } from '../services/api';
import type { FDFixtureStat, FDMatch, FDMatchDetail, H2HRawItem, OddsData, WeatherData } from '../services/api';
import { MEDIUM_BANK, SHORT_BANK } from './matchTextBanks';

export type Stil = 'Hücumcu' | 'Savunmacı' | 'Dengeli';
export type Level = 'Düşük' | 'Orta' | 'Yüksek';

export const MIN_H2H = 3;
type SignalSide = 'home' | 'away' | 'balanced';

export interface MatchFormStats {
  total: number;
  totalAvgGf: string | number;
  totalAvgGa: string | number;
  over25Pct: number;
  kgVarPct: number;
  homeWinPct?: number;
  awayWinPct?: number;
  totalWinPct?: number;
  homePlayed?: number;
  awayPlayed?: number;
  // Extended stats
  cleanSheetPct?: number;
  failedToScorePct?: number;
  firstHalfGoalsAvg?: number;
  secondHalfGoalsAvg?: number;
  over15FirstHalfPct?: number;
  secondHalfMoreGoalsPct?: number;
  currentWinStreak?: number;
  currentUnbeatenStreak?: number;
}

export type FormTrend = { direction: 'up' | 'down' | 'stable'; pts5: number; ptsPrev: number };

export interface MotivationContext {
  homePts?: number;
  awayPts?: number;
  homePlayed?: number;
  awayPlayed?: number;
  leaderPts?: number;
  totalTeams?: number;
  homeAbovePts?: number;
  homeBelowPts?: number;
  awayAbovePts?: number;
  awayBelowPts?: number;
  safetyPts?: number;
}

export interface ScoutPick {
  label: string;
  detail: string;
  cardComment?: string;
  tone: 'home' | 'away' | 'draw' | 'goals' | 'caution';
}

type MatchSignalSnapshot = {
  hAtk: number;
  aAtk: number;
  hDef: number;
  aDef: number;
  avgOver: number;
  avgKg: number;
  hHomeWin: number;
  aAwayWin: number;
  hHomePlayed: number;
  aAwayPlayed: number;
  formSide: SignalSide;
  venueSide: SignalSide;
  attackSide: SignalSide;
  overallSide: SignalSide;
  homeEdge: number;
  awayEdge: number;
  conflict: boolean;
  conflictText: string | null;
};

function sideFromDiff(diff: number, threshold: number): SignalSide {
  if (diff >= threshold) return 'home';
  if (diff <= -threshold) return 'away';
  return 'balanced';
}

function parseStatValue(value: string | number | undefined): number {
  const parsed = parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildMatchSignalSnapshot(
  home: string,
  away: string,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  hFP: number,
  aFP: number,
): MatchSignalSnapshot {
  const hAtk = parseStatValue(hSt.totalAvgGf);
  const aAtk = parseStatValue(aSt.totalAvgGf);
  const hDef = parseStatValue(hSt.totalAvgGa);
  const aDef = parseStatValue(aSt.totalAvgGa);
  const avgOver = (hSt.over25Pct + aSt.over25Pct) / 2;
  const avgKg = (hSt.kgVarPct + aSt.kgVarPct) / 2;
  const hHomeWin = hSt.homeWinPct ?? 0;
  const aAwayWin = aSt.awayWinPct ?? 0;
  const hHomePlayed = hSt.homePlayed ?? 0;
  const aAwayPlayed = aSt.awayPlayed ?? 0;
  const formSide = sideFromDiff(hFP - aFP, 4);
  const venueSide = sideFromDiff(hHomeWin - aAwayWin, 12);
  const attackSide = sideFromDiff((hAtk - aDef) - (aAtk - hDef), 0.35);
  const hCleanBonus = (hSt.cleanSheetPct ?? 0) >= 40 ? 1.5 : 0;
  const aCleanBonus = (aSt.cleanSheetPct ?? 0) >= 40 ? 1.5 : 0;
  const hStreakBonus = (hSt.currentWinStreak ?? 0) >= 3 ? 2 : (hSt.currentUnbeatenStreak ?? 0) >= 4 ? 1 : 0;
  const aStreakBonus = (aSt.currentWinStreak ?? 0) >= 3 ? 2 : (aSt.currentUnbeatenStreak ?? 0) >= 4 ? 1 : 0;
  const homeEdge = (hFP - aFP) + (hAtk - aDef) * 3 + (hHomeWin >= 55 ? 2 : 0) + hStreakBonus - aCleanBonus;
  const awayEdge = (aFP - hFP) + (aAtk - hDef) * 3 + (aAwayWin >= 45 ? 2 : 0) + aStreakBonus - hCleanBonus;
  const overallSide = sideFromDiff(homeEdge - awayEdge, 4);
  const namedSides = [formSide, venueSide, attackSide].filter(side => side !== 'balanced');
  const conflict = namedSides.includes('home') && namedSides.includes('away');
  let conflictText: string | null = null;

  if (conflict) {
    const homeBits: string[] = [];
    const awayBits: string[] = [];
    if (venueSide === 'home') homeBits.push('iç saha avantajı');
    if (formSide === 'home') homeBits.push('son form');
    if (attackSide === 'home') homeBits.push('hücum-savunma eşleşmesi');
    if (venueSide === 'away') awayBits.push('deplasman performansı');
    if (formSide === 'away') awayBits.push('son form');
    if (attackSide === 'away') awayBits.push('deplasman gol tehdidi');
    const homeText = homeBits.length ? homeBits.join(' ve ') : 'bazı temel sinyaller';
    const awayText = awayBits.length ? awayBits.join(' ve ') : 'bazı temel sinyaller';
    conflictText = `${home} tarafında ${homeText} öne çıkarken, ${away} tarafında ${awayText} karşı ağırlık oluşturuyor. Bu yüzden taraf yorumu tek veriyle değil, sinyallerin dengesiyle okunmalı.`;
  }

  return {
    hAtk,
    aAtk,
    hDef,
    aDef,
    avgOver,
    avgKg,
    hHomeWin,
    aAwayWin,
    hHomePlayed,
    aAwayPlayed,
    formSide,
    venueSide,
    attackSide,
    overallSide,
    homeEdge,
    awayEdge,
    conflict,
    conflictText,
  };
}

export const ANALYSIS_DELTA = [0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 0];
const LEVELS: Level[] = ['Düşük', 'Orta', 'Yüksek'];

export function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function shiftLevel(l: Level, d: number): Level {
  return LEVELS[Math.max(0, Math.min(2, LEVELS.indexOf(l) + d))];
}

export function pickFrom<T>(arr: T[], hash: number): T {
  return arr[hash % arr.length];
}

export function getPersona(stil: Stil, gol: Level, tempo: Level, risk: Level): string {
  if (gol === 'Yüksek' && tempo === 'Yüksek') return 'acik';
  if (gol === 'Düşük') return 'kilitli';
  if (risk === 'Yüksek') return 'surpriz';
  if (stil === 'Hücumcu' && risk === 'Düşük') return 'favori';
  if (stil === 'Savunmacı') return 'savunma';
  return 'dengeli';
}

// Persona enrichment with additional form-based signals
export function getPersonaEnriched(
  stil: Stil, gol: Level, tempo: Level, risk: Level,
  hSt?: MatchFormStats,
  aSt?: MatchFormStats,
  hTrend?: FormTrend | null,
  aTrend?: FormTrend | null,
): string {
  if (hSt && aSt) {
    const hAtk = parseFloat(hSt.totalAvgGf as string);
    const aAtk = parseFloat(aSt.totalAvgGf as string);
    const hDef = parseFloat(hSt.totalAvgGa as string);
    const aDef = parseFloat(aSt.totalAvgGa as string);
    const hHomeWin = hSt.homeWinPct ?? 0;
    const aAwayWin = aSt.awayWinPct ?? 0;
    const hTrendMove = hTrend ? hTrend.pts5 - hTrend.ptsPrev : 0;
    const aTrendMove = aTrend ? aTrend.pts5 - aTrend.ptsPrev : 0;
    const hasFormTurn =
      (hTrend?.direction === 'up' && aTrend?.direction === 'down') ||
      (hTrend?.direction === 'down' && aTrend?.direction === 'up') ||
      Math.abs(hTrendMove - aTrendMove) >= 5;

    // Both teams attack and concede a lot — open goalfest
    if (hAtk >= 1.8 && aAtk >= 1.8 && hDef >= 1.5 && aDef >= 1.5) return 'gol_savasi';
    if (hasFormTurn) return 'form_donusu';
    // Strong home fortress vs weak traveler
    if (hHomeWin >= 65 && aAwayWin <= 28) return 'ev_kalesi';
  }
  return getPersona(stil, gol, tempo, risk);
}

// ── H2H Pattern Analysis ───────────────────────────────────────────────────

export type H2HPattern = {
  count: number;
  over25Pct: number;
  bttsPct: number;
  avgGoals: number;
  dominantSide: 'home' | 'away' | 'balanced';
  dominanceRate: number;
  recentWinner: 'home' | 'away' | 'balanced';
};

export function analyzeH2H(items: H2HRawItem[]): H2HPattern | null {
  const valid = items.filter(m => {
    const fh = m.score?.fullTime?.home ?? m.homeScore;
    const fa = m.score?.fullTime?.away ?? m.awayScore;
    return fh != null && fa != null;
  });
  if (valid.length < MIN_H2H) return null;

  let over25 = 0, btts = 0, homeWins = 0, awayWins = 0, totalGoals = 0;
  valid.forEach(m => {
    const fh = (m.score?.fullTime?.home ?? m.homeScore)!;
    const fa = (m.score?.fullTime?.away ?? m.awayScore)!;
    totalGoals += fh + fa;
    if (fh + fa > 2.5) over25++;
    if (fh > 0 && fa > 0) btts++;
    if (fh > fa) homeWins++;
    else if (fa > fh) awayWins++;
  });

  const sorted = [...valid].sort((a, b) => {
    const da = a.utcDate ?? a.date ?? '';
    const db = b.utcDate ?? b.date ?? '';
    return da.localeCompare(db);
  });
  const recent3 = sorted.slice(-3);
  let rHw = 0, rAw = 0;
  recent3.forEach(m => {
    const fh = (m.score?.fullTime?.home ?? m.homeScore)!;
    const fa = (m.score?.fullTime?.away ?? m.awayScore)!;
    if (fh > fa) rHw++;
    else if (fa > fh) rAw++;
  });

  const n = valid.length;
  const dominant = homeWins > awayWins ? 'home' : awayWins > homeWins ? 'away' : 'balanced';
  const dominanceRate = Math.round((Math.max(homeWins, awayWins) / n) * 100);

  return {
    count: n,
    over25Pct: Math.round((over25 / n) * 100),
    bttsPct: Math.round((btts / n) * 100),
    avgGoals: parseFloat((totalGoals / n).toFixed(1)),
    dominantSide: dominant,
    dominanceRate,
    recentWinner: rHw >= 2 ? 'home' : rAw >= 2 ? 'away' : 'balanced',
  };
}

// ── Short Analysis (replaces generic SHORT_BANK when form data available) ──

export function buildShortAnalysis(
  home: string, away: string,
  hSt: MatchFormStats, aSt: MatchFormStats,
  hFP: number, aFP: number,
  pick: ScoutPick,
): string {
  const hAtk = parseStatValue(hSt.totalAvgGf);
  const aAtk = parseStatValue(aSt.totalAvgGf);
  const hDef = parseStatValue(hSt.totalAvgGa);
  const aDef = parseStatValue(aSt.totalAvgGa);
  const avgOver = Math.round((hSt.over25Pct + aSt.over25Pct) / 2);
  const hWinStr = hSt.currentWinStreak ?? 0;
  const aWinStr = aSt.currentWinStreak ?? 0;
  const hUnbeat = hSt.currentUnbeatenStreak ?? 0;
  const aUnbeat = aSt.currentUnbeatenStreak ?? 0;
  const hClean = hSt.cleanSheetPct ?? 0;
  const aClean = aSt.cleanSheetPct ?? 0;

  // Streak-based (highest priority)
  if (hWinStr >= 4) return `${home} son ${hWinStr} maçı kazanarak bu fikstüre girdi — form ivmesi zirve noktasında.`;
  if (aWinStr >= 4) return `${away} son ${aWinStr} maçı kazanarak bu fikstüre girdi — deplasmandaki form ivmesi dikkat çekiyor.`;
  if (hUnbeat >= 5 && aUnbeat < 3) return `${home} ${hUnbeat} maçlık yenilmezlik serisiyle sahaya çıkıyor; ${away} bu formdaki ev sahibini durdurmak için zorlanabilir.`;
  if (aUnbeat >= 5 && hUnbeat < 3) return `${away} ${aUnbeat} maçlık yenilmezlik serisiyle geliyor; ev sahibi avantajını bu deplasman profiline karşı net hissettirmek durumunda.`;

  // Pick-tone based with real numbers
  if (pick.tone === 'home') {
    const formNote = hFP > aFP + 3 ? `Son 5 maç formunda ${home} ${hFP} puanla ${aFP} puanlık ${away}'ı geride bırakıyor.` : '';
    const atkNote = hAtk - aDef >= 0.4 ? `${home} gol ortalaması (${hAtk}) ${away} savunmasının verdiği ortalamanın (${aDef}) üzerinde.` : '';
    if (hClean >= 40) return `${home} savunması son dönemde sağlam — %${hClean} kale sıfır oranıyla baskı altında bile yenilmeye direnç var. ${formNote || atkNote}`.trim();
    if (formNote) return `${formNote}${atkNote ? ` ${atkNote}` : ''}`;
    return `${home} form ve eşleşme verileriyle bu maçta hafif öne çıkıyor; gol ortalaması ${hAtk.toFixed(1)} vs savunma ${aDef.toFixed(1)}.`;
  }

  if (pick.tone === 'away') {
    const formNote = aFP > hFP + 3 ? `${away} son 5 maçta ${aFP} puan toplayarak ${hFP} puanlık ${home}'dan daha iyi formda.` : '';
    const atkNote = aAtk - hDef >= 0.4 ? `Deplasman gol ortalaması (${aAtk}) ev sahibi savunma ortalamasının (${hDef}) üzerinde.` : '';
    if (aClean >= 40) return `${away} savunması deplasmanı sıfır yenerek kapatma becerisini (%${aClean}) koruyor. ${formNote || atkNote}`.trim();
    if (formNote) return `${formNote}${atkNote ? ` ${atkNote}` : ''}`;
    return `${away} deplasman verileri ve gol üretimiyle (${aAtk.toFixed(1)}) ev sahibi savunmasını (${hDef.toFixed(1)}) zorlayabilecek profilde.`;
  }

  if (pick.tone === 'goals') {
    const bothAtk = hAtk >= 1.5 && aAtk >= 1.5;
    if (bothAtk) return `İki tarafın gol üretimi de güçlü (${home} ${hAtk.toFixed(1)}, ${away} ${aAtk.toFixed(1)}) — maçın skor üretmesi beklenebilir (2.5 üst eğilimi %${avgOver}).`;
    return `Gol eğilimi %${avgOver} seviyesiyle yüksek; hücum-savunma eşleşmesi skor üretimini destekliyor.`;
  }

  if (pick.tone === 'draw') {
    return `Gol eğilimi düşük (%${avgOver} 2.5 üst), form farkı sınırlı (${hFP}-${aFP} puan); kontrollü ve dar skorlu maç profili öne çıkıyor.`;
  }

  // Default caution / balanced
  return `Form dengeli (${hFP}-${aFP} puan), gol verisi orta (%${avgOver} 2.5 üst); maçın yönü ilk gol ve tempo değişimiyle şekillenecek.`;
}

export function getTagColor(type: string, value: string, isDark: boolean): { bg: string; text: string } {
  if (type === 'stil') {
    if (value === 'Hücumcu')   return { bg: isDark ? '#2C0A0A' : '#FDE8E8', text: isDark ? '#F85149' : '#A32D2D' };
    if (value === 'Savunmacı') return { bg: isDark ? '#0D2010' : '#E8F8F0', text: isDark ? '#3FB950' : '#27500A' };
    return { bg: isDark ? '#0D2F4F' : '#E6F1FB', text: isDark ? '#58A6FF' : '#185FA5' };
  }
  if (value === 'Yüksek') return { bg: isDark ? '#3D0F0F' : '#FDE8E8', text: isDark ? '#F85149' : '#A32D2D' };
  if (value === 'Orta')   return { bg: isDark ? '#2D1A00' : '#FFF8E1', text: isDark ? '#E3B341' : '#E6A817' };
  return { bg: isDark ? '#21262D' : '#f0f0f0', text: isDark ? '#8B949E' : '#666' };
}

export function buildReasons(
  home: string, away: string,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  hFP: number, aFP: number,
  h2hCount: number, hash: number,
  hTrend?: FormTrend | null,
  aTrend?: FormTrend | null,
  weatherRisk = false,
  h2hItems?: H2HRawItem[],
): string[] {
  const hAtk = parseFloat(hSt.totalAvgGf as string);
  const aAtk = parseFloat(aSt.totalAvgGf as string);
  const hDef = parseFloat(hSt.totalAvgGa as string);
  const aDef = parseFloat(aSt.totalAvgGa as string);
  const pool: string[] = [];

  if (Math.abs(hAtk - aAtk) < 0.25) {
    pool.push('\u0130ki tak\u0131m\u0131n gol \u00fcretimi birbirine yak\u0131n (' + hAtk + ' - ' + aAtk + ' ort.).');
  } else {
    const lead = hAtk > aAtk ? home : away;
    pool.push(lead + ' gol ortalamas\u0131nda \u00f6nde (' + Math.max(hAtk, aAtk).toFixed(1) + ' vs ' + Math.min(hAtk, aAtk).toFixed(1) + ').');
  }
  if (Math.abs(hDef - aDef) < 0.25) {
    pool.push('Savunma istatistikleri birbirine yak\u0131n; belirgin savunma avantaj\u0131 yok.');
  } else {
    const better = hDef < aDef ? home : away;
    pool.push(better + ' savunmada daha sa\u011flam (' + Math.min(hDef, aDef).toFixed(1) + ' vs ' + Math.max(hDef, aDef).toFixed(1) + ' yenilen ort.).');
  }
  if (Math.abs(hFP - aFP) <= 2) {
    pool.push('Son 5 ma\u00e7 form dengesi yak\u0131n (' + hFP + ' - ' + aFP + ' puan).');
  } else {
    const fLead = hFP > aFP ? home : away;
    pool.push(fLead + ' son 5 ma\u00e7ta daha istikrarl\u0131 (' + Math.max(hFP, aFP) + ' puan vs ' + Math.min(hFP, aFP) + ').');
  }
  if (h2hCount >= MIN_H2H) {
    pool.push('H2H ge\u00e7mi\u015fi ' + h2hCount + ' ma\u00e7l\u0131k veri sunuyor; tarihsel kal\u0131plar da de\u011ferlendirildi.');
  } else {
    pool.push('Do\u011frudan kar\u015f\u0131la\u015fma verisi s\u0131n\u0131rl\u0131; sezon istatistikleri \u00f6ne al\u0131nd\u0131.');
  }

  const avgOver = (hSt.over25Pct + aSt.over25Pct) / 2;
  const avgKg = (hSt.kgVarPct + aSt.kgVarPct) / 2;
  if (avgOver >= 60) pool.push('2.5 \u00fcst trendi tutarl\u0131 (ort. %' + Math.round(avgOver) + ').');
  else if (avgOver <= 35) pool.push('Alt trendi belirgin (2.5 \u00fcst ort. %' + Math.round(avgOver) + ').');
  else if (avgKg >= 58) pool.push('KG Var e\u011filimi \u00f6ne \u00e7\u0131k\u0131yor (ort. %' + Math.round(avgKg) + ').');
  else pool.push('Over/BTTS istatistikleri dengede; her iki senaryo ge\u00e7erli.');

  const hHomeWin = hSt.homeWinPct ?? 0;
  const aAwayWin = aSt.awayWinPct ?? 0;
  const hHomePlayed = hSt.homePlayed ?? 0;
  const aAwayPlayed = aSt.awayPlayed ?? 0;
  if (hHomeWin >= 60) pool.push(home + ' kendi sahas\u0131nda g\u00fc\u00e7l\u00fc (%' + hHomeWin + ' i\u00e7 saha galibiyet, ' + (hHomePlayed || '?') + ' ma\u00e7).');
  if (aAwayWin >= 50) pool.push(away + ' deplasmanlar\u0131n\u0131 iyi y\u00f6netiyor (%' + aAwayWin + ' deplasman galibiyet, ' + (aAwayPlayed || '?') + ' ma\u00e7).');

  const advanced: string[] = [];
  const totalSample = Math.min(hSt.total, aSt.total);
  if (totalSample < 6) {
    advanced.push('\u00d6rneklem s\u0131n\u0131rl\u0131 (' + home + ': ' + hSt.total + ', ' + away + ': ' + aSt.total + ' ma\u00e7); y\u00fczdeler tek ba\u015f\u0131na g\u00fc\u00e7l\u00fc sinyal say\u0131lmamal\u0131.');
  } else if ((hHomeWin >= 80 && hHomePlayed > 0 && hHomePlayed < 4) || (aAwayWin >= 80 && aAwayPlayed > 0 && aAwayPlayed < 4)) {
    advanced.push('\u0130\u00e7 saha/deplasman y\u00fczdesi y\u00fcksek g\u00f6r\u00fcnse de ma\u00e7 say\u0131s\u0131 d\u00fc\u015f\u00fck; bu veri form sinyali olarak temkinli okunmal\u0131.');
  } else {
    advanced.push('Form \u00f6rneklemi yeterli seviyede (' + home + ': ' + hSt.total + ', ' + away + ': ' + aSt.total + ' ma\u00e7); oranlar daha sa\u011fl\u0131kl\u0131 okunabilir.');
  }

  if (hTrend && aTrend) {
    const hMove = hTrend.pts5 - hTrend.ptsPrev;
    const aMove = aTrend.pts5 - aTrend.ptsPrev;
    if (Math.abs(hMove - aMove) >= 5) {
      const lead = hMove > aMove ? home : away;
      advanced.push(lead + ' momentum taraf\u0131nda ayr\u0131\u015f\u0131yor; son 5 / \u00f6nceki 5 fark\u0131 ma\u00e7\u0131n g\u00fcncel form okumas\u0131n\u0131 de\u011fi\u015ftiriyor.');
    } else if (hTrend.direction !== 'stable' || aTrend.direction !== 'stable') {
      advanced.push('Form trendi dengeli de\u011fil: ' + home + ' ' + hTrend.pts5 + '-' + hTrend.ptsPrev + ', ' + away + ' ' + aTrend.pts5 + '-' + aTrend.ptsPrev + ' puan \u00e7izgisinde.');
    }
  }

  const hAttackEdge = hAtk - aDef;
  const aAttackEdge = aAtk - hDef;
  if (hAttackEdge >= 0.45 && aAttackEdge < 0.2) {
    advanced.push(home + ' taraf\u0131nda h\u00fccum-savunma e\u015fle\u015fmesi daha net; rakip savunman\u0131n verdi\u011fi alan ev sahibinin gol \u00fcretimini destekliyor.');
  } else if (aAttackEdge >= 0.45 && hAttackEdge < 0.2) {
    advanced.push(away + ' taraf\u0131nda h\u00fccum-savunma e\u015fle\u015fmesi daha net; deplasman ekibinin gol tehdidi sezon verisiyle destekleniyor.');
  } else if (hAttackEdge >= 0.35 && aAttackEdge >= 0.35) {
    advanced.push('\u0130ki h\u00fccum hatt\u0131 da rakip savunman\u0131n \u00fczerinde sinyal veriyor; ilk gol ma\u00e7\u0131 h\u0131zl\u0131 bi\u00e7imde a\u00e7abilir.');
  } else if (hAttackEdge <= -0.25 && aAttackEdge <= -0.25) {
    advanced.push('H\u00fccum-savunma e\u015fle\u015fmesi iki taraf i\u00e7in de kolay alan g\u00f6stermiyor; pozisyon kalitesi skor hacmini s\u0131n\u0131rlayabilir.');
  }

  if (hAtk >= 1.6 && aDef >= 1.4) {
    advanced.push(home + ' h\u00fccum \u00fcretimi ile ' + away + ' savunma k\u0131r\u0131lganl\u0131\u011f\u0131 ayn\u0131 y\u00f6ne i\u015faret ediyor; ev sahibi bask\u0131s\u0131 veriyle destekleniyor.');
  } else if (aAtk >= 1.6 && hDef >= 1.4) {
    advanced.push(away + ' h\u00fccum \u00fcretimi ile ' + home + ' savunma k\u0131r\u0131lganl\u0131\u011f\u0131 e\u015fle\u015fiyor; deplasman gol tehdidi g\u00f6z ard\u0131 edilmemeli.');
  } else if (hDef <= 1.0 && aAtk <= 1.2) {
    advanced.push(home + ' savunmas\u0131 ile ' + away + ' h\u00fccum \u00fcretimi aras\u0131ndaki e\u015fle\u015fme daha kontroll\u00fc bir deplasman performans\u0131na i\u015faret ediyor.');
  } else if (aDef <= 1.0 && hAtk <= 1.2) {
    advanced.push(away + ' savunmas\u0131 ile ' + home + ' h\u00fccum \u00fcretimi aras\u0131ndaki e\u015fle\u015fme ev sahibi \u00fcretimini s\u0131n\u0131rlayabilir.');
  }

  if (avgOver >= 60 && avgKg <= 45) {
    advanced.push('Gol trendi y\u00fcksek olsa da KG Var taraf\u0131 ayn\u0131 g\u00fc\u00e7te destek vermiyor; skor tek tarafl\u0131 a\u00e7\u0131lma senaryosu da masada.');
  } else if (avgOver <= 40 && avgKg >= 58) {
    advanced.push('2.5 \u00fcst d\u00fc\u015f\u00fck kal\u0131rken KG Var e\u011filimi canl\u0131; 1-1 gibi dar skorlu senaryolar veriyle uyumlu.');
  } else if (avgOver >= 60 && Math.abs(hFP - aFP) <= 2) {
    advanced.push('Gol beklentisi g\u00fc\u00e7l\u00fc, fakat son form dengesi yak\u0131n; taraf se\u00e7imi yerine ma\u00e7 temposu daha g\u00fcvenilir sinyal veriyor.');
  }

  if (avgOver >= 58 && hFP >= 8 && aFP >= 8) {
    advanced.push('Form puan\u0131 ve gol trendi ayn\u0131 anda y\u00fcksek; oyunun erken b\u00f6l\u00fcmde kilitli kalmas\u0131 halinde bile ikinci yar\u0131 temposu artabilir.');
  } else if (avgOver <= 42 && hFP <= 5 && aFP <= 5) {
    advanced.push('Hem form puan\u0131 hem gol trendi d\u00fc\u015f\u00fck; kontroll\u00fc ba\u015flang\u0131\u00e7 ve d\u00fc\u015f\u00fck riskli oyun plan\u0131 daha olas\u0131.');
  } else if (Math.abs(hFP - aFP) >= 6 && avgOver <= 45) {
    const formSide = hFP > aFP ? home : away;
    advanced.push(formSide + ' formda \u00f6nde olsa da gol trendi d\u00fc\u015f\u00fck; avantaj daha \u00e7ok ma\u00e7 kontrol\u00fc \u00fczerinden okunmal\u0131.');
  }

  if (Math.abs(hFP - aFP) <= 2 && Math.abs(hAtk - aAtk) < 0.3 && Math.abs(hDef - aDef) < 0.3) {
    advanced.push('Riskin ana nedeni iki tak\u0131m\u0131n form, h\u00fccum ve savunma \u00e7izgisinin birbirine yak\u0131n olmas\u0131; net taraf yorumu zay\u0131fl\u0131yor.');
  } else if (weatherRisk) {
    advanced.push('Hava ko\u015fulu riski model g\u00fcvenini d\u00fc\u015f\u00fcr\u00fcyor; pas kalitesi ve oyun ritmi form verisinden sapabilir.');
  } else if (h2hCount < MIN_H2H) {
    advanced.push('H2H verisi az oldu\u011fu i\u00e7in tarihsel e\u015fle\u015fme yerine sezon/form metrikleri daha bask\u0131n kullan\u0131ld\u0131.');
  }

  // Extended stat signals
  const hClean = hSt.cleanSheetPct ?? null;
  const aClean = aSt.cleanSheetPct ?? null;
  const hFailed = hSt.failedToScorePct ?? null;
  const aFailed = aSt.failedToScorePct ?? null;
  const hWinStr = hSt.currentWinStreak ?? 0;
  const aWinStr = aSt.currentWinStreak ?? 0;
  const hUnbeat = hSt.currentUnbeatenStreak ?? 0;
  const aUnbeat = aSt.currentUnbeatenStreak ?? 0;

  if (hWinStr >= 3) advanced.push(`${home} son ${hWinStr} ma\u00e7\u0131 kazand\u0131 \u2014 form ivmesi y\u00fcksek.`);
  else if (hUnbeat >= 4) advanced.push(`${home} ${hUnbeat} ma\u00e7l\u0131k yenilmezlik serisiyle sahaya \u00e7\u0131k\u0131yor.`);
  if (aWinStr >= 3) advanced.push(`${away} son ${aWinStr} ma\u00e7\u0131 kazand\u0131 \u2014 deplasman formu dikkat \u00e7ekici.`);
  else if (aUnbeat >= 4) advanced.push(`${away} ${aUnbeat} ma\u00e7l\u0131k yenilmezlik serisiyle geliyor.`);

  if (hClean !== null && aClean !== null) {
    if (hClean >= 45 && aFailed !== null && aFailed >= 35) {
      advanced.push(`${home} kale s\u0131f\u0131r oran\u0131 y\u00fcksek (%${hClean}) ve ${away} gol bulmakta g\u00fc\u00e7l\u00fck ya\u015f\u0131yor (%${aFailed} gol atamad\u0131) \u2014 ev sahibi savunma bask\u0131s\u0131 kritik.`);
    } else if (aClean >= 45 && hFailed !== null && hFailed >= 35) {
      advanced.push(`${away} kale s\u0131f\u0131r oran\u0131 y\u00fcksek (%${aClean}) ve ${home} gol bulmakta zorlan\u0131yor (%${hFailed} gol atamad\u0131) \u2014 deplasman savunmas\u0131 bask\u0131 alt\u0131nda bile kale kapayabiliyor.`);
    }
  }

  const hFH = hSt.firstHalfGoalsAvg ?? null;
  const aFH = aSt.firstHalfGoalsAvg ?? null;
  if (hFH !== null && aFH !== null) {
    const avgFH = (hFH + aFH) / 2;
    const hSH = hSt.secondHalfGoalsAvg ?? 0;
    const aSH = aSt.secondHalfGoalsAvg ?? 0;
    const avgSH = (hSH + aSH) / 2;
    if (avgFH >= 1.2) advanced.push(`\u0130lk yar\u0131 gol ortalamas\u0131 y\u00fcksek (ort. ${avgFH.toFixed(1)}) \u2014 ma\u00e7 erken a\u00e7\u0131lmaya e\u011filimli.`);
    else if (avgSH > avgFH + 0.4) advanced.push(`\u0130kinci yar\u0131 gol yo\u011funlu\u011fu ilk yar\u0131dan belirgin y\u00fcksek \u2014 ma\u00e7\u0131n as\u0131l ritmi ikinci yar\u0131da k\u0131r\u0131labilir.`);
  }

  // H2H pattern analysis
  if (h2hItems && h2hItems.length >= MIN_H2H) {
    const h2hPattern = analyzeH2H(h2hItems);
    if (h2hPattern) {
      if (h2hPattern.over25Pct >= 65) advanced.push(`H2H tarihinde %${h2hPattern.over25Pct} oran\u0131nda 2.5 \u00fcst \u2014 bu e\u015fle\u015fme goll\u00fc ge\u00e7meye yatk\u0131n.`);
      else if (h2hPattern.over25Pct <= 35) advanced.push(`H2H tarihinde yaln\u0131zca %${h2hPattern.over25Pct} oran\u0131nda 2.5 \u00fcst \u2014 az goll\u00fc kar\u015f\u0131la\u015fma deseni var.`);
      if (h2hPattern.bttsPct >= 60) advanced.push(`H2H'de KG Var oran\u0131 %${h2hPattern.bttsPct} \u2014 iki taraf\u0131n da kale bulmak i\u00e7in tarihsel zemini var.`);
      if (h2hPattern.dominantSide === 'home' && h2hPattern.dominanceRate >= 55) {
        advanced.push(`H2H ge\u00e7mi\u015finde ev sahibi belirgin \u00fcst\u00fcnl\u00fck kurmu\u015f (%${h2hPattern.dominanceRate}).`);
      } else if (h2hPattern.dominantSide === 'away' && h2hPattern.dominanceRate >= 55) {
        advanced.push(`H2H ge\u00e7mi\u015finde deplasman tak\u0131m\u0131 \u00fcst\u00fcn gelme e\u011filiminde (%${h2hPattern.dominanceRate}).`);
      }
    }
  }

  const offset = hash % pool.length;
  const selected = [0, 1, 2].map(i => pool[(offset + i) % pool.length]);
  return [...new Set([...selected, ...advanced])].slice(0, 12);
}

export function buildScoutSummary(
  home: string,
  away: string,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  hFP: number,
  aFP: number,
  h2hCount: number,
  weatherRisk: boolean,
  hash: number,
  hTrend?: FormTrend | null,
  aTrend?: FormTrend | null,
): string {
  const signal = buildMatchSignalSnapshot(home, away, hSt, aSt, hFP, aFP);
  const {
    hAtk, aAtk, hDef, aDef, avgOver, avgKg,
    hHomeWin, aAwayWin, hHomePlayed, aAwayPlayed,
  } = signal;
  const totalSample = Math.min(hSt.total, aSt.total);
  const hMove = hTrend ? hTrend.pts5 - hTrend.ptsPrev : 0;
  const aMove = aTrend ? aTrend.pts5 - aTrend.ptsPrev : 0;
  const lines: string[] = [];

  if (signal.conflictText) {
    lines.push(signal.conflictText);
  }

  if (hAtk >= 1.7 && aAtk >= 1.7 && hDef >= 1.3 && aDef >= 1.3) {
    lines.push('İki takım da hücumda üretken ama savunmada açık veriyor. Bu nedenle maçın ana hikayesi taraf seçiminden çok tempo ve gol akışı olabilir.');
  }
  if (hAtk - aDef >= 0.45 && hFP >= aFP) {
    lines.push(home + ' i\u00e7in h\u00fccum e\u015fle\u015fmesi olumlu: kendi gol ortalamas\u0131, ' + away + ' savunmas\u0131n\u0131n verdi\u011fi ortalaman\u0131n \u00fczerinde kal\u0131yor. Ev sahibi \u00f6ne ge\u00e7erse ma\u00e7 kontrol\u00fcn\u00fc alabilir.');
  }
  if (aAtk - hDef >= 0.45 && aFP >= hFP) {
    lines.push(away + ' deplasmanda gol tehdidi ta\u015f\u0131yor; h\u00fccum \u00fcretimi ' + home + ' savunma verisiyle e\u015fle\u015fince ge\u00e7i\u015f oyunu ve ikinci toplar kritik hale geliyor.');
  }
  if (hDef <= 1.0 && aDef <= 1.0 && avgOver <= 45) {
    lines.push('Savunma verileri iki tarafta da güçlü ve gol trendi sınırlı. Bu tip maçlarda ilk hata, duran top veya sabır oyunu belirleyici olabilir.');
  }
  if (Math.abs(hFP - aFP) <= 2 && Math.abs(hAtk - aAtk) < 0.3 && Math.abs(hDef - aDef) < 0.3) {
    lines.push('Takımların form, hücum ve savunma çizgisi birbirine yakın. Net taraf sinyali zayıf; ilk gol ve oyun içi momentum daha belirleyici olabilir.');
  }
  if (hTrend && aTrend && Math.abs(hMove - aMove) >= 5) {
    const side = hMove > aMove ? home : away;
    lines.push(side + ' son dönemde daha güçlü bir ivme yakalamış görünüyor. Bu maçı sezon ortalamasından çok güncel form üzerinden okumak daha doğru.');
  }
  if (hHomeWin >= 60 && hHomePlayed >= 4 && aAwayWin <= 35 && aAwayPlayed >= 4) {
    lines.push(home + ' iç sahada daha güçlü, ' + away + ' ise deplasmanda daha kırılgan görünüyor. Ev sahibi avantajının veri desteği var.');
  } else if (aAwayWin >= 50 && aAwayPlayed >= 4) {
    lines.push(away + ' deplasman performansıyla oyunda kalabilecek bir profil çiziyor. Ev sahibi baskı kursa bile deplasmanın puan alma ihtimali masada.');
  }
  if (avgOver >= 60 && avgKg >= 55) {
    lines.push('Gol trendi ve karşılıklı skor verisi aynı yöne bakıyor. Bu tablo iki tarafın da skora katkı verme ihtimalini güçlendiriyor.');
  } else if (avgOver >= 60 && avgKg <= 45) {
    lines.push('Toplam gol beklentisi yüksek görünüyor ama karşılıklı gol aynı güçte desteklenmiyor. Gollü ama tek tarafın daha baskın olduğu bir maç da ihtimaller arasında.');
  } else if (avgOver <= 40 && avgKg >= 55) {
    lines.push('Toplam gol trendi düşük olsa da karşılıklı skor ihtimali tamamen kapanmıyor. 1-1 gibi dar skorlu ve dengeli bir senaryo hâlâ masada.');
  }

  const main = signal.conflictText || (lines.length > 0 ? lines[hash % lines.length] : 'Veriler tek bir yöne sert biçimde akmıyor. Form, gol profili ve savunma dengesi birlikte düşünüldüğünde maçın kırılma anı büyük olasılıkla ilk gol veya tempo değişimi olacak.');
  const outlook: string[] = [];

  if (totalSample < 6) {
    outlook.push('Veri örneklemi sınırlı olduğu için yüzdeleri kesin sonuç gibi değil, olası maç senaryoları gibi okumak daha doğru.');
  } else if (avgOver >= 58 && avgKg >= 55) {
    outlook.push('Genel beklenti: iki tarafın da skora katkı verebildiği hareketli bir maç.');
  } else if (avgOver <= 42) {
    outlook.push('Genel beklenti: sabırlı başlangıç ve düşük tempolu skor akışı.');
  } else if (Math.abs(hFP - aFP) <= 2) {
    outlook.push('Genel beklenti: dengeli oyun, ilk golün psikolojik etkisi ve ikinci yarı ayarları.');
  } else {
    const side = hFP > aFP ? home : away;
    outlook.push('Genel beklenti: ' + side + ' form avantajını oyun kontrolüne çevirebilirse maçı kendi ritmine alabilir.');
  }
  if (weatherRisk) {
    outlook.push('Hava ko\u015fulu riski pas kalitesi ve ritimde sapma yaratabilir.');
  }

  return main + ' ' + outlook.slice(0, 2).join(' ');
}

export function buildScoutPick(
  home: string,
  away: string,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  hFP: number,
  aFP: number,
  h2hCount: number,
  weatherRisk: boolean,
): ScoutPick {
  const signal = buildMatchSignalSnapshot(home, away, hSt, aSt, hFP, aFP);
  const { hAtk, aAtk, hDef, aDef, avgOver, avgKg, homeEdge, awayEdge } = signal;
  const sample = Math.min(hSt.total, aSt.total);
  const lowConfidence = sample < 5 || weatherRisk;
  const sideGap = Math.abs(homeEdge - awayEdge);
  const overLabel = Math.round(avgOver);
  const kgLabel = Math.round(avgKg);
  const attackTotal = hAtk + aAtk;
  const defensiveLoad = hDef + aDef;
  const goalSignal = (avgOver >= 62 ? 2 : avgOver >= 56 ? 1 : 0) +
    (avgKg >= 58 ? 1 : 0) +
    (attackTotal >= 3.0 ? 2 : attackTotal >= 2.55 ? 1 : 0) +
    (defensiveLoad >= 2.8 ? 1 : 0);
  const lowGoalSignal = (avgOver <= 38 ? 2 : avgOver <= 44 ? 1 : 0) +
    (attackTotal <= 2.15 ? 2 : attackTotal <= 2.45 ? 1 : 0) +
    (defensiveLoad <= 2.1 ? 1 : 0);
  const bothScoreSignal = avgKg >= 55 && hAtk >= 1.2 && aAtk >= 1.2;
  const conflictPhrase = signal.conflict
    ? 'Taraf verileri iki yöne bölündüğü için kazanan seçimi temkin istiyor.'
    : '';

  if (signal.conflict && sideGap < 14) {
    if (goalSignal >= 3) {
      return {
        label: bothScoreSignal ? 'Karşılıklı gol beklenir' : '2.5 üst ihtimali önde',
        detail: bothScoreSignal
          ? `Taraf avantajı net değil; iki takımın gol üretimi ve KG Var trendi daha okunur sinyal veriyor.`
          : `Kazanan taraf ayrışmıyor; buna karşılık hücum ve 2.5 üst verisi gollü maç ihtimalini destekliyor.`,
        cardComment: bothScoreSignal
          ? `Taraf dengeli, iki takımın gol katkısı daha güçlü sinyal veriyor.`
          : `Taraf seçimi zor; gol verisi 2.5 üst tarafını öne çıkarıyor.`,
        tone: 'goals',
      };
    }
    if (lowGoalSignal >= 3) {
      return {
        label: '2.5 alt daha yakın',
        detail: `Taraf verileri karışık ve gol üretimi yüksek skoru desteklemiyor. Bu profil kontrollü skor tarafına daha yakın.`,
        cardComment: `Taraf sinyali karışık; düşük skor verisi daha güvenli okunuyor.`,
        tone: 'draw',
      };
    }
    return homeEdge >= awayEdge ? {
      label: `${home} kaybetmez`,
      detail: `Taraf sinyalleri iki yöne bölünüyor; net kazanan seçimi güç. ${home} iç saha desteğiyle oyunda kalma ihtimali hafif öne çıkıyor.`,
      cardComment: `Taraf dengeli; ${home} iç saha avantajıyla minimal öne alındı.`,
      tone: 'home',
    } : {
      label: `${away} kaybetmez`,
      detail: `Taraf sinyalleri iki yöne bölünüyor; net kazanan seçimi güç. ${away} deplasman verisiyle puan alma ihtimali hafif öne çıkıyor.`,
      cardComment: `Taraf dengeli; ${away} deplasmanı minimal öne alındı.`,
      tone: 'away',
    };
  }

  if (lowConfidence) {
    if (weatherRisk && sample < 5 && goalSignal < 4 && lowGoalSignal < 4) {
      return homeEdge >= awayEdge ? {
        label: `${home} kaybetmez`,
        detail: `Veri örneklemi sınırlı ve hava koşulu riski var. Bu koşulda ${home} iç saha desteğiyle oyunda kalma seçimi en dengeli görünen.`,
        cardComment: `Sınırlı veri + hava riski; ${home} iç saha avantajıyla öne alındı.`,
        tone: 'home',
      } : {
        label: `${away} kaybetmez`,
        detail: `Veri örneklemi sınırlı ve hava koşulu riski var. Bu koşulda ${away} deplasmanının puan alma ihtimali en dengeli seçenek.`,
        cardComment: `Sınırlı veri + hava riski; ${away} deplasmanı öne alındı.`,
        tone: 'away',
      };
    }
    if (goalSignal >= 3) {
      return {
        label: bothScoreSignal ? 'Karşılıklı gol beklenir' : '2.5 üst ihtimali önde',
        detail: bothScoreSignal
          ? `Veri örneklemi sınırlı olsa da iki takımın gol üretimi karşılıklı skor ihtimalini destekliyor.`
          : `Veri güveni sınırlı; yine de hücum üretimi ve 2.5 üst trendi düşük skor yerine gollü maç ihtimalini öne çıkarıyor.`,
        cardComment: bothScoreSignal
          ? `Sınırlı veride iki tarafın gol katkısı öne çıkıyor.`
          : `Veri sınırlı ama gol üretimi 2.5 üst ihtimalini destekliyor.`,
        tone: 'goals',
      };
    }
    if (lowGoalSignal >= 3) {
      return {
        label: '2.5 alt daha yakın',
        detail: `Veri güveni sınırlı olsa da hücum ve 2.5 üst trendi düşük kalıyor. Kontrollü skor tarafı daha mantıklı.`,
        cardComment: `Gol verisi düşük; kontrollü skor ihtimali önde.`,
        tone: 'draw',
      };
    }
    if (homeEdge >= awayEdge + 3) {
      return {
        label: `${home} kaybetmez`,
        detail: `${home} tarafında hafif üstünlük var, fakat veri güveni doğrudan galibiyet için yeterince güçlü değil. Kaybetmeme seçimi daha dengeli.`,
        cardComment: `${home} tarafı hafif önde; kaybetmeme daha dengeli seçim.`,
        tone: 'home',
      };
    }
    if (awayEdge >= homeEdge + 3) {
      return {
        label: `${away} kaybetmez`,
        detail: `${away} tarafında oyunda kalma sinyali var. Veri sınırlı olduğu için doğrudan galibiyet yerine kaybetmeme seçimi daha dengeli.`,
        cardComment: `${away} oyunda kalma sinyali veriyor; kaybetmeme daha güvenli.`,
        tone: 'away',
      };
    }
    if (avgKg >= 52) {
      return {
        label: 'Karşılıklı gol beklenir',
        detail: `İki takımın da gol bulma alışkanlığı var. Kazanan taraftan çok iki ekibin skor katkısı daha anlamlı sinyal veriyor.`,
        cardComment: `İki takımın gol bulma eğilimi taraf seçiminden daha güçlü.`,
        tone: 'goals',
      };
    }
    return homeEdge >= awayEdge ? {
      label: `${home} kaybetmez`,
      detail: `Veri sinyalleri net yöne kopmuyor. ${home} iç saha desteğiyle oyunda kalma seçimi bu profilde en dengeli görünen.`,
      cardComment: `Sinyal yok; ${home} iç saha desteğiyle minimal öne alındı.`,
      tone: 'home',
    } : {
      label: `${away} kaybetmez`,
      detail: `Veri sinyalleri net yöne kopmuyor. ${away} deplasmanının puan alma potansiyeli bu profilde en dengeli seçenek.`,
      cardComment: `Sinyal yok; ${away} deplasmanı minimal öne alındı.`,
      tone: 'away',
    };
  }

  if (bothScoreSignal && goalSignal >= 4) {
    return {
      label: 'Karşılıklı gol beklenir',
      detail: `İki takımın gol üretimi, KG Var trendi (%${kgLabel}) ve savunma eşleşmesi iki tarafın da skor bulma ihtimalini destekliyor.`,
      cardComment: `Hücum ve KG Var verisi iki takımın da gol bulabileceğini gösteriyor.`,
      tone: 'goals',
    };
  }

  if (goalSignal >= 4 && sideGap < 16) {
    return {
      label: '2.5 üst ihtimali önde',
      detail: `Taraf farkı belirgin değil; toplam hücum üretimi (${attackTotal.toFixed(1)}) ve 2.5 üst trendi (%${overLabel}) düşük skor yerine gollü maç senaryosunu destekliyor.`,
      cardComment: `Gol üretimi ve 2.5 üst trendi gollü maç tarafını destekliyor.`,
      tone: 'goals',
    };
  }

  if (lowGoalSignal >= 4) {
    return {
      label: '2.5 alt daha yakın',
      detail: `Hücum üretimi ve 2.5 üst trendi düşük kalıyor. Maçın kontrollü ilerleme ve dar skor üretme ihtimali daha güçlü.`,
      cardComment: `Hücum ve gol trendi düşük; dar skor ihtimali önde.`,
      tone: 'draw',
    };
  }

  if (avgOver <= 42 && Math.abs(hFP - aFP) <= 3) {
    return {
      label: 'Düşük skorlu maç beklenir',
      detail: 'Form farkı sınırlı ve gol trendi düşük. Beraberlik veya tek farkla bitecek kontrollü maç senaryosu daha mantıklı.',
      cardComment: `Form yakın, gol trendi düşük; kontrollü maç profili öne çıkıyor.`,
      tone: 'draw',
    };
  }

  if (goalSignal >= 3 && sideGap < 14) {
    return {
      label: '2.5 üst ihtimali önde',
      detail: `Taraf farkı sınırlı, buna karşılık hücum üretimi ve gol trendi skorlu maç ihtimalini daha güçlü gösteriyor.`,
      cardComment: `Taraf farkı sınırlı; gol verisi 2.5 üst tarafına yaklaştırıyor.`,
      tone: 'goals',
    };
  }

  if (homeEdge >= awayEdge + 12) {
    if (signal.conflictText) {
      return {
        label: `${home} kaybetmez`,
        detail: `${away} bazı verilerde direnç gösterse de toplam form, iç saha etkisi ve hücum-savunma eşleşmesi ${home} tarafını öne taşıyor. Bu nedenle kaybetmeme daha dengeli seçim.`,
        cardComment: `${home} avantajlı, ancak karşı sinyaller nedeniyle kaybetmeme daha sağlıklı.`,
        tone: 'home',
      };
    }
    return {
      label: `${home} galibiyete yakın`,
      detail: `${home} tarafında form, iç saha ve hücum-savunma eşleşmesi belirgin üstün. Maç kontrolü ev sahibine daha yakın görünüyor.`,
      cardComment: `${home} form ve eşleşme verilerinde belirgin üstünlük taşıyor.`,
      tone: 'home',
    };
  }
  if (awayEdge >= homeEdge + 12) {
    if (signal.conflictText) {
      return {
        label: `${away} kaybetmez`,
        detail: `${home} bazı verilerde direnç gösterse de son form ve deplasman gol tehdidi ${away} tarafını öne taşıyor. Bu nedenle kaybetmeme daha dengeli seçim.`,
        cardComment: `${away} avantajlı, ancak deplasman riski nedeniyle kaybetmeme daha sağlıklı.`,
        tone: 'away',
      };
    }
    return {
      label: `${away} galibiyete yakın`,
      detail: `${away} form ve deplasman üretimiyle net sinyal veriyor. Deplasman riskine rağmen galibiyet tarafı veriyle destekleniyor.`,
      cardComment: `${away} form ve deplasman üretiminde daha güçlü görünüyor.`,
      tone: 'away',
    };
  }
  if (homeEdge >= awayEdge + 4) {
    return {
      label: `${home} kaybetmez`,
      detail: `${home} tarafı hafif önde. Fark galibiyet için yeterince güçlü değil; kaybetmeme seçimi daha mantıklı.${conflictPhrase ? ` ${conflictPhrase}` : ''}`,
      cardComment: `${home} hafif önde; kaybetmeme seçimi daha dengeli.`,
      tone: 'home',
    };
  }
  if (awayEdge >= homeEdge + 4) {
    return {
      label: `${away} kaybetmez`,
      detail: `${away} tarafı hafif önde. Fark galibiyet için yeterince güçlü değil; kaybetmeme seçimi daha mantıklı.${conflictPhrase ? ` ${conflictPhrase}` : ''}`,
      cardComment: `${away} hafif önde; kaybetmeme seçimi daha dengeli.`,
      tone: 'away',
    };
  }

  return homeEdge >= awayEdge ? {
    label: `${home} kaybetmez`,
    detail: `Veriler net bir yöne kopmuyor. ${home} iç saha desteğiyle oyunda kalma seçimi bu profilde en dengeli görünen.${conflictPhrase ? ` ${conflictPhrase}` : ''}`,
    cardComment: `Sinyal net değil; ${home} iç saha avantajıyla öne alındı.`,
    tone: 'home',
  } : {
    label: `${away} kaybetmez`,
    detail: `Veriler net bir yöne kopmuyor. ${away} deplasmanının puan alma potansiyeli bu profilde en dengeli seçenek.${conflictPhrase ? ` ${conflictPhrase}` : ''}`,
    cardComment: `Sinyal net değil; ${away} deplasmanı öne alındı.`,
    tone: 'away',
  };
}

export function buildScoutSummaryFromPick(
  home: string,
  away: string,
  pick: ScoutPick,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  hFP: number,
  aFP: number,
  weatherRisk: boolean,
): string {
  const signal = buildMatchSignalSnapshot(home, away, hSt, aSt, hFP, aFP);
  const overLabel = Math.round(signal.avgOver);
  const kgLabel = Math.round(signal.avgKg);
  const sample = Math.min(hSt.total, aSt.total);
  const formClose = Math.abs(hFP - aFP) <= 2;
  const formLeader = hFP > aFP ? home : away;
  const homeAttackEdge = signal.hAtk - signal.aDef;
  const awayAttackEdge = signal.aAtk - signal.hDef;
  const hasHomeVenueEdge = signal.hHomePlayed >= 4 && signal.hHomeWin >= 55;
  const hasAwayVenueEdge = signal.aAwayPlayed >= 4 && signal.aAwayWin >= 45;
  const formNote = formClose
    ? 'Form tarafı net bir üstünlük üretmiyor; bu yüzden maçın yönünü ilk gol ve oyun içi reaksiyonlar belirleyebilir.'
    : `${formLeader} son formda daha iyi görünse de, bu farkı maç kontrolüne çevirmesi gerekiyor.`;
  const venueNote = hasHomeVenueEdge && hasAwayVenueEdge
    ? `${home} iç saha etkisiyle, ${away} ise deplasmanda oyunda kalma becerisiyle denge kuruyor.`
    : hasHomeVenueEdge
      ? `${home} için saha avantajı maçın kontrol bölümünde değerli bir destek sağlıyor.`
      : hasAwayVenueEdge
        ? `${away} deplasmanda tamamen edilgen kalmayan bir profil çiziyor.`
        : '';
  const matchupNote = homeAttackEdge >= 0.45 && awayAttackEdge < 0.25
    ? `${home} hücum-savunma eşleşmesinde daha rahat alan bulabilecek taraf gibi duruyor.`
    : awayAttackEdge >= 0.45 && homeAttackEdge < 0.25
      ? `${away} geçişlerde ve deplasman gol tehdidinde daha dikkat çekici görünüyor.`
      : homeAttackEdge >= 0.35 && awayAttackEdge >= 0.35
        ? 'İki tarafın hücum eşleşmesi de rakip savunmalar üzerinde baskı kurabilecek seviyede.'
        : homeAttackEdge <= -0.2 && awayAttackEdge <= -0.2
          ? 'Hücum-savunma eşleşmesi iki taraf için de kolay pozisyon vadetmiyor.'
          : 'Hücum-savunma dengesi tek başına maçı koparacak kadar keskin değil.';
  const goalContext = overLabel >= 58
    ? `Gol tarafında 2.5 üst trendi %${overLabel} seviyesinde; bu veri maçın tamamen kapanma ihtimalini azaltıyor.`
    : overLabel <= 42
      ? `Gol tarafında 2.5 üst trendi %${overLabel} seviyesinde kalıyor; bu da kontrollü skor ihtimalini güçlendiriyor.`
      : `Gol verisi orta bölgede; bu yüzden tempo kadar bitiricilik kalitesi de belirleyici olacak.`;
  const bttsContext = kgLabel >= 58
    ? 'Karşılıklı gol eğilimi de iki tarafın skor katkısını destekliyor.'
    : kgLabel <= 45
      ? 'Karşılıklı gol eğilimi aynı ölçüde güçlü değil; skor tek taraflı da açılabilir.'
      : '';
  const conflictNote = signal.conflictText
    ? ` Çelişki tarafında ise ${signal.conflictText.charAt(0).toLowerCase()}${signal.conflictText.slice(1)}`
    : '';
  const sampleNote = sample < 6 ? ' Veri örneklemi sınırlı olduğu için agresif yorumdan kaçınmak gerekiyor.' : '';
  const weatherNote = weatherRisk ? ' Hava koşulu ritmi bozabileceği için risk artıyor.' : '';

  // Extended stat notes
  const hWinStr = hSt.currentWinStreak ?? 0;
  const aWinStr = aSt.currentWinStreak ?? 0;
  const hUnbeat = hSt.currentUnbeatenStreak ?? 0;
  const aUnbeat = aSt.currentUnbeatenStreak ?? 0;
  let streakNote = '';
  if (hWinStr >= 3) streakNote = ` ${home} son ${hWinStr} maçı kazanarak bu fikstüre yüksek ivmeyle girdi.`;
  else if (aWinStr >= 3) streakNote = ` ${away} son ${aWinStr} maçı kazanarak geldiği için deplasman baskısı formuyla destekleniyor.`;
  else if (hUnbeat >= 4) streakNote = ` ${home}'nin ${hUnbeat} maçlık yenilmezlik serisi, savunma istikrarını da yansıtıyor.`;
  else if (aUnbeat >= 4) streakNote = ` ${away}'nin ${aUnbeat} maçlık yenilmezlik serisi, rakibinin temkinli oynamasını gerektirebilir.`;

  const hClean = hSt.cleanSheetPct ?? 0;
  const aClean = aSt.cleanSheetPct ?? 0;
  const hFailed = hSt.failedToScorePct ?? 0;
  const aFailed = aSt.failedToScorePct ?? 0;
  let cleanNote = '';
  if (hClean >= 45 && aFailed >= 35) cleanNote = ` ${home} savunması %${hClean} kale sıfır oranıyla, ${away}'ın %${aFailed} gol atama güçlüğüyle birleşince ev sahibi defans baskısı öne çıkıyor.`;
  else if (aClean >= 45 && hFailed >= 35) cleanNote = ` ${away} savunması %${aClean} kale sıfır oranıyla, ${home}'ın gol bulma güçlüğüyle (%${hFailed}) eşleşiyor — deplasman geriden oynamayı seçse bile kaleyi tutabilir.`;

  const hFH = hSt.firstHalfGoalsAvg ?? null;
  const aFH = aSt.firstHalfGoalsAvg ?? null;
  let halfTimeNote = '';
  if (hFH !== null && aFH !== null) {
    const avgFH = (hFH + aFH) / 2;
    const avgSH = ((hSt.secondHalfGoalsAvg ?? 0) + (aSt.secondHalfGoalsAvg ?? 0)) / 2;
    if (avgFH >= 1.2) halfTimeNote = ` İlk yarı gol ortalaması yüksek (${avgFH.toFixed(1)}) — maçın tablo erken kırılabilir.`;
    else if (avgSH > avgFH + 0.4) halfTimeNote = ` İkinci yarı gol akışı ilk yarıdan belirgin daha yoğun; tempo değişimi ikinci yarıda beklenmeli.`;
  }

  if (pick.tone === 'goals') {
    const main = pick.label.includes('Karşılıklı')
      ? `Scout özeti bu maçta iki takımın da gol bulma ihtimalini öne çıkarıyor. ${matchupNote} ${bttsContext || goalContext} Bu nedenle kazanan seçmekten çok iki ekibin skor katkısına odaklanmak daha mantıklı.`
      : `Scout özeti bu maçta gollü maç tarafını daha güçlü görüyor. ${matchupNote} ${goalContext} Taraf avantajı sınırlı kaldığı için analiz, kazanan yerine skor üretimine yaslanıyor.`;
    return `${main} ${formNote}${venueNote ? ` ${venueNote}` : ''}${halfTimeNote}${conflictNote}${sampleNote}${weatherNote}`;
  }

  if (pick.tone === 'draw') {
    return `Scout özeti bu maçta düşük skor tarafını daha mantıklı görüyor. ${matchupNote} ${goalContext} Oyun kolay açılmazsa ilk gol, duran top veya geçiş anları maçın ana kırılma noktası olabilir. ${formNote}${venueNote ? ` ${venueNote}` : ''}${cleanNote}${conflictNote}${sampleNote}${weatherNote}`;
  }

  if (pick.tone === 'home') {
    const side = pick.label.includes('galibiyete') ? 'galibiyet' : 'kaybetmeme';
    return `Scout özeti ${home} tarafını ${side} senaryosunda öne çıkarıyor. ${matchupNote} ${formNote} Ev sahibi tarafı oyunu kendi ritmine çekebilirse maç kontrolü daha çok ${home} tarafına yaklaşır.${venueNote ? ` ${venueNote}` : ''}${streakNote}${cleanNote}${halfTimeNote}${conflictNote}${sampleNote}${weatherNote}`;
  }

  if (pick.tone === 'away') {
    const side = pick.label.includes('galibiyete') ? 'galibiyet' : 'kaybetmeme';
    return `Scout özeti ${away} tarafını ${side} senaryosunda öne çıkarıyor. ${matchupNote} ${formNote} Deplasman ekibinin oyunda kalma ve skor tehdidi, maçı tek taraflı ev sahibi üstünlüğü olarak okumayı zorlaştırıyor.${venueNote ? ` ${venueNote}` : ''}${streakNote}${cleanNote}${halfTimeNote}${conflictNote}${sampleNote}${weatherNote}`;
  }

  return `Scout özeti bu maçta net bir yöne güçlü kırılım görmüyor. ${matchupNote} ${goalContext} ${formNote} Bu yüzden taraf veya gol seçimini zorlamak yerine risk seviyesini yüksek okumak daha doğru.${venueNote ? ` ${venueNote}` : ''}${streakNote}${conflictNote}${sampleNote}${weatherNote}`;
}

export function buildMatchCharacterDetail(
  home: string,
  away: string,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  hFP: number,
  aFP: number,
  hash: number,
  hStyleLabel?: string,
  aStyleLabel?: string,
  hTrend?: FormTrend | null,
  aTrend?: FormTrend | null,
): string {
  const hAtk = parseFloat(hSt.totalAvgGf as string);
  const aAtk = parseFloat(aSt.totalAvgGf as string);
  const hDef = parseFloat(hSt.totalAvgGa as string);
  const aDef = parseFloat(aSt.totalAvgGa as string);
  const avgOver = (hSt.over25Pct + aSt.over25Pct) / 2;
  const avgKg = (hSt.kgVarPct + aSt.kgVarPct) / 2;
  const hHomeWin = hSt.homeWinPct ?? 0;
  const aAwayWin = aSt.awayWinPct ?? 0;
  const hMove = hTrend ? hTrend.pts5 - hTrend.ptsPrev : 0;
  const aMove = aTrend ? aTrend.pts5 - aTrend.ptsPrev : 0;
  const candidates: string[] = [];

  if (hStyleLabel && aStyleLabel && hStyleLabel !== aStyleLabel) {
    candidates.push(home + ' daha ' + hStyleLabel.toLowerCase() + ' bir profil verirken ' + away + ' ' + aStyleLabel.toLowerCase() + ' tarafta kal\u0131yor. Bu fark, ma\u00e7\u0131n ritmini kimin kendi oyununa \u00e7ekece\u011fini belirleyebilir.');
  } else if (hStyleLabel && aStyleLabel) {
    candidates.push('\u0130ki tak\u0131m da benzer bir ' + hStyleLabel.toLowerCase() + ' profil \u00e7iziyor. Bu durumda karakter fark\u0131ndan \u00e7ok uygulama kalitesi ve ilk gol\u00fcn zaman\u0131 belirleyici olur.');
  }

  if (hAtk >= 1.6 && aDef >= 1.4 && aAtk < 1.5) {
    candidates.push(home + ' oyunu rakip yar\u0131 alana y\u0131kabilecek veriye sahip. ' + away + ' savunmas\u0131 bask\u0131 alt\u0131nda fazla alan verirse ma\u00e7 karakteri ev sahibi kontrol\u00fcne d\u00f6nebilir.');
  }
  if (aAtk >= 1.6 && hDef >= 1.4 && hAtk < 1.5) {
    candidates.push(away + ' ge\u00e7i\u015f ve bitiricilik taraf\u0131nda tehdit \u00fcretiyor. ' + home + ' topa sahip olsa bile savunma arkas\u0131 ko\u015fular ma\u00e7\u0131n karakterini de\u011fi\u015ftirebilir.');
  }
  if (hDef <= 1.0 && aDef <= 1.0 && avgOver <= 45) {
    candidates.push('Bu e\u015fle\u015fme savunma disiplini \u00fczerinden okunuyor. \u0130ki taraf da kolay alan vermedi\u011fi i\u00e7in ma\u00e7\u0131n karakteri sab\u0131r, duran top ve ikinci top m\u00fccadelesine yak\u0131n.');
  }
  if (hAtk >= 1.7 && aAtk >= 1.7 && avgKg >= 55) {
    candidates.push('H\u00fccum profilleri birbirini besliyor: iki taraf da skor \u00fcretme kapasitesine sahip. Bu nedenle ma\u00e7 karakteri kapal\u0131 bir bekleyi\u015ften \u00e7ok kar\u015f\u0131l\u0131kl\u0131 cevaplara a\u00e7\u0131k.');
  }
  if (avgOver >= 60 && avgKg <= 45) {
    candidates.push('Gol hacmi y\u00fcksek g\u00f6r\u00fcnse de iki taraf\u0131n da skora ortak olaca\u011f\u0131 garanti de\u011fil. Karakter olarak tek taraf\u0131n bask\u0131nla\u015ft\u0131\u011f\u0131, kopmaya a\u00e7\u0131k bir oyun ihtimali var.');
  }
  if (Math.abs(hFP - aFP) <= 2 && Math.abs(hAtk - aAtk) < 0.3) {
    candidates.push('Form ve h\u00fccum seviyesi yak\u0131n oldu\u011fu i\u00e7in ma\u00e7 karakteri dengeli kalmaya yatk\u0131n. Bu tabloda tempo k\u0131r\u0131lmas\u0131 genellikle bireysel hata veya erken golle gelir.');
  }
  if (Math.abs(hMove - aMove) >= 5) {
    const side = hMove > aMove ? home : away;
    candidates.push(side + ' g\u00fcncel ivme taraf\u0131nda daha diri. Bu, sezon ortalamas\u0131ndan ba\u011f\u0131ms\u0131z olarak ma\u00e7\u0131n psikolojik ve fiziksel ritmini etkileyebilir.');
  }
  if (hHomeWin >= 60 && aAwayWin <= 35) {
    candidates.push(home + ' i\u00e7 saha etkisiyle daha bask\u0131n ba\u015flamaya aday. ' + away + ' ilk b\u00f6l\u00fcm\u00fc hasars\u0131z ge\u00e7erse oyun dengesi daha kontroll\u00fc hale gelebilir.');
  } else if (aAwayWin >= 50) {
    candidates.push(away + ' deplasmanda kolay da\u011f\u0131lan bir profil de\u011fil. Bu nedenle ma\u00e7 karakteri ev sahibi bask\u0131s\u0131na kar\u015f\u0131 diren\u00e7 ve ge\u00e7i\u015f tehdidi \u00fczerinden \u015fekillenebilir.');
  }

  if (candidates.length === 0) {
    return 'Ma\u00e7 karakteri tek bir uca yaslanm\u0131yor. Tak\u0131mlar\u0131n form ve profil verileri dengeli oldu\u011fu i\u00e7in oyun ak\u0131\u015f\u0131n\u0131 ilk gol, tempo tercihi ve savunma konsantrasyonu belirleyecek.';
  }
  return candidates[hash % candidates.length];
}


export function getGuven(
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  h2hCount: number,
  weatherRisk: boolean,
): Level {
  let s = 0;
  if (hSt.total >= 7) s++;
  if (aSt.total >= 7) s++;
  if (h2hCount >= MIN_H2H) s++;
  if (!weatherRisk)   s++;
  if (s >= 4) return 'Yüksek';
  if (s >= 2) return 'Orta';
  return 'Düşük';
}

export function getWeatherComment(weatherData: WeatherData | null): { impact: Level; sentence: string } {
  if (!weatherData) return { impact: 'Düşük', sentence: 'Hava durumu verisi alınamadı.' };
  const t = weatherData.temp ?? 15;
  const w = weatherData.wind ?? 0;
  const cond = (weatherData.condition || '').toLowerCase();
  const rain = /rain|shower|drizzle|yağ/.test(cond);
  if (rain || w > 35) return {
    impact: 'Yüksek',
    sentence: 'Yağış veya güçlü rüzgar pas kalitesini ve şut isabetini düşürebilir; kontrollü oyun ve duran toplar öne çıkar.',
  };
  if (t > 28 || t < 5 || w > 22) return {
    impact: 'Orta',
    sentence: 'Hava koşulları oyunun temposunu zaman zaman etkileyebilir; özellikle ikinci yarıda fiziksel düşüş görülebilir.',
  };
  return {
    impact: 'Düşük',
    sentence: 'Hava koşulları futbol için uygun; maç karakterini belirleyecek ana unsur takım formu olacak.',
  };
}

export function isWeatherRisk(weatherData: WeatherData | null): boolean {
  if (!weatherData) return false;
  const wind = weatherData.wind ?? 0;
  const condition = (weatherData.condition || '').toLowerCase();
  return wind > 35 || /rain|shower|drizzle|yağ/.test(condition);
}

type CompareStats = {
  totalAvgGf: string | number;
  totalAvgGa: string | number;
};

export function getCompareComment(
  hSt: CompareStats,
  aSt: CompareStats,
  home: string,
  away: string,
): string {
  const hAtk = parseFloat(String(hSt.totalAvgGf));
  const aAtk = parseFloat(String(aSt.totalAvgGf));
  const hDef = parseFloat(String(hSt.totalAvgGa));
  const aDef = parseFloat(String(aSt.totalAvgGa));
  const atkLead = hAtk > aAtk + 0.3 ? home : aAtk > hAtk + 0.3 ? away : null;
  const defLead = hDef < aDef - 0.25 ? home : aDef < hDef - 0.25 ? away : null;

  if (atkLead && defLead && atkLead === defLead) {
    return `${atkLead} hem hücumda hem savunmada önde; istatistiksel açıdan belirgin üstünlük var.`;
  }
  if (atkLead && defLead && atkLead !== defLead) {
    return `${atkLead} hücumda daha üretken, ${defLead} savunmada daha sağlam; dengeli bir güç dağılımı.`;
  }
  if (atkLead) return `${atkLead} gol üretiminde öne çıkıyor; savunmada fark belirgin değil.`;
  if (defLead) return `${defLead} savunmada daha sağlam; hücum üretiminde belirgin fark yok.`;
  return 'Hücum ve savunma metrikleri her iki takım için birbirine yakın; belirgin istatistiksel üstünlük görünmüyor.';
}

type RiskWarningStats = {
  total: number;
};

type RiskWarningAnalysis = {
  guven: Level;
  risk: Level;
};

export function getRiskWarnings(
  hSt: RiskWarningStats,
  aSt: RiskWarningStats,
  h2hCount: number,
  analysis: RiskWarningAnalysis,
  h2hMin = 3,
): string[] {
  const warnings: string[] = [];
  if (hSt.total < 5) warnings.push(`Ev sahibi için sınırlı veri (${hSt.total} maç) — yüzdeler yanıltıcı olabilir.`);
  if (aSt.total < 5) warnings.push(`Deplasman için sınırlı veri (${aSt.total} maç) — yüzdeler yanıltıcı olabilir.`);
  if (h2hCount < h2hMin) warnings.push('H2H geçmişi yetersiz — doğrudan karşılaşma verisi az.');
  if (analysis.guven === 'Düşük') warnings.push('Veri güveni düşük — tahminler genel eğilimlere dayanıyor.');
  if (analysis.risk === 'Yüksek') warnings.push('Form verileri değişken — bu tür maçlarda sürpriz sık görülür.');
  if (warnings.length === 0) warnings.push('Belirgin bir veri riski tespit edilmedi; analiz güvenilir tablo sunuyor.');
  return warnings;
}

// ── New helper functions ────────────────────────────────────────────────────

// Home / Away split narrative
export function getHomeAwayComment(
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  home: string,
  away: string,
): string {
  const hHomeWin = hSt.homeWinPct ?? 0;
  const aAwayWin = aSt.awayWinPct ?? 0;
  const hTotal   = hSt.totalWinPct ?? 0;
  const homeAdv  = hHomeWin - hTotal;

  if (hHomeWin >= 65 && aAwayWin <= 28) {
    return `${home} kendi sahasında son derece güçlü (%${hHomeWin} iç saha galibiyet); ${away} ise deplasmanlarını zorlu geçiriyor (%${aAwayWin}). İç saha avantajı bu maçta belirleyici rol üstlenebilir.`;
  }
  if (hHomeWin >= 65) {
    return `${home} iç sahada belirgin üstünlük sağlıyor (%${hHomeWin} galibiyet). Kendi tribününde oynamak onlar için ciddi bir güç kaynağı.`;
  }
  if (homeAdv >= 20) {
    return `${home} genel ortalamaya (%${hTotal}) kıyasla iç sahada çok daha başarılı (%${hHomeWin}). Seyirci desteği performansı belirgin şekilde yukarı çekiyor.`;
  }
  if (aAwayWin >= 50) {
    return `${away} deplasmanlarını güçlü yönetiyor (%${aAwayWin} galibiyet). Deplasman baskısını nötralize edebilecek kapasitede.`;
  }
  if (hHomeWin <= 30 && aAwayWin <= 30) {
    return 'Her iki takım da ev/deplasman ayrımı gözetmeksizin düşük kazanma oranlarına sahip; iç saha avantajı bu maçta belirleyici olmayabilir.';
  }
  return `İç saha / deplasman performansları dengeli: ${home} %${hHomeWin} iç saha, ${away} %${aAwayWin} deplasman galibiyet oranıyla geliyor.`;
}

// Form trend: last 5 vs prior 5 matches
export function getFormTrend(
  matches: FDMatch[],
  teamId: number,
): FormTrend | null {
  const finished = [...matches.filter(m => m.score?.fullTime?.home != null)].sort(
    (a, b) => new Date(a.utcDate ?? 0).getTime() - new Date(b.utcDate ?? 0).getTime(),
  );
  if (finished.length < 6) return null;

  const recent5  = finished.slice(-5);
  const prev5    = finished.slice(-10, -5);

  const calcPts = (ms: FDMatch[]) => ms.reduce((pts: number, m) => {
    const isHome = m.homeTeam?.id === teamId;
    const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    return pts + (gf != null && ga != null ? (gf > ga ? 3 : gf === ga ? 1 : 0) : 0);
  }, 0);

  const pts5    = calcPts(recent5);
  const ptsPrev = prev5.length > 0 ? calcPts(prev5) : pts5;
  const diff    = pts5 - ptsPrev;

  return {
    direction: diff >= 3 ? 'up' : diff <= -3 ? 'down' : 'stable',
    pts5,
    ptsPrev,
  };
}

function getSeasonTotalMatches(totalTeams?: number, leagueApiId?: number): number | null {
  if (leagueApiId === 2001) return 8;
  if (!totalTeams || totalTeams < 4) return null;
  return (totalTeams - 1) * 2;
}

function getRemainingMatches(played?: number, totalTeams?: number, leagueApiId?: number): number | null {
  const total = getSeasonTotalMatches(totalTeams, leagueApiId);
  if (total == null || played == null) return null;
  return Math.max(0, total - played);
}

function canReachTarget(pts?: number, played?: number, targetPts?: number, totalTeams?: number, leagueApiId?: number): boolean {
  if (pts == null || played == null || targetPts == null) return true;
  const remaining = getRemainingMatches(played, totalTeams, leagueApiId);
  if (remaining == null) return true;
  return pts + remaining * 3 >= targetPts;
}

function hasMeaningfulGap(
  pts?: number,
  played?: number,
  abovePts?: number,
  belowPts?: number,
  totalTeams?: number,
  leagueApiId?: number,
): boolean {
  if (pts == null || played == null) return false;
  const remaining = getRemainingMatches(played, totalTeams, leagueApiId);
  if (remaining == null || remaining > 3) return false;
  const maxGain = remaining * 3;
  const cannotClimb = abovePts != null && pts + maxGain < abovePts;
  const cannotFall = belowPts != null && belowPts + maxGain < pts;
  return cannotClimb && cannotFall;
}

function isGuaranteedRelegated(
  pos?: number,
  pts?: number,
  played?: number,
  safetyPts?: number,
  totalTeams?: number,
  leagueApiId?: number,
): boolean {
  if (!pos || pts == null || played == null || safetyPts == null || !totalTeams || totalTeams < 10) return false;
  const bottomStart = totalTeams >= 18 ? totalTeams - 3 : Math.max(totalTeams - 2, 1);
  if (pos < bottomStart) return false;
  const remaining = getRemainingMatches(played, totalTeams, leagueApiId);
  if (remaining == null) return false;
  return pts + remaining * 3 < safetyPts;
}

// Motivation commentary based on standings position and reachable targets.
export function getMotivationComment(
  homePos?: number,
  awayPos?: number,
  leagueApiId?: number,
  context: MotivationContext = {},
): string | null {
  if (!homePos || !awayPos) return null;
  const isUcl = leagueApiId === 2001;
  const {
    homePts, awayPts, homePlayed, awayPlayed, leaderPts, totalTeams,
    homeAbovePts, homeBelowPts, awayAbovePts, awayBelowPts, safetyPts,
  } = context;
  const homeCanCatchLeader = homePos === 1 || canReachTarget(homePts, homePlayed, leaderPts, totalTeams, leagueApiId);
  const awayCanCatchLeader = awayPos === 1 || canReachTarget(awayPts, awayPlayed, leaderPts, totalTeams, leagueApiId);
  const homeSettled = hasMeaningfulGap(homePts, homePlayed, homeAbovePts, homeBelowPts, totalTeams, leagueApiId);
  const awaySettled = hasMeaningfulGap(awayPts, awayPlayed, awayAbovePts, awayBelowPts, totalTeams, leagueApiId);
  const homeRelegated = isGuaranteedRelegated(homePos, homePts, homePlayed, safetyPts, totalTeams, leagueApiId);
  const awayRelegated = isGuaranteedRelegated(awayPos, awayPts, awayPlayed, safetyPts, totalTeams, leagueApiId);
  const bottomStart = totalTeams && totalTeams >= 18 ? totalTeams - 3 : 17;

  if (isUcl) {
    if (homePos <= 8 && awayPos <= 8) {
      return 'İki takım da UCL lig aşamasında ilk 8 hattında (' + homePos + '. vs ' + awayPos + '.). Direkt tur avantajı için puanlar değerli; motivasyon yüksek olabilir.';
    }
    if (homePos <= 8 || awayPos <= 8) {
      const side = homePos <= 8 ? 'Ev sahibi' : 'Deplasman takimi';
      const pos = homePos <= 8 ? homePos : awayPos;
      return side + " UCL'de ilk 8 hattında (" + pos + '). Direkt üst tur avantajını koruma motivasyonu öne çıkıyor.';
    }
    if (homePos >= 9 && homePos <= 24 && awayPos >= 9 && awayPos <= 24) {
      return 'İki takım da UCL play-off hattında (' + homePos + '. vs ' + awayPos + '.). Sıralama avantajı ve eşleşme kalitesi için her puan değerli.';
    }
    if (homePos > 24 || awayPos > 24) {
      const side = homePos > 24 ? 'Ev sahibi' : 'Deplasman takimi';
      const pos = homePos > 24 ? homePos : awayPos;
      return side + " UCL'de eleme hattının dışında (" + pos + '). Puan ihtiyacı motivasyonu belirgin biçimde artırıyor.';
    }
  }

  if (homeRelegated && awayRelegated) {
    return 'İki takım için de ligde kalma hedefi matematiksel olarak kapanmış görünüyor. Bu noktada motivasyon puan ihtiyacından çok prestij, rotasyon ve sezonu iyi bitirme isteğiyle okunmalı.';
  }
  if (homeRelegated) {
    return 'Ev sahibinin ligde kalma hedefi matematiksel olarak kapanmış görünüyor. Bu nedenle ekstra motivasyon avantajı otomatik olarak ev sahibine yazılmamalı; maç daha çok prestij, rotasyon ve reaksiyon kalitesi üzerinden okunmalı.';
  }
  if (awayRelegated) {
    return 'Deplasman takımının ligde kalma hedefi matematiksel olarak kapanmış görünüyor. Bu tablo deplasman lehine ekstra puan motivasyonu üretmez; yorum prestij, rotasyon ve kalan sezon disiplini üzerinden yapılmalı.';
  }
  if (homeSettled && awaySettled) {
    return 'Puan tablosunda iki tarafın da yakın hedef alanı daralmış görünüyor. Motivasyon daha çok prestij, rotasyon ve sezonu iyi bitirme isteği üzerinden okunmalı.';
  }
  if (homeSettled) {
    return 'Ev sahibinin yakın sıralama hedefi matematiksel olarak daralmış görünüyor. Bu maçtaki motivasyon puan zorunluluğundan çok prestij ve sezonu güçlü bitirme tarafında.';
  }
  if (awaySettled) {
    return 'Deplasman takımının yakın sıralama hedefi matematiksel olarak daralmış görünüyor. Bu yüzden puan ihtiyacı yorumu sınırlı; oyun planı prestij ve rotasyon etkisiyle şekillenebilir.';
  }

  if (homePos <= 3 && awayPos <= 3) {
    if (homeCanCatchLeader || awayCanCatchLeader) {
      return 'İki takım da puan tablosunun zirvesinde (' + homePos + '. vs ' + awayPos + '). Liderlik/şampiyonluk hattı matematiksel olarak açıksa bu puanlar sezonun üst sırasını doğrudan etkileyebilir.';
    }
    return 'İki takım da üst sırada (' + homePos + '. vs ' + awayPos + '), ancak liderlik hedefi matematiksel olarak sınırlı görünüyor. Motivasyon daha çok sıralamayı koruma ve prestij tarafında.';
  }
  if (homePos <= 2) {
    if (homeCanCatchLeader) {
      return 'Ev sahibi lider grupta (' + homePos + '). Liderlik/şampiyonluk hedefi matematiksel olarak açıksa bu puan sezonun üst hattını şekillendirebilir.';
    }
    return 'Ev sahibi ' + homePos + '. sırada; lideri yakalama alanı sınırlı görünüyor. Motivasyon daha çok konumunu koruma ve sezonu güçlü bitirme tarafında.';
  }
  if (awayPos <= 2) {
    if (awayCanCatchLeader) {
      return 'Deplasman takımı lider grupta (' + awayPos + '). Liderlik/şampiyonluk hedefi matematiksel olarak açıksa puan ihtiyacı oyun planını daha atak hale getirebilir.';
    }
    return 'Deplasman takımı ' + awayPos + '. sırada; lideri yakalama alanı sınırlı görünüyor. Bu nedenle motivasyon daha çok mevcut konumu koruma ve prestij tarafında.';
  }
  if (homePos >= bottomStart && awayPos >= bottomStart) {
    return 'Her iki takım da alt sıra baskısında (' + homePos + '. vs ' + awayPos + '). Bu tür maçlarda stres ve hata olasılığı artabilir.';
  }
  if (homePos >= bottomStart) {
    return 'Ev sahibi alt sıra baskısında (' + homePos + '). Kendi sahasındaki puan ihtiyacı oyun planını daha cesur hale getirebilir.';
  }
  if (awayPos >= bottomStart) {
    return 'Deplasman takımı alt sıra baskısıyla geliyor (' + awayPos + '). Puan ihtiyacı beklenmedik sonuç ihtimalini artırabilir.';
  }
  if (homeSettled && awaySettled) {
    return 'Puan tablosunda iki tarafın da yakın hedef alanı daralmış görünüyor. Motivasyon daha çok prestij, rotasyon ve sezonu iyi bitirme üzerinden okunmalı.';
  }
  if (homePos >= 4 && homePos <= 7 && awayPos >= 4 && awayPos <= 7) {
    return 'İki takım da Avrupa kupası sınırında yarışıyor (' + homePos + '. vs ' + awayPos + '). Bu eşleşme sezon sonu tablosunu doğrudan etkileyebilir.';
  }
  if (homePos >= 4 && homePos <= 7) {
    return 'Ev sahibi Avrupa kupası sınırında (' + homePos + '). Bu puan sezon sonu hedeflerini belirleyebilir.';
  }
  if (awayPos >= 4 && awayPos <= 7) {
    return 'Deplasman takımı Avrupa kupası için mücadele ediyor (' + awayPos + '). Sonuç odaklı, kompakt bir oyun planı öne çıkabilir.';
  }
  return null;
}

// Deep H2H analysis — over2.5%, BTTS%, recent trend, streak
export function getDeepH2HStats(
  h2hData: FDMatch[],
  home: string,
  away: string,
  homeTeamId?: number,
): { over25Pct: number; bttsPct: number; trendDir: 'home' | 'away' | 'balanced'; recentTrend: string; deepComment: string } | null {
  const valid = h2hData.filter(
    m => m.score?.fullTime?.home != null && m.score?.fullTime?.away != null,
  );
  if (valid.length < 3) return null;

  let over25 = 0, btts = 0;
  valid.forEach(m => {
    const fh = m.score.fullTime.home!, fa = m.score.fullTime.away!;
    if (fh + fa > 2.5) over25++;
    if (fh > 0 && fa > 0) btts++;
  });

  const over25Pct = Math.round((over25 / valid.length) * 100);
  const bttsPct   = Math.round((btts  / valid.length) * 100);

  // Sort ascending by date so slice(-3) always gives the 3 most recent matches
  // (football-data.org head2head may return newest-first)
  const sorted = [...valid].sort(
    (a, b) => new Date(a.utcDate ?? 0).getTime() - new Date(b.utcDate ?? 0).getTime(),
  );
  const recent3 = sorted.slice(-3);
  let rHw = 0, rAw = 0;
  recent3.forEach(m => {
    const fh = m.score.fullTime.home!, fa = m.score.fullTime.away!;
    // homeTeamId > 0 guard: id=0 would never match any real team
    const h2hHomeName = m.homeTeam?.name ?? '';
    const isHomeTeam = (homeTeamId != null && homeTeamId > 0)
      ? m.homeTeam?.id === homeTeamId
      : (m.homeTeam?.shortName === home || (h2hHomeName.length > 0 && (h2hHomeName.includes(home) || home.includes(h2hHomeName))));
    if (fh > fa) { isHomeTeam ? rHw++ : rAw++; }
    else if (fa > fh) { isHomeTeam ? rAw++ : rHw++; }
  });

  const trendDir: 'home' | 'away' | 'balanced' = rHw >= 2 ? 'home' : rAw >= 2 ? 'away' : 'balanced';
  let recentTrend: string;
  if (rHw >= 2) recentTrend = `Son 3 H2H'de ${home} üstün`;
  else if (rAw >= 2) recentTrend = `Son 3 H2H'de ${away} üstün`;
  else recentTrend = 'Son 3 H2H dengeli geçmiş';

  // Compose deep comment
  const parts: string[] = [];

  if (over25Pct >= 65) {
    parts.push(`Geçmiş ${valid.length} karşılaşmanın %${over25Pct}'i 2.5 üst bitti — tarihsel gol eğilimi güçlü.`);
  } else if (over25Pct <= 35) {
    parts.push(`Geçmiş ${valid.length} maçın yalnızca %${over25Pct}'i 2.5 üst bitti — alt senaryo tarihsel destek buluyor.`);
  } else {
    parts.push(`H2H'de 2.5 üst oranı %${over25Pct} — ne net üst ne de alt eğilimi var.`);
  }

  if (bttsPct >= 65) {
    parts.push(`KG Var oranı yüksek (%${bttsPct}) — iki takımın da kalesine gol bulmak tarihsel olarak mümkün.`);
  } else if (bttsPct <= 30) {
    parts.push(`KG Var nadir (%${bttsPct}) — takımlardan biri çoğunlukla kalesini gole kapatmış.`);
  }

  parts.push(recentTrend + '.');

  return { over25Pct, bttsPct, trendDir, recentTrend, deepComment: parts.join(' ') };
}

// Draw odds analysis
export function getDrawAnalysis(
  oddsData: OddsData | null,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
): string {
  if (!oddsData) return '';
  const dO = parseFloat(oddsData.draw ?? '') || 0;
  if (!dO) return '';
  const hO = parseFloat(oddsData.home) || 0;
  const aO = parseFloat(oddsData.away) || 0;

  const avgOver = (hSt.over25Pct + aSt.over25Pct) / 2;
  const avgKg   = (hSt.kgVarPct  + aSt.kgVarPct)  / 2;
  const impliedDraw = hO && aO
    ? Math.round((1 / dO) / ((1 / hO) + (1 / dO) + (1 / aO)) * 100)
    : Math.round((1 / dO) * 100);
  const probabilityLabel = hO && aO ? 'normalize piyasa payı' : 'ham piyasa ihtimali';

  if (dO <= 2.8 && avgOver <= 45) {
    return 'Piyasa beraberliği güçlü ihtimal olarak görüyor (' + dO + '; ' + probabilityLabel + ' %' + impliedDraw + '). Düşük gol eğilimi bu senaryoyu destekliyor.';
  }
  if (dO <= 2.8 && avgOver >= 60) {
    return 'Piyasa beraberliğine %' + impliedDraw + ' pay verirken, iki takımın yüksek gol ortalaması maçın açılma ihtimalini de canlı tutuyor.';
  }
  if (dO >= 3.5 && avgKg >= 55) {
    return 'Piyasa beraberliği uzak ihtimal sayıyor (' + dO + '). KG Var eğilimi de skor hareketi beklentisini güçlendiriyor.';
  }
  return 'Beraberlik oranı ' + dO + ' - ' + probabilityLabel + ' %' + impliedDraw + '. Dengeli bir karşılaşma sinyali.';
}

// ── Match Detail Analysis ──────────────────────────────────────────────────

export interface MatchAnalysis {
  stil: Stil; gol: Level; tempo: Level; risk: Level; guven: Level;
  short: string; medium: string; reasons: string[];
  scoutPick: ScoutPick | null;
  badgeLabel: string; badgeColor: string; badgeBg: string;
}

export const LEAGUE_BASE: Record<number, { stil: Stil; gol: Level; tempo: Level; risk: Level }> = {
  2021: { stil: 'Dengeli',    gol: 'Orta',   tempo: 'Yüksek', risk: 'Düşük'  },
  2014: { stil: 'Savunmacı', gol: 'Orta',   tempo: 'Orta',   risk: 'Düşük'  },
  2002: { stil: 'Hücumcu',   gol: 'Yüksek', tempo: 'Yüksek', risk: 'Orta'   },
  2019: { stil: 'Savunmacı', gol: 'Düşük',  tempo: 'Düşük',  risk: 'Orta'   },
  2015: { stil: 'Dengeli',   gol: 'Orta',   tempo: 'Orta',   risk: 'Yüksek' },
  2001: { stil: 'Dengeli',   gol: 'Orta',   tempo: 'Orta',   risk: 'Düşük'  },
  203:  { stil: 'Dengeli',   gol: 'Orta',   tempo: 'Yüksek', risk: 'Yüksek' },
};

export function buildMatchAnalysis(
  home: string, away: string, leagueApiId: number,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
  hFP: number, aFP: number,
  h2hCount: number, weatherRisk: boolean, hasFormData: boolean,
  hTrend?: { direction: 'up' | 'down' | 'stable'; pts5: number; ptsPrev: number } | null,
  aTrend?: { direction: 'up' | 'down' | 'stable'; pts5: number; ptsPrev: number } | null,
  leagueAvg: number = 1.5,
  h2hItems?: H2HRawItem[],
): MatchAnalysis {
  const base = LEAGUE_BASE[leagueApiId] ?? { stil: 'Dengeli' as Stil, gol: 'Orta' as Level, tempo: 'Orta' as Level, risk: 'Orta' as Level };
  const hash = strHash(home + away);

  let stil:  Stil  = base.stil;
  let gol:   Level = shiftLevel(base.gol,   ANALYSIS_DELTA[hash % 11]);
  let tempo: Level = shiftLevel(base.tempo, ANALYSIS_DELTA[(hash + 3) % 11]);
  let risk:  Level = shiftLevel(base.risk,  ANALYSIS_DELTA[(hash + 7) % 11]);

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
  const scoutPick = hasFormData ? buildScoutPick(home, away, hSt, aSt, hFP, aFP, h2hCount, weatherRisk) : null;
  const persona = getPersonaEnriched(stil, gol, tempo, risk, hasFormData ? hSt : undefined, hasFormData ? aSt : undefined, hTrend, aTrend);
  const short = hasFormData && scoutPick
    ? buildShortAnalysis(home, away, hSt, aSt, hFP, aFP, scoutPick)
    : pickFrom(SHORT_BANK[persona] || SHORT_BANK.dengeli, hash + 5);
  const bankMedium = pickFrom(MEDIUM_BANK[persona] || MEDIUM_BANK.dengeli, hash + 13);
  const medium  = hasFormData && scoutPick
    ? buildScoutSummaryFromPick(home, away, scoutPick, hSt, aSt, hFP, aFP, weatherRisk)
    : bankMedium;
  const reasons = hasFormData
    ? buildReasons(home, away, hSt, aSt, hFP, aFP, h2hCount, hash + 17, hTrend, aTrend, weatherRisk, h2hItems)
    : ['Veri henüz yüklenmedi; form ve H2H verileri değerlendirmeye alınamadı.',
       'Lig profili baz alınarak tahmin üretildi.',
       'Sonuçlar genel eğilimi yansıtmakla birlikte maç bazlı doğrulanmadı.'];
  let badgeLabel: string, badgeColor: string, badgeBg: string;
  if (risk === 'Düşük' && guven !== 'Düşük') {
    badgeLabel = 'Güçlü sinyal'; badgeColor = '#1B6B3A'; badgeBg = '#E8F8F0';
  } else if (risk === 'Yüksek') {
    badgeLabel = 'Risk yüksek'; badgeColor = '#A32D2D'; badgeBg = '#FDE8E8';
  } else {
    badgeLabel = 'Dengeli profil'; badgeColor = '#7A5700'; badgeBg = '#FFF8E1';
  }

  return { stil, gol, tempo, risk, guven, short, medium, reasons, scoutPick, badgeLabel, badgeColor, badgeBg };
}

export function calcFormStats(matches: FDMatch[], teamId: number) {
  let homeWin=0,homeDraw=0,homeLoss=0,homeGf=0,homeGa=0,homePlayed=0;
  let awayWin=0,awayDraw=0,awayLoss=0,awayGf=0,awayGa=0,awayPlayed=0;
  let over25=0,kgVar=0,total=0;
  let cleanSheet=0,failedToScore=0;
  let totalFHGoals=0,totalSHGoals=0,fhMatches=0;
  let secondHalfMoreGoals=0;
  let over15FH=0;

  // Sort chronologically for streak computation
  const sorted = [...matches]
    .filter(m => m.score?.fullTime?.home != null && m.score?.fullTime?.away != null)
    .sort((a, b) => new Date(a.utcDate ?? 0).getTime() - new Date(b.utcDate ?? 0).getTime());

  sorted.forEach(m => {
    const fh=m.score?.fullTime?.home!, fa=m.score?.fullTime?.away!;
    total++;
    const isHome=m.homeTeam?.id===teamId;
    const gf=isHome?fh:fa, ga=isHome?fa:fh;
    if (fh+fa>2.5) over25++;
    if (fh>0&&fa>0) kgVar++;
    if (ga===0) cleanSheet++;
    if (gf===0) failedToScore++;

    // Half-time goals
    const htHome = m.score?.halfTime?.home;
    const htAway = m.score?.halfTime?.away;
    if (htHome != null && htAway != null) {
      fhMatches++;
      const fhTotal = htHome + htAway;
      const shTotal = (fh + fa) - fhTotal;
      totalFHGoals += fhTotal;
      totalSHGoals += shTotal;
      if (fhTotal > 1.5) over15FH++;
      if (shTotal > fhTotal) secondHalfMoreGoals++;
    }

    if (isHome) {
      homePlayed++; homeGf+=gf; homeGa+=ga;
      if (gf>ga) homeWin++; else if (gf===ga) homeDraw++; else homeLoss++;
    } else {
      awayPlayed++; awayGf+=gf; awayGa+=ga;
      if (gf>ga) awayWin++; else if (gf===ga) awayDraw++; else awayLoss++;
    }
  });

  // Compute streaks (consecutive from most recent match)
  let currentWinStreak = 0, currentUnbeatenStreak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i];
    const isHome = m.homeTeam?.id === teamId;
    const fh = m.score.fullTime.home!, fa = m.score.fullTime.away!;
    const gf = isHome ? fh : fa, ga = isHome ? fa : fh;
    if (gf > ga) { currentWinStreak++; currentUnbeatenStreak++; }
    else if (gf === ga) { currentUnbeatenStreak++; break; }
    else { break; }
  }
  // currentUnbeatenStreak = consecutive non-losses (wins + draws); loop above breaks on first non-win for draws
  // For draw streaks continuation: re-count unbeaten separately
  currentUnbeatenStreak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i];
    const isHome = m.homeTeam?.id === teamId;
    const fh = m.score.fullTime.home!, fa = m.score.fullTime.away!;
    const gf = isHome ? fh : fa, ga = isHome ? fa : fh;
    if (gf >= ga) currentUnbeatenStreak++;
    else break;
  }

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
    cleanSheetPct: total>0?Math.round((cleanSheet/total)*100):undefined,
    failedToScorePct: total>0?Math.round((failedToScore/total)*100):undefined,
    firstHalfGoalsAvg: fhMatches>0?parseFloat((totalFHGoals/fhMatches).toFixed(2)):undefined,
    secondHalfGoalsAvg: fhMatches>0?parseFloat((totalSHGoals/fhMatches).toFixed(2)):undefined,
    over15FirstHalfPct: fhMatches>0?Math.round((over15FH/fhMatches)*100):undefined,
    secondHalfMoreGoalsPct: fhMatches>0?Math.round((secondHalfMoreGoals/fhMatches)*100):undefined,
    currentWinStreak,
    currentUnbeatenStreak,
  };
}

export function calcFormPoints(matches: FDMatch[], teamId: number): number {
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

export function getStat(stats: FDFixtureStat[] | undefined, ...keys: string[]): number {
  if (!stats) return 0;
  for (const key of keys) {
    const s = stats.find(x => x.type?.toLowerCase().includes(key.toLowerCase()));
    if (s) return parseInt(s.value) || 0;
  }
  return 0;
}

export function getTeamStyle(stats: MatchFormStats): { label: string; color: string; icon: string } {
  const atk = parseFloat(stats.totalAvgGf as string);
  const def = parseFloat(stats.totalAvgGa as string);
  if (atk>=2.0&&def<=1.0) return { label: 'Dominant',        color: '#1565C0', icon: 'trophy-outline' };
  if (atk>=1.8&&def>=1.5) return { label: 'Açık Futbol',     color: '#E65100', icon: 'flash-outline' };
  if (atk>=1.7&&def<=1.1) return { label: 'Güçlü Hücum',     color: '#185FA5', icon: 'arrow-up-circle-outline' };
  if (atk<=1.0&&def<=0.9) return { label: 'Katı Savunmacı',  color: '#1B5E20', icon: 'shield-checkmark-outline' };
  if (atk<=1.2&&def<=1.1) return { label: 'Savunmacı',       color: '#388E3C', icon: 'shield-outline' };
  if (def>=1.6)            return { label: 'Savunması Açık',  color: '#A32D2D', icon: 'alert-circle-outline' };
  return                          { label: 'Dengeli',          color: '#555',    icon: 'swap-horizontal-outline' };
}

export function getH2HComment(h2hData: FDMatch[], home: string, away: string): string {
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

export function getOddsComment(oddsData: OddsData | null, home: string, analysis: MatchAnalysis): string {
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

export function getRefereeProfile(refName: string, leagueApiId: number) {
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

export function getUclKnockoutMotivation(stage: string): string {
  if (stage === 'FINAL') return 'Şampiyonlar Ligi FİNALİ — galip gelen Avrupa\'nın şampiyonu. İki takım da tüm sezonun birikimini bu geceye yatırıyor; maksimum motivasyon garanti.';
  if (stage === 'SEMI_FINALS') return 'UCL Yarı Finali — bir final bileti için tek eleme maçı. Lig fazı sıralaması bu aşamada anlamsız; sahada hayatta kalmak tek hedef.';
  if (stage === 'QUARTER_FINALS') return 'UCL Çeyrek Finali — eleme aşaması. Bu noktaya gelen her takım sezonun en yüksek motivasyonuyla sahaya çıkıyor.';
  if (stage === 'ROUND_OF_16') return 'UCL Son 16 — lig fazı bitti, eleme başladı. Her iki taraf da çeyrek finale geçmek için tam güçle oynayacak.';
  if (stage === 'KNOCKOUT_ROUND_PLAY_OFF') return 'UCL Play-off — Son 16 bileti için tek eleme. Bu aşamada lig tablosu değil, bu geceki performans belirleyici.';
  return 'UCL eleme aşaması — kazanan tur atlıyor. İki takım da maksimum motivasyonla sahaya çıkıyor.';
}

export function resolveFormTeamIds(stats: FDMatchDetail | null, routeHomeTeamId: number, routeAwayTeamId: number) {
  return {
    home: stats?.homeTeam?.id || routeHomeTeamId,
    away: stats?.awayTeam?.id || routeAwayTeamId,
  };
}

export function resolveWeatherCity(routeCity: string | null, stats: FDMatchDetail | null, routeHomeName: string) {
  return routeCity ||
    getCityForTeam(stats?.homeTeam?.name || '') ||
    getCityForTeam(stats?.homeTeam?.shortName || '') ||
    getCityForTeam(routeHomeName);
}

export function resolveMatchContext(stats: FDMatchDetail | null, route: {
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
