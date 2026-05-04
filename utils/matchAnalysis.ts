import { getCityForTeam } from '../services/api';
import type { FDFixtureStat, FDMatch, FDMatchDetail, OddsData, WeatherData } from '../services/api';
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
  const homeEdge = (hFP - aFP) + (hAtk - aDef) * 3 + (hHomeWin >= 55 ? 2 : 0);
  const awayEdge = (aFP - hFP) + (aAtk - hDef) * 3 + (aAwayWin >= 45 ? 2 : 0);
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

  const offset = hash % pool.length;
  const selected = [0, 1, 2].map(i => pool[(offset + i) % pool.length]);
  return [...new Set([...selected, ...advanced])].slice(0, 10);
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
    lines.push('Gol çizgisi yüksek görünüyor ama karşılıklı skor aynı güçte desteklenmiyor. Gollü ama tek tarafın daha baskın olduğu bir maç da ihtimaller arasında.');
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
  const { hAtk, aAtk, avgOver, avgKg, homeEdge, awayEdge } = signal;
  const sample = Math.min(hSt.total, aSt.total);
  const lowConfidence = sample < 5 || weatherRisk;
  const sideGap = Math.abs(homeEdge - awayEdge);
  const overLabel = Math.round(avgOver);
  const kgLabel = Math.round(avgKg);

  if (signal.conflict && sideGap < 14) {
    return {
      label: avgOver >= 58 ? 'Skor üretimi önde' : 'Taraf seçimi zayıf',
      detail: avgOver >= 58
        ? `Kazanan taraf net ayrışmıyor; bu yüzden analiz gol çizgisine kayıyor. Hücum verisi maçın düşük skora kilitlenmeme ihtimalini güçlendiriyor.`
        : `İki taraf farklı verilerde öne çıkıyor. Maç önü kazanan seçimi zayıf; bu profilde taraf pazarı gereksiz risk taşıyor.`,
      tone: avgOver >= 58 ? 'goals' : 'caution',
    };
  }

  if (lowConfidence) {
    if (avgOver >= 58 || hAtk + aAtk >= 2.6) {
      return {
        label: 'Gol çizgisi daha okunaklı',
        detail: `Veri güveni sınırlı olsa da hücum üretimi skor ihtimalini açık bırakıyor. Kazanan taraf yerine maçın gol üretimi daha anlaşılır sinyal veriyor.`,
        tone: 'goals',
      };
    }
    if (avgOver <= 42 || hAtk + aAtk <= 2.0) {
      return {
        label: 'Dar skor beklenir',
        detail: `Gol profili hızlı açılan bir maça işaret etmiyor: gol ortalaması %${overLabel}. Bu tabloda kontrollü oyun ve düşük skor daha yakın duruyor.`,
        tone: 'draw',
      };
    }
    if (homeEdge >= awayEdge + 3) {
      return {
        label: `${home} yenilmez tarafa yakın`,
        detail: `${home} tarafında hafif üstünlük var, fakat galibiyet için yeterince sert sinyal yok. Kaybetmeme senaryosu daha dengeli duruyor.`,
        tone: 'home',
      };
    }
    if (awayEdge >= homeEdge + 3) {
      return {
        label: `${away} yenilmez tarafa yakın`,
        detail: `${away} tarafında oyunda kalma sinyali var. Veri sınırlı olduğu için doğrudan galibiyet yerine kaybetmeme senaryosu daha dengeli duruyor.`,
        tone: 'away',
      };
    }
    if (avgKg >= 52) {
      return {
        label: 'İki taraf da gol bulabilir',
        detail: `İki takımın da gol bulma ortalaması %${kgLabel}. Taraf seçimi yerine iki ekibin skor katkısı daha okunabilir sinyal veriyor.`,
        tone: 'goals',
      };
    }
    return {
      label: 'Net bahis değeri yok',
      detail: 'Maç önü verisi taraf, gol veya düşük skor için yeterince ayrışmıyor. Bu profil zorlamaya açık değil.',
      tone: 'caution',
    };
  }

  if (avgOver >= 64 && avgKg >= 58 && hAtk >= 1.4 && aAtk >= 1.4) {
    return {
      label: 'Karşılıklı gol senaryosu güçlü',
      detail: `Gol profili iki taraftan da destek alıyor: gol ortalaması %${overLabel}, karşılıklı skor ortalaması %${kgLabel}. Taraf yerine iki ekibin skor katkısı daha net.`,
      tone: 'goals',
    };
  }

  if (avgOver >= 62 && hAtk + aAtk >= 2.8) {
    return {
      label: 'Üst skor tarafı ağır basıyor',
      detail: `Toplam gol trendi güçlü (%${overLabel}). Karşılıklı skor aynı ölçüde desteklenmese bile maçın düşük skora sıkışmama ihtimali daha yüksek.`,
      tone: 'goals',
    };
  }

  if (avgOver <= 38 && avgKg <= 48) {
    return {
      label: 'Alt skor profili önde',
      detail: `Gol trendi düşük kalıyor: gol ortalaması %${overLabel}. Dar skor ve sabırlı başlangıç bu veriye daha uyumlu.`,
      tone: 'draw',
    };
  }

  if (avgOver <= 42 && Math.abs(hFP - aFP) <= 3) {
    return {
      label: 'Kontrollü oyun beklenir',
      detail: 'Form farkı sınırlı, gol trendi düşük. Beraberlik veya tek farkla bitecek kontrollü skor çizgisi daha mantıklı.',
      tone: 'draw',
    };
  }

  if (avgOver >= 58 && hAtk + aAtk >= 2.45 && sideGap < 14) {
    return {
      label: 'Gol beklentisi daha net',
      detail: `İki takımın gol üretimi toplam skor ihtimalini destekliyor. Taraf farkı sınırlı kaldığı için kazanan yerine gol çizgisi daha net seçim.`,
      tone: 'goals',
    };
  }

  if (homeEdge >= awayEdge + 12) {
    if (signal.conflictText) {
      return {
        label: `${home} yenilmez çizgide`,
        detail: `${away} bazı verilerde direnç gösterse de toplam form, iç saha etkisi ve hücum-savunma eşleşmesi ${home} tarafını öne taşıyor. Galibiyet yerine yenilmezlik daha dengeli.`,
        tone: 'home',
      };
    }
    return {
      label: `${home} galibiyete yakın`,
      detail: `${home} tarafında form, iç saha ve hücum-savunma eşleşmesi belirgin üstün. Maçı kendi ritmine çekme şansı daha yüksek.`,
      tone: 'home',
    };
  }
  if (awayEdge >= homeEdge + 12) {
    if (signal.conflictText) {
      return {
        label: `${away} yenilmez çizgide`,
        detail: `${home} bazı verilerde direnç gösterse de son form ve deplasman gol tehdidi ${away} tarafını öne taşıyor. Galibiyet yerine yenilmezlik daha dengeli.`,
        tone: 'away',
      };
    }
    return {
      label: `${away} galibiyete yakın`,
      detail: `${away} form ve deplasman üretimiyle net sinyal veriyor. Deplasman riskine rağmen galibiyet tarafı veriyle destekleniyor.`,
      tone: 'away',
    };
  }
  if (homeEdge >= awayEdge + 4) {
    return {
      label: `${home} yenilmez çizgide`,
      detail: `${home} tarafı hafif önde. Fark galibiyet için sert değil; yenilmezlik senaryosu daha mantıklı.`,
      tone: 'home',
    };
  }
  if (awayEdge >= homeEdge + 4) {
    return {
      label: `${away} yenilmez çizgide`,
      detail: `${away} tarafı hafif önde. Fark galibiyet için sert değil; yenilmezlik senaryosu daha mantıklı.`,
      tone: 'away',
    };
  }

  return {
    label: 'Net bahis değeri yok',
    detail: 'Maç önü sinyalleri taraf, gol veya düşük skor için yeterince ayrışmıyor. Bu profil zorlamaya açık değil.',
    tone: 'draw',
  };
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

export function calcFormStats(matches: FDMatch[], teamId: number) {
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

export function getTeamStyle(stats: ReturnType<typeof calcFormStats>): { label: string; color: string; emoji: string } {
  const atk = parseFloat(stats.totalAvgGf as string);
  const def = parseFloat(stats.totalAvgGa as string);
  if (atk>=2.0&&def<=1.0) return { label: 'Dominant',      color: '#1565C0', emoji: '👑' };
  if (atk>=1.8&&def>=1.5) return { label: 'Açık Futbol',   color: '#E65100', emoji: '⚡' };
  if (atk>=1.7&&def<=1.1) return { label: 'Güçlü Hücum',   color: '#185FA5', emoji: '⚽' };
  if (atk<=1.0&&def<=0.9) return { label: 'Katı Savunmacı',color: '#1B5E20', emoji: '🛡️' };
  if (atk<=1.2&&def<=1.1) return { label: 'Savunmacı',     color: '#388E3C', emoji: '🛡️' };
  if (def>=1.6)            return { label: 'Savunması Açık',color: '#A32D2D', emoji: '🚨' };
  return                          { label: 'Dengeli',        color: '#555',    emoji: '⚖️' };
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
