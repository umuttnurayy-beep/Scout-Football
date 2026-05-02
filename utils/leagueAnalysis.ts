import { FDMatch } from '../services/api';

// ─── types ────────────────────────────────────────────────────────────────────

export type UCLTie = { leg1: FDMatch; leg2: FDMatch | null };

export type Level = 'Düşük' | 'Orta' | 'Yüksek';

export type LeagueChar = {
  label: string; color: string; bg: string; traits: string[]; rec: string; ozet: string;
  gol: Level; tempo: Level; risk: Level; stil: string;
};

export type CP = { color: string; bg: string };

export type LeagueStanding = {
  pos: number; team: string; teamId: number;
  played: number; win: number; draw: number; loss: number;
  gf: number; ga: number; pts: number;
};

// ─── color palette ────────────────────────────────────────────────────────────

const SC: Record<string, { l: CP; d: CP }> = {
  red:    { l: { color: '#A32D2D', bg: '#FDE8E8' }, d: { color: '#F85149', bg: '#3D0F0F' } },
  green:  { l: { color: '#27500A', bg: '#E8F5E9' }, d: { color: '#3FB950', bg: '#0D2010' } },
  yellow: { l: { color: '#E6A817', bg: '#FFF8E1' }, d: { color: '#E3B341', bg: '#2D1A00' } },
  purple: { l: { color: '#5b2d8e', bg: '#F3E5F5' }, d: { color: '#A371F7', bg: '#1E0F3D' } },
  blue:   { l: { color: '#185FA5', bg: '#E6F1FB' }, d: { color: '#58A6FF', bg: '#0D2F4F' } },
  gray:   { l: { color: '#666',    bg: '#f0f0f0' }, d: { color: '#8B949E', bg: '#21262D' } },
};

export const cp = (key: string, isDark: boolean): CP => isDark ? SC[key].d : SC[key].l;

// ─── UCL bracket helpers ──────────────────────────────────────────────────────

export function groupTies(matches: FDMatch[]): UCLTie[] {
  const ties: UCLTie[] = [];
  const used = new Set<number>();
  for (let i = 0; i < matches.length; i++) {
    if (used.has(i)) continue;
    const m = matches[i];
    const hId = m.homeTeam?.id, aId = m.awayTeam?.id;
    const ret = matches.findIndex((n, j) =>
      !used.has(j) && j !== i && n.homeTeam?.id === aId && n.awayTeam?.id === hId
    );
    if (ret === -1) {
      ties.push({ leg1: m, leg2: null });
    } else {
      used.add(ret);
      const [first, second] = new Date(m.utcDate) <= new Date(matches[ret].utcDate)
        ? [m, matches[ret]] : [matches[ret], m];
      ties.push({ leg1: first, leg2: second });
    }
    used.add(i);
  }
  return ties;
}

export function tieResult(tie: UCLTie): { homeAgg: number; awayAgg: number; winner: string | null } {
  const l1 = tie.leg1, l2 = tie.leg2;
  if (!l2) {
    const fh = l1.score?.fullTime?.home, fa = l1.score?.fullTime?.away;
    if (fh == null || fa == null) return { homeAgg: 0, awayAgg: 0, winner: null };
    const winner = fh > fa ? (l1.homeTeam?.shortName || l1.homeTeam?.name || null)
                 : fa > fh ? (l1.awayTeam?.shortName || l1.awayTeam?.name || null) : null;
    return { homeAgg: fh, awayAgg: fa, winner };
  }
  const l1h = l1.score?.fullTime?.home ?? null, l1a = l1.score?.fullTime?.away ?? null;
  const l2h = l2.score?.fullTime?.home ?? null, l2a = l2.score?.fullTime?.away ?? null;
  if (l1h == null || l1a == null || l2h == null || l2a == null) return { homeAgg: 0, awayAgg: 0, winner: null };
  const homeAgg = l1h + l2a, awayAgg = l1a + l2h;
  const winner = homeAgg > awayAgg ? (l1.homeTeam?.shortName || l1.homeTeam?.name || null)
               : awayAgg > homeAgg ? (l1.awayTeam?.shortName || l1.awayTeam?.name || null) : null;
  return { homeAgg, awayAgg, winner };
}

// ─── analysis helpers ─────────────────────────────────────────────────────────

