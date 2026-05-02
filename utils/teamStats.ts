import type { FDMatch, SLFormMatch } from '../services/api';

// ─── types ─────────────────────────────────────────────────────────────────

export type SeasonStats = {
  total: number;
  over15Pct: number; over25Pct: number; over35Pct: number;
  bttsPct: number; cleanSheetPct: number; failedToScorePct: number;
  avgGF: string; avgGA: string;
  home: { played: number; win: number; draw: number; loss: number };
  away: { played: number; win: number; draw: number; loss: number };
};

// ─── string helpers ─────────────────────────────────────────────────────────

export function normalizeTeamName(name: string): string {
  return name.toLowerCase()
    .replace(/\b(fc|afc|cf|sc)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function transliterate(s: string): string {
  return s.toLowerCase()
    .replace(/[İı]/g, 'i').replace(/[ğ]/g, 'g')
    .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .replace(/\s+/g, ' ').trim();
}

export function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

// ─── season stats calculators ───────────────────────────────────────────────

export function calcSeasonStats(matches: FDMatch[], teamId: number): SeasonStats | null {
  const finished = matches.filter((m) => m.score?.fullTime?.home != null);
  const total = finished.length;
  if (total === 0) return null;

  let over15 = 0, over25 = 0, over35 = 0;
  let btts = 0, cleanSheet = 0, failedToScore = 0;
  let homeW = 0, homeD = 0, homeL = 0, homePlayed = 0;
  let awayW = 0, awayD = 0, awayL = 0, awayPlayed = 0;
  let totalGF = 0, totalGA = 0;

  for (const m of finished) {
    const isHome = m.homeTeam?.id === teamId;
    const gf = (isHome ? m.score.fullTime.home : m.score.fullTime.away)!;
    const ga = (isHome ? m.score.fullTime.away : m.score.fullTime.home)!;
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

export function calcSLSeasonStats(matches: SLFormMatch[], teamId: number): SeasonStats | null {
  const finished = matches.filter((m) => m.homeScore != null && m.awayScore != null);
  const total = finished.length;
  if (total === 0) return null;

  let over15 = 0, over25 = 0, over35 = 0;
  let btts = 0, cleanSheet = 0, failedToScore = 0;
  let homeW = 0, homeD = 0, homeL = 0, homePlayed = 0;
  let awayW = 0, awayD = 0, awayL = 0, awayPlayed = 0;
  let totalGF = 0, totalGA = 0;

  for (const m of finished) {
    const isHome = m.homeTeamId === teamId;
    const gf = isHome ? m.homeScore! : m.awayScore!;
    const ga = isHome ? m.awayScore! : m.homeScore!;
    const totalGoals = m.homeScore! + m.awayScore!;
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

// ─── team profile ────────────────────────────────────────────────────────────

export function getTeamProfile(avgGf: number, avgGa: number, winPct: number, isDark: boolean) {
  const total = avgGf + avgGa;
  if (avgGf >= 2.0 && avgGa <= 1.0)
    return { label: 'Dominant',         emoji: '👑', color: isDark ? '#79AAFF' : '#1565C0', desc: 'Hem hücum hem savunmada ligde öne çıkıyor. Rakipleri için en zor karşılaşmalardan biri.' };
  if (total > 3.2)
    return { label: 'Tempolu',           emoji: '⚡', color: '#E65100',                      desc: 'Karşılıklı gol ve yüksek tempo bu takımın imzası. Maçları genellikle çok gollü geçiyor.' };
  if (avgGf >= 1.8 && avgGa >= 1.4)
    return { label: 'Hücumcu',           emoji: '⚽', color: isDark ? '#58A6FF' : '#185FA5', desc: 'Güçlü hücumla gol üreten ama savunmada bedel ödeyen bir takım. Yüksek skorlu maç profili.' };
  if (avgGf <= 1.0 && avgGa <= 0.8)
    return { label: 'Katı Savunmacı',    emoji: '🛡️', color: isDark ? '#3FB950' : '#1B5E20', desc: 'Yenilmezlik üzerine kurulu bir sistem. Az gol, az yenilen — sağlam ama az gollü maçlar.' };
  if (avgGf <= 1.2 && avgGa <= 1.0)
    return { label: 'Savunmacı',         emoji: '🛡️', color: isDark ? '#56D364' : '#388E3C', desc: 'Savunma odaklı, kontrollü bir oyun anlayışı. Riskten kaçınan ve sağlam bir yapı.' };
  if (avgGa > 1.7)
    return { label: 'Kırılgan Savunma',  emoji: '🚨', color: isDark ? '#F85149' : '#A32D2D', desc: 'Savunma beklenmedik gol yeme riski taşıyor. Hücumuyla öne geçse de arkasında açık var.' };
  if (winPct >= 55 && avgGf >= 1.5)
    return { label: 'Kontrollü',         emoji: '📈', color: isDark ? '#1F6FEB' : '#0C447C', desc: 'Galibiyet yüzdesi ve gol dengesi iyi. Ligde üst sıralarda tutarlı bir güç.' };
  return   { label: 'Dengeli',           emoji: '⚖️', color: isDark ? '#B1BAC4' : '#555',    desc: 'Hücum ve savunma arasında denge kurmuş, her türlü rakiple yarışabilen bir takım.' };
}
