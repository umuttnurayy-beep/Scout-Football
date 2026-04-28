export type Stil = 'Hücumcu' | 'Savunmacı' | 'Dengeli';
export type Level = 'Düşük' | 'Orta' | 'Yüksek';

export const MIN_H2H = 3;

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
}

export interface ScoutPick {
  label: string;
  detail: string;
  tone: 'home' | 'away' | 'draw' | 'goals' | 'caution';
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
  const hAtk = parseFloat(hSt.totalAvgGf as string);
  const aAtk = parseFloat(aSt.totalAvgGf as string);
  const hDef = parseFloat(hSt.totalAvgGa as string);
  const aDef = parseFloat(aSt.totalAvgGa as string);
  const avgOver = (hSt.over25Pct + aSt.over25Pct) / 2;
  const avgKg = (hSt.kgVarPct + aSt.kgVarPct) / 2;
  const hHomeWin = hSt.homeWinPct ?? 0;
  const aAwayWin = aSt.awayWinPct ?? 0;
  const hHomePlayed = hSt.homePlayed ?? 0;
  const aAwayPlayed = aSt.awayPlayed ?? 0;
  const totalSample = Math.min(hSt.total, aSt.total);
  const hMove = hTrend ? hTrend.pts5 - hTrend.ptsPrev : 0;
  const aMove = aTrend ? aTrend.pts5 - aTrend.ptsPrev : 0;
  const lines: string[] = [];

  if (hAtk >= 1.7 && aAtk >= 1.7 && hDef >= 1.3 && aDef >= 1.3) {
    lines.push('\u0130ki tak\u0131m da h\u00fccumda \u00fcretken ama savunmada a\u00e7\u0131k veriyor. Bu profil, ma\u00e7\u0131 tek tarafl\u0131 tahminden \u00e7ok tempo ve gol senaryosu \u00fczerinden okumay\u0131 daha mant\u0131kl\u0131 k\u0131l\u0131yor.');
  }
  if (hAtk - aDef >= 0.45 && hFP >= aFP) {
    lines.push(home + ' i\u00e7in h\u00fccum e\u015fle\u015fmesi olumlu: kendi gol ortalamas\u0131, ' + away + ' savunmas\u0131n\u0131n verdi\u011fi ortalaman\u0131n \u00fczerinde kal\u0131yor. Ev sahibi \u00f6ne ge\u00e7erse ma\u00e7 kontrol\u00fcn\u00fc alabilir.');
  }
  if (aAtk - hDef >= 0.45 && aFP >= hFP) {
    lines.push(away + ' deplasmanda gol tehdidi ta\u015f\u0131yor; h\u00fccum \u00fcretimi ' + home + ' savunma verisiyle e\u015fle\u015fince ge\u00e7i\u015f oyunu ve ikinci toplar kritik hale geliyor.');
  }
  if (hDef <= 1.0 && aDef <= 1.0 && avgOver <= 45) {
    lines.push('Savunma verileri iki tarafta da g\u00fc\u00e7l\u00fc ve 2.5 \u00fcst trendi s\u0131n\u0131rl\u0131. Bu nedenle ma\u00e7\u0131n ilk b\u00f6l\u00fcm\u00fcnde sab\u0131r, duran top ve tek hata senaryosu \u00f6ne \u00e7\u0131k\u0131yor.');
  }
  if (Math.abs(hFP - aFP) <= 2 && Math.abs(hAtk - aAtk) < 0.3 && Math.abs(hDef - aDef) < 0.3) {
    lines.push('Tak\u0131mlar\u0131n form, h\u00fccum ve savunma \u00e7izgisi birbirine yak\u0131n. Bu tip e\u015fle\u015fmede net taraf yorumu zay\u0131flar; ilk gol ve oyun i\u00e7i momentum daha belirleyici olur.');
  }
  if (hTrend && aTrend && Math.abs(hMove - aMove) >= 5) {
    const side = hMove > aMove ? home : away;
    lines.push(side + ' son d\u00f6nem ivmesinde belirgin ayr\u0131\u015f\u0131yor. Sezon ortalamas\u0131 tek ba\u015f\u0131na yeterli de\u011fil; g\u00fcncel form bu ma\u00e7\u0131n ana okuma katman\u0131.');
  }
  if (hHomeWin >= 60 && hHomePlayed >= 4 && aAwayWin <= 35 && aAwayPlayed >= 4) {
    lines.push(home + ' i\u00e7 sahada g\u00fc\u00e7l\u00fc, ' + away + ' deplasmanda daha k\u0131r\u0131lgan g\u00f6r\u00fcn\u00fcyor. \u0130\u00e7 saha etkisi bu ma\u00e7ta sadece psikolojik de\u011fil, say\u0131sal olarak da destekleniyor.');
  } else if (aAwayWin >= 50 && aAwayPlayed >= 4) {
    lines.push(away + ' deplasman performans\u0131yla oyunda kalabilecek bir profil \u00e7iziyor. Ev sahibi bask\u0131 kursa bile deplasman taraf\u0131n\u0131n puan \u00e7\u0131karma ihtimali veride kar\u015f\u0131l\u0131k buluyor.');
  }
  if (avgOver >= 60 && avgKg >= 55) {
    lines.push('Gol trendi ve KG Var oran\u0131 ayn\u0131 y\u00f6nde. Bu tablo, ma\u00e7\u0131n sadece a\u00e7\u0131lmas\u0131n\u0131 de\u011fil iki taraf\u0131n da skora katk\u0131 verme ihtimalini g\u00fc\u00e7lendiriyor.');
  } else if (avgOver >= 60 && avgKg <= 45) {
    lines.push('2.5 \u00fcst e\u011filimi g\u00fc\u00e7l\u00fc fakat KG Var ayn\u0131 \u015fiddette destek vermiyor. Goll\u00fc ama tek taraf\u0131n daha bask\u0131n oldu\u011fu senaryo da dikkate al\u0131nmal\u0131.');
  } else if (avgOver <= 40 && avgKg >= 55) {
    lines.push('Toplam gol trendi d\u00fc\u015f\u00fck olsa da KG Var canl\u0131 kal\u0131yor. Bu profil 1-1 gibi dar skorlu, dengeli bir ma\u00e7 ihtimalini y\u00fckseltir.');
  }

