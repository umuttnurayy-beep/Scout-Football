import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'scout_pick_history_v1';
const MAX_PICKS = 50;

export interface SavedPick {
  id: string;
  date: string;           // YYYY-MM-DD
  homeTeam: string;
  awayTeam: string;
  pickLabel: string;
  pickTone: 'home' | 'away' | 'draw' | 'goals' | 'caution';
  isSuperLig: boolean;
  savedAt: string;        // ISO timestamp
  result?: {
    homeScore: number;
    awayScore: number;
    correct: boolean;
    resolvedAt: string;
  };
}

export function verifyPick(
  tone: string,
  label: string,
  homeScore: number,
  awayScore: number,
): boolean {
  if (tone === 'home')  return homeScore >= awayScore;
  if (tone === 'away')  return awayScore >= homeScore;
  if (tone === 'goals') {
    if (label.includes('Karşılıklı')) return homeScore > 0 && awayScore > 0;
    return homeScore + awayScore >= 3;
  }
  if (tone === 'draw')  return homeScore + awayScore <= 2;
  return false;
}

export async function loadPickHistory(): Promise<SavedPick[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedPick[];
  } catch {
    return [];
  }
}

export async function isPickSaved(id: string): Promise<boolean> {
  const picks = await loadPickHistory();
  return picks.some(p => p.id === id);
}

export async function savePick(pick: SavedPick): Promise<boolean> {
  try {
    const existing = await loadPickHistory();
    if (existing.some(p => p.id === pick.id)) return false;
    const updated = [pick, ...existing].slice(0, MAX_PICKS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

export async function resolvePickResults(
  fetchScore: (pick: SavedPick) => Promise<{ home: number; away: number } | null>,
): Promise<void> {
  try {
    const existing = await loadPickHistory();
    const today = new Date().toISOString().split('T')[0];
    let changed = false;

    const updated = await Promise.all(
      existing.map(async p => {
        if (p.result || p.date >= today || p.pickTone === 'caution') return p;
        const score = await fetchScore(p);
        if (!score) return p;
        changed = true;
        return {
          ...p,
          result: {
            homeScore: score.home,
            awayScore: score.away,
            correct: verifyPick(p.pickTone, p.pickLabel, score.home, score.away),
            resolvedAt: new Date().toISOString(),
          },
        };
      }),
    );

    if (changed) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {}
}

export async function clearPickHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// Şu an devam eden hafta (Pzt–Paz, bugün dahil) — auto-save kontrolü için
export function getCurrentWeekRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Paz, 1=Pzt...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const dayFmt = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return { start: fmt(monday), end: fmt(sunday), label: `${dayFmt(monday)} – ${dayFmt(sunday)}` };
}

// Performans ekranı için: offset=0 → son tamamlanmış Pzt-Paz haftası.
// Haftanın kapanması için Pazartesi gelmiş olması gerekir; Pazar günü bile geçen hafta görünür.
export function getWeekRange(weekOffset: number): { start: string; end: string; label: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Paz, 1=Pzt, ..., 6=Cmt
  // Bugünden son Pazar'a kaç gün geçti (Pazartesi=1 → 1 gün; Pazar=0 → 7 gün)
  const daysSinceSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
  // Son Pazar + offset haftası = hedef haftanın Pazar'ı
  const anchor = new Date(today);
  anchor.setDate(today.getDate() - daysSinceSunday + weekOffset * 7);
  anchor.setHours(0, 0, 0, 0);
  const sunday = anchor;
  const monday = new Date(sunday);
  monday.setDate(sunday.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const dayFmt = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return { start: fmt(monday), end: fmt(sunday), label: `${dayFmt(monday)} – ${dayFmt(sunday)}` };
}

export function filterPicksForWeek(picks: SavedPick[], start: string, end: string): SavedPick[] {
  return picks.filter(p => p.date >= start && p.date <= end);
}

export function groupPicksByDay(picks: SavedPick[]): { date: string; picks: SavedPick[] }[] {
  const map: Record<string, SavedPick[]> = {};
  for (const p of picks) {
    if (!map[p.date]) map[p.date] = [];
    map[p.date].push(p);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, picks]) => ({ date, picks }));
}

export function pickAccuracy(picks: SavedPick[]): { correct: number; total: number; pct: number } {
  const resolved = picks.filter(p => p.result !== undefined && p.pickTone !== 'caution');
  const correct = resolved.filter(p => p.result!.correct).length;
  return {
    correct,
    total: resolved.length,
    pct: resolved.length > 0 ? Math.round((correct / resolved.length) * 100) : 0,
  };
}