export function getTagColor(level: Level, isDark = false): CP {
  if (level === 'Yüksek') return cp('red', isDark);
  if (level === 'Orta')   return cp('yellow', isDark);
  return cp('gray', isDark);
}

export function getLeagueCharacter(avgGoals: number, drawRate: number, isDark = false): LeagueChar {
  const gol: Level   = avgGoals >= 2.8 ? 'Yüksek' : avgGoals >= 2.2 ? 'Orta' : 'Düşük';
  const tempo: Level = avgGoals >= 2.7 ? 'Yüksek' : avgGoals >= 2.2 ? 'Orta' : 'Düşük';
  const risk: Level  = drawRate >= 0.30 ? 'Yüksek' : drawRate >= 0.25 ? 'Orta' : 'Düşük';
  const stil         = gol === 'Yüksek' ? 'Hücumcu' : gol === 'Düşük' ? 'Savunmacı' : 'Dengeli';

  let label: string, color: string, bg: string, traits: string[], rec: string, ozet: string;

  if (avgGoals >= 3.0) {
    label = 'Hücum Ağırlıklı'; ({ color, bg } = cp('red', isDark));
    traits = ['Yüksek gol ortalaması', 'Over 2.5 eğilimi güçlü', 'Savunma açıkları belirgin'];
    rec  = 'Over 2.5, KG Var kombinasyonları öne çıkar';
    ozet = 'Yüksek tempolu ve gollü bir lig. Savunmalar açık, her iki kale tehlikede — favoriler baskı kuruyor.';
  } else if (avgGoals < 2.0 && drawRate >= 0.28) {
    label = 'Savunma & Sıkışık'; ({ color, bg } = cp('green', isDark));
    traits = ['Az gol, beraberlik eğilimi yüksek', 'Alt 2.5 çok sık', 'Favori avantajı sınırlı'];
    rec  = 'Alt 2.5 ve çift şans senaryoları veriyle uyumlu';
    ozet = 'Sıkı savunma anlayışı ve yüksek beraberlik oranıyla öne çıkan bir lig. Sürpriz sonuçlar sık yaşanıyor.';
  } else if (avgGoals < 2.0) {
    label = 'Savunma Ağırlıklı'; ({ color, bg } = cp('green', isDark));
    traits = ['Düşük gol ortalaması', 'Sıkı savunma anlayışı', 'Net sonuçlar ağırlıkta'];
    rec  = "Alt 2.5, maç galibi — over'dan kaçın";
    ozet = 'Savunma disiplini ön planda; gol sayısı düşük. Maçlar sıkışık seyrediyor, net galibiyetler belirleyici.';
  } else if (drawRate >= 0.30) {
    label = 'Beraberlik Eğilimli'; ({ color, bg } = cp('purple', isDark));
    traits = ['Yüksek beraberlik oranı', 'Sonuç belirsizliği fazla', 'Güçlü savunma dengeleri'];
    rec  = 'Beraberlik, çift şans — net galibiyet riski var';
    ozet = 'Beraberlikler sık, sonuçlar belirsiz. Dengeli güç dağılımı sürprizlere zemin hazırlıyor.';
  } else if (avgGoals >= 2.5 && drawRate <= 0.24) {
    label = 'Hücumcu & Sonuç Odaklı'; ({ color, bg } = cp('yellow', isDark));
    traits = ['Gollü ve net galibiyetli', 'Takımlar arası fark belirgin', 'Over + galibiyet birlikte güçlü'];
    rec  = 'Over 2.5 + maç galibi kombinasyonu etkili';
    ozet = 'Gollü ve sonuç odaklı bir lig. Favoriler genelde kazanıyor; güçlü takımlar farkı büyütüyor.';
  } else {
    label = 'Dengeli'; ({ color, bg } = cp('blue', isDark));
    traits = ['Dengeli hücum-savunma', 'Çeşitli sonuç profilleri', 'Maç özelinde analiz gerekli'];
    rec  = 'Maç bazında değerlendirme yapılmalı';
    ozet = 'Dengeli yapıda bir lig. Hücum ve savunma birbirine yakın; maç özelinde derin analiz şart.';
  }

  return { label, color, bg, traits, rec, ozet, gol, tempo, risk, stil };
}