  const main = lines.length > 0 ? lines[hash % lines.length] : 'Veriler tek bir y\u00f6ne sert bi\u00e7imde akm\u0131yor; form, gol profili ve savunma dengesi birlikte okunmal\u0131. Ma\u00e7\u0131n k\u0131r\u0131lma an\u0131 b\u00fcy\u00fck olas\u0131l\u0131kla ilk gol veya tempo de\u011fi\u015fimi olacak.';
  const outlook: string[] = [];

  if (totalSample < 6) {
    outlook.push('Yine de y\u00fczdeler keskin bir h\u00fck\u00fcmden \u00e7ok ma\u00e7 senaryosu olarak okunmal\u0131.');
  } else if (avgOver >= 58 && avgKg >= 55) {
    outlook.push('\u00d6ne \u00e7\u0131kan okuma: iki taraf\u0131n da skora katk\u0131 verebildi\u011fi hareketli bir ma\u00e7.');
  } else if (avgOver <= 42) {
    outlook.push('\u00d6ne \u00e7\u0131kan okuma: sab\u0131rl\u0131 ba\u015flang\u0131\u00e7 ve d\u00fc\u015f\u00fck tempolu skor ak\u0131\u015f\u0131.');
  } else if (Math.abs(hFP - aFP) <= 2) {
    outlook.push('\u00d6ne \u00e7\u0131kan okuma: dengeli oyun, ilk gol\u00fcn psikolojik etkisi ve ikinci yar\u0131 ayarlar\u0131.');
  } else {
    const side = hFP > aFP ? home : away;
    outlook.push('\u00d6ne \u00e7\u0131kan okuma: ' + side + ' form avantaj\u0131n\u0131 oyun kontrol\u00fcne \u00e7evirebilirse ma\u00e7\u0131 kendi ritmine alabilir.');
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
  const hAtk = parseFloat(hSt.totalAvgGf as string);
  const aAtk = parseFloat(aSt.totalAvgGf as string);
  const hDef = parseFloat(hSt.totalAvgGa as string);
  const aDef = parseFloat(aSt.totalAvgGa as string);
  const avgOver = (hSt.over25Pct + aSt.over25Pct) / 2;
  const avgKg = (hSt.kgVarPct + aSt.kgVarPct) / 2;
  const hHomeWin = hSt.homeWinPct ?? 0;
  const aAwayWin = aSt.awayWinPct ?? 0;
  const sample = Math.min(hSt.total, aSt.total);
  const lowConfidence = sample < 5 || weatherRisk || h2hCount < 2;
  const overLabel = Math.round(avgOver);
  const kgLabel = Math.round(avgKg);
  const homeEdge = (hFP - aFP) + (hAtk - aDef) * 3 + (hHomeWin >= 55 ? 2 : 0);
  const awayEdge = (aFP - hFP) + (aAtk - hDef) * 3 + (aAwayWin >= 45 ? 2 : 0);

  if (lowConfidence) {
    if (avgOver >= 58 || hAtk + aAtk >= 2.6) {
      return {
        label: '1.5 Üst radarı',
        detail: `Veri güveni sınırlı, bu yüzden 2.5 üst yerine daha düşük gol çizgisi mantıklı. İlk 15 dakikada tempo ve şut hacmi oluşursa 1.5 üst desteklenir.`,
        tone: 'goals',
      };
    }
    if (avgOver <= 42 || hAtk + aAtk <= 2.0) {
      return {
        label: 'Alt 3.5 güvenli çizgi',
        detail: `Örneklem sınırlı ama gol profili patlayıcı görünmüyor: 2.5 üst ortalaması %${overLabel}. Tempo yükselmezse alt çizgisi daha dengeli okuma verir.`,
        tone: 'draw',
      };
    }
    if (homeEdge >= awayEdge + 3) {
      return {
        label: '1X güvenlik tarafı',
        detail: `${home} tarafında hafif üstünlük var, fakat veri direkt MS 1 için yeterince güçlü değil. Çift şans daha temkinli market okuması.`,
        tone: 'home',
      };
    }
    if (awayEdge >= homeEdge + 3) {
      return {
        label: 'X2 güvenlik tarafı',
        detail: `${away} oyunda kalma tarafında hafif sinyal veriyor. Veri sınırlı olduğu için direkt MS 2 yerine X2 daha kontrollü yaklaşım.`,
        tone: 'away',
      };
    }
    if (avgKg >= 52) {
      return {
        label: 'KG Var için canlı teyit',
        detail: `KG Var ortalaması %${kgLabel}; maç önü güven düşük olsa da iki tarafın skor bulma ihtimali tamamen kapalı değil. Erken tempo oluşursa bu market izlenebilir.`,
        tone: 'goals',
      };
    }
    return {
      label: 'Taraf yerine canlı gol pazarı',
      detail: 'Veri güveni düşük ve taraf sinyalleri net değil. İlk bölümde tempo oluşursa gol pazarı, durağan başlangıçta alt çizgisi daha mantıklı okunur.',
      tone: 'caution',
    };
  }

  if (avgOver >= 64 && avgKg >= 58 && hAtk >= 1.4 && aAtk >= 1.4) {
    return {
      label: '2.5 Üst + KG Var eğilimi',
      detail: `Gol profili çift taraflı destek veriyor: 2.5 üst ortalaması %${overLabel}, KG Var ortalaması %${kgLabel}. Taraf yerine gol pazarı daha temiz okunuyor.`,
      tone: 'goals',
    };
  }

  if (avgOver >= 62 && hAtk + aAtk >= 2.8) {
    return {
      label: '2.5 Üst lean',
      detail: `Toplam gol trendi güçlü (%${overLabel}). KG Var aynı ölçüde desteklemiyorsa bile maçın 2 gole sıkışmama ihtimali öne çıkıyor.`,
      tone: 'goals',
    };
  }

  if (avgOver <= 38 && avgKg <= 48) {
    return {
      label: 'Alt 3.5 / kontrollü tempo',
      detail: `Gol trendi düşük kalıyor: 2.5 üst ortalaması %${overLabel}. Öncelikli okuma dar skor, sabırlı başlangıç ve risk azaltılmış alt senaryosu.`,
      tone: 'draw',
    };
  }

  if (avgOver <= 42 && Math.abs(hFP - aFP) <= 3) {
    return {
      label: 'X ve alt tempo radarı',
      detail: 'Form farkı sınırlı, gol trendi düşük. Beraberlik veya tek farkla bitecek kontrollü skor çizgisi daha mantıklı duruyor.',
      tone: 'draw',
    };
  }

  if (homeEdge >= awayEdge + 7) {
    return {
      label: 'MS 1 eğilimi',
      detail: `${home} tarafında form, iç saha ve hücum-savunma eşleşmesi belirgin üstün. Oran çok düşerse 1X daha rasyonel güvenlik payı verir.`,
      tone: 'home',
    };
  }
  if (awayEdge >= homeEdge + 7) {
    return {
      label: 'MS 2 eğilimi',
      detail: `${away} form ve deplasman üretimiyle net sinyal veriyor. Risk yönetimi için X2, direkt taraf seçimine göre daha dengeli okunabilir.`,
      tone: 'away',
    };
  }
  if (homeEdge >= awayEdge + 4) {
    return {
      label: '1X tarafı',
      detail: `${home} kaybetmeme çizgisinde daha güçlü duruyor. Direkt galibiyet yerine çift şans profili veriye daha uyumlu.`,
      tone: 'home',
    };
  }
  if (awayEdge >= homeEdge + 4) {
    return {
      label: 'X2 tarafı',
      detail: `${away} oyunda kalma ve sonuç alma tarafında daha iyi sinyal veriyor. Deplasman riskini azaltan okuma X2.`,
      tone: 'away',
    };
  }

  return {
    label: 'Pas / canlıdan oku',
    detail: 'Maç önü sinyaller birbirini kesiyor. İlk gol, tempo ve ceza sahası girişleri görülmeden taraf ya da gol pazarı zorlanmamalı.',
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

export function getWeatherComment(weatherData: any): { impact: Level; sentence: string } {
  if (!weatherData) return { impact: 'Düşük', sentence: 'Hava durumu verisi alınamadı.' };
  const t = weatherData.temp ?? 15;
  const w = weatherData.wind ?? 0;
  const cond = (weatherData.condition || '').toLowerCase();
  const rain = /rain|shower|drizzle|yağmur/.test(cond);
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
  matches: any[],
  teamId: number,
): FormTrend | null {
  const finished = [...matches.filter((m: any) => m.score?.fullTime?.home != null)].sort(
    (a, b) => new Date(a.utcDate ?? 0).getTime() - new Date(b.utcDate ?? 0).getTime(),
  );
  if (finished.length < 6) return null;

  const recent5  = finished.slice(-5);
  const prev5    = finished.slice(-10, -5);

  const calcPts = (ms: any[]) => ms.reduce((pts: number, m: any) => {
    const isHome = m.homeTeam?.id === teamId;
    const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    return pts + (gf > ga ? 3 : gf === ga ? 1 : 0);
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
    homeAbovePts, homeBelowPts, awayAbovePts, awayBelowPts,
  } = context;
  const homeCanCatchLeader = homePos === 1 || canReachTarget(homePts, homePlayed, leaderPts, totalTeams, leagueApiId);
  const awayCanCatchLeader = awayPos === 1 || canReachTarget(awayPts, awayPlayed, leaderPts, totalTeams, leagueApiId);
  const homeSettled = hasMeaningfulGap(homePts, homePlayed, homeAbovePts, homeBelowPts, totalTeams, leagueApiId);
  const awaySettled = hasMeaningfulGap(awayPts, awayPlayed, awayAbovePts, awayBelowPts, totalTeams, leagueApiId);
  const bottomStart = totalTeams && totalTeams >= 18 ? totalTeams - 3 : 17;

  if (isUcl) {
    if (homePos <= 8 && awayPos <= 8) {
      return 'İki takım da UCL lig aşamasında ilk 8 hattında (' + homePos + '. vs ' + awayPos + '.). Direkt tur avantajı için puanlar değerli; tempo artabilir.';
    }
    if (homePos <= 8 || awayPos <= 8) {
      const side = homePos <= 8 ? 'Ev sahibi' : 'Deplasman takımı';
      const pos = homePos <= 8 ? homePos : awayPos;
      return side + " UCL'de ilk 8 hattında (" + pos + '). Direkt üst tur avantajını koruma motivasyonu öne çıkıyor.';
    }
    if (homePos >= 9 && homePos <= 24 && awayPos >= 9 && awayPos <= 24) {
      return 'İki takım da UCL play-off hattında (' + homePos + '. vs ' + awayPos + '.). Sıralama avantajı ve eşleşme kalitesi için her puan değerli.';
    }
    if (homePos > 24 || awayPos > 24) {
      const side = homePos > 24 ? 'Ev sahibi' : 'Deplasman takımı';
      const pos = homePos > 24 ? homePos : awayPos;
      return side + " UCL'de eleme hattının dışında (" + pos + '). Puan ihtiyacı motivasyonu belirgin biçimde artırıyor.';
    }
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
  h2hData: any[],
  home: string,
  away: string,
  homeTeamId?: number,
): { over25Pct: number; bttsPct: number; trendDir: 'home' | 'away' | 'balanced'; recentTrend: string; deepComment: string } | null {
  const valid = h2hData.filter(
    (m: any) => m.score?.fullTime?.home != null && m.score?.fullTime?.away != null,
  );
  if (valid.length < 3) return null;

  let over25 = 0, btts = 0;
  valid.forEach((m: any) => {
    const fh = m.score.fullTime.home, fa = m.score.fullTime.away;
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
  recent3.forEach((m: any) => {
    const fh = m.score.fullTime.home, fa = m.score.fullTime.away;
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
  oddsData: any,
  hSt: MatchFormStats,
  aSt: MatchFormStats,
): string {
  if (!oddsData) return '';
  const dO = parseFloat(oddsData.draw) || 0;
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
