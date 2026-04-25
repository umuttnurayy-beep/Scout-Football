export type Stil = 'Hücumcu' | 'Savunmacı' | 'Dengeli';
export type Level = 'Düşük' | 'Orta' | 'Yüksek';

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