export function getLiderTags(
  leader: LeagueStanding,
  sortedByGfR: LeagueStanding[],
  sortedByGaR: LeagueStanding[],
  leaderGap: number,
  isDark = false,
): { label: string; color: string; bg: string }[] {
  const tags: { label: string; color: string; bg: string }[] = [];
  const winRate     = leader.played > 0 ? leader.win / leader.played : 0;
  const isTopScorer = sortedByGfR[0]?.team === leader.team;
  const isBestDef   = sortedByGaR[0]?.team === leader.team;

  if (isTopScorer)       tags.push({ label: '⚽ En Golcü',        ...cp('red',    isDark) });
  if (isBestDef)         tags.push({ label: '🛡️ Sağlam Savunma', ...cp('green',  isDark) });
  if (winRate >= 0.65)   tags.push({ label: '🔥 Dominant',        ...cp('yellow', isDark) });
  if (leaderGap >= 8)    tags.push({ label: '📏 Açık Ara Lider',  ...cp('purple', isDark) });
  if (leader.loss === 0) tags.push({ label: '✅ Yenilmez',        ...cp('blue',   isDark) });
  if (tags.length === 0) tags.push({ label: '🏆 Lider',           ...cp('blue',   isDark) });

  return tags;
}

export function getTeamPersonality(lblLabel: string, avgGf: number, avgGa: number, winRate: number, avgLeagueGfPer: number): string {
  const winPct = Math.round(winRate * 100);
  if (lblLabel === 'Formda')             return `${winPct}% galibiyet oranı — bu sezonun en tutarlı takımlarından.`;
  if (lblLabel === 'Hücumcu & Kırılgan') return `${avgGf.toFixed(1)} gol atıp ${avgGa.toFixed(1)} gol yiyor — tahmin etmesi güç profil.`;
  if (lblLabel === 'Hücumcu')            return `${avgGf.toFixed(1)} gol/maç — takım başına lig ort. (${avgLeagueGfPer.toFixed(1)}) üzerinde hücum üretimi.`;
  if (lblLabel === 'Savunmacı')          return `Maç başı yalnızca ${avgGa.toFixed(1)} gol yiyen sıkı savunma profili.`;
  if (lblLabel === 'Dengesiz')           return `${winPct}% galibiyet — istikrarsız yapı, sürprizlere açık.`;
  return 'Dengeli skor profili; büyük sürpriz ya da hayal kırıklığı beklentisi düşük.';
}

export function getLeaderNarrative(leader: LeagueStanding, second: LeagueStanding | undefined): string {
  const winRate = leader.played > 0 ? leader.win / leader.played : 0;
  const gfPer   = leader.played > 0 ? leader.gf / leader.played : 0;
  const gaPer   = leader.played > 0 ? leader.ga / leader.played : 0;
  const gap     = second ? leader.pts - second.pts : 0;
  if (leader.loss === 0)  return `${leader.played} maçta yenilmedi — sezonun en istikrarlı takımı.`;
  if (winRate >= 0.70)    return `Her 10 maçtan ${Math.round(winRate * 10)}'ini kazanıyor — ligin tartışmasız lideri.`;
  if (gfPer >= 2.5)       return `Maç başı ${gfPer.toFixed(1)} golle ligin golcü motoru.`;
  if (gaPer < 0.9)        return `Savunma gücüyle öne çıkıyor — maç başı yalnızca ${gaPer.toFixed(1)} gol yiyor.`;
  if (gap >= 8)           return `İkinciden ${gap} puan önde — şampiyonluğa en yakın aday.`;
  return `${gap} puanlık avantajla önde, tablo henüz netleşmedi.`;
}

export function getTeamLabel(gfPer: number, gaPer: number, winRate: number, pos: number, total: number, avgGfPer: number, avgGaPer: number, isDark = false) {
  if (winRate >= 0.60)                                        return { label: 'Formda',             ...cp('blue',   isDark) };
  if (gfPer >= avgGfPer * 1.25 && gaPer >= avgGaPer * 1.15) return { label: 'Hücumcu & Kırılgan', ...cp('yellow', isDark) };
  if (gfPer >= avgGfPer * 1.20)                              return { label: 'Hücumcu',            ...cp('red',    isDark) };
  if (gaPer <= avgGaPer * 0.80)                              return { label: 'Savunmacı',          ...cp('green',  isDark) };
  if (winRate < 0.25 && pos > total * 0.60)                  return { label: 'Dengesiz',           ...cp('red',    isDark) };
  return                                                             { label: 'Dengeli',            ...cp('gray',   isDark) };
}
