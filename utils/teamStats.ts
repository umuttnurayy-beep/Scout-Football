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
  return transliterate(name)
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

export function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function parseForm(
  matches: FDMatch[] | SLFormMatch[],
  teamId: number,
  isSL: boolean,
): string[] {
  if (isSL) {
    return (matches as SLFormMatch[]).map(m => {
      const gf = m.homeTeamId === teamId ? m.homeScore : m.awayScore;
      const ga = m.homeTeamId === teamId ? m.awayScore : m.homeScore;
      return (gf ?? 0) > (ga ?? 0) ? 'G' : (gf ?? 0) === (ga ?? 0) ? 'B' : 'M';
    });
  }
  return (matches as FDMatch[])
    .filter(m => m.score?.fullTime?.home != null)
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
    .slice(-5)
    .map(m => {
      const isHome = m.homeTeam?.id === teamId;
      const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away;
      const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home;
      return (gf ?? 0) > (ga ?? 0) ? 'G' : (gf ?? 0) === (ga ?? 0) ? 'B' : 'M';
    });
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

// ─── SL form stats (shared with sl_match_detail + scout_performance) ─────────

export function calcFormStatsSL(matches: SLFormMatch[], teamId: number) {
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

export function calcFormPointsSL(matches: SLFormMatch[], teamId: number): number {
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

// ─── team profile ────────────────────────────────────────────────────────────

export function getTeamProfile(avgGf: number, avgGa: number, winPct: number, isDark: boolean) {
  const total = avgGf + avgGa;
  if (avgGf >= 2.0 && avgGa <= 1.0)
    return { label: 'Dominant',        icon: 'star',                 color: isDark ? '#79AAFF' : '#1565C0', desc: 'Hem hücum hem savunmada ligde öne çıkıyor. Rakipleri için en zor karşılaşmalardan biri.' };
  if (total > 3.2)
    return { label: 'Tempolu',         icon: 'flash',                color: '#E65100',                      desc: 'Karşılıklı gol ve yüksek tempo bu takımın imzası. Maçları genellikle çok gollü geçiyor.' };
  if (avgGf >= 1.8 && avgGa >= 1.4)
    return { label: 'Hücumcu',         icon: 'arrow-up-circle',      color: isDark ? '#58A6FF' : '#185FA5', desc: 'Güçlü hücumla gol üreten ama savunmada bedel ödeyen bir takım. Yüksek skorlu maç profili.' };
  if (avgGf <= 1.0 && avgGa <= 0.8)
    return { label: 'Katı Savunmacı',  icon: 'shield',               color: isDark ? '#3FB950' : '#1B5E20', desc: 'Yenilmezlik üzerine kurulu bir sistem. Az gol, az yenilen — sağlam ama az gollü maçlar.' };
  if (avgGf <= 1.2 && avgGa <= 1.0)
    return { label: 'Savunmacı',       icon: 'shield-outline',       color: isDark ? '#56D364' : '#388E3C', desc: 'Savunma odaklı, kontrollü bir oyun anlayışı. Riskten kaçınan ve sağlam bir yapı.' };
  if (avgGa > 1.7)
    return { label: 'Kırılgan Savunma',icon: 'alert-circle',         color: isDark ? '#F85149' : '#A32D2D', desc: 'Savunma beklenmedik gol yeme riski taşıyor. Hücumuyla öne geçse de arkasında açık var.' };
  if (winPct >= 55 && avgGf >= 1.5)
    return { label: 'Kontrollü',       icon: 'trending-up',          color: isDark ? '#1F6FEB' : '#0C447C', desc: 'Galibiyet yüzdesi ve gol dengesi iyi. Ligde üst sıralarda tutarlı bir güç.' };
  return   { label: 'Dengeli',         icon: 'git-compare-outline',  color: isDark ? '#B1BAC4' : '#555',    desc: 'Hücum ve savunma arasında denge kurmuş, her türlü rakiple yarışabilen bir takım.' };
}
