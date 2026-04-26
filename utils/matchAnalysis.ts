export type Stil = 'Hücumcu' | 'Savunmacı' | 'Dengeli';
export type Level = 'Düşük' | 'Orta' | 'Yüksek';

export const MIN_H2H = 3;

export interface MatchFormStats {
  total: number;
  totalAvgGf: string | number;
  totalAvgGa: string | number;
  over25Pct: number;
  kgVarPct: number;
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
  return arr[Math.abs(hash) % arr.length];
}

export function getPersona(stil: Stil, gol: Level, tempo: Level, risk: Level): string {
  if (gol === 'Yüksek' && tempo === 'Yüksek') return 'acik';
  if (gol === 'Düşük') return 'kilitli';
  if (risk === 'Yüksek') return 'surpriz';
  if (stil === 'Hücumcu' && risk === 'Düşük') return 'favori';
  if (stil === 'Savunmacı') return 'savunma';
  return 'dengeli';
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
): string[] {
  const hAtk = parseFloat(hSt.totalAvgGf as string);
  const aAtk = parseFloat(aSt.totalAvgGf as string);
  const hDef = parseFloat(hSt.totalAvgGa as string);
  const aDef = parseFloat(aSt.totalAvgGa as string);
  const pool: string[] = [];

  if (Math.abs(hAtk - aAtk) < 0.25) {
    pool.push(`İki takımın gol üretimi birbirine yakın (${hAtk} - ${aAtk} ort.).`);
  } else {
    const lead = hAtk > aAtk ? home : away;
    pool.push(`${lead} gol ortalamasında önde (${Math.max(hAtk,aAtk).toFixed(1)} vs ${Math.min(hAtk,aAtk).toFixed(1)}).`);
  }
  if (Math.abs(hDef - aDef) < 0.25) {
    pool.push('Savunma istatistikleri birbirine yakın; belirgin savunma avantajı yok.');
  } else {
    const better = hDef < aDef ? home : away;
    pool.push(`${better} savunmada daha sağlam (${Math.min(hDef,aDef).toFixed(1)} vs ${Math.max(hDef,aDef).toFixed(1)} yenilen ort.).`);
  }
  if (Math.abs(hFP - aFP) <= 2) {
    pool.push(`Son 5 maç form dengesi yakın (${hFP} - ${aFP} puan).`);
  } else {
    const fLead = hFP > aFP ? home : away;
    pool.push(`${fLead} son 5 maçta daha istikrarlı (${Math.max(hFP,aFP)} puan vs ${Math.min(hFP,aFP)}).`);
  }
  if (h2hCount >= MIN_H2H) {
    pool.push(`H2H geçmişi ${h2hCount} maçlık veri sunuyor; tarihsel kalıplar da değerlendirildi.`);
  } else {
    pool.push('Doğrudan karşılaşma verisi sınırlı; sezon istatistikleri öne alındı.');
  }
  const avgOver = (hSt.over25Pct + aSt.over25Pct) / 2;
  const avgKg   = (hSt.kgVarPct  + aSt.kgVarPct)  / 2;
  if (avgOver >= 60) pool.push(`2.5 üst trendi tutarlı (ort. %${Math.round(avgOver)}).`);
  else if (avgOver <= 35) pool.push(`Alt trendi belirgin (2.5 üst ort. %${Math.round(avgOver)}).`);
  else if (avgKg >= 58)  pool.push(`KG Var eğilimi öne çıkıyor (ort. %${Math.round(avgKg)}).`);
  else pool.push('Over/BTTS istatistikleri dengede; her iki senaryo geçerli.');

  const offset = hash % pool.length;
  return [0, 1, 2].map(i => pool[(offset + i) % pool.length]);
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
