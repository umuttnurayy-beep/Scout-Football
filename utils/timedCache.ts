import AsyncStorage from '@react-native-async-storage/async-storage';

type TimedCachePayload<T> = {
  ts: number;
  data: T;
};

function isTimedCachePayload<T>(
  value: unknown,
  isData: (data: unknown) => data is T,
): value is TimedCachePayload<T> {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<TimedCachePayload<T>>;
  return typeof payload.ts === 'number' &&
    Number.isFinite(payload.ts) &&
    isData(payload.data);
}

export async function readTimedCache<T>(
  key: string,
  ttl: number,
  isData: (data: unknown) => data is T,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isTimedCachePayload(parsed, isData)) return null;
    if (Date.now() - parsed.ts > ttl) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeTimedCache(key: string, data: unknown): void {
  AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })).catch(() => {});
}

export function isArrayOf<T>(itemGuard: (item: unknown) => item is T) {
  return (value: unknown): value is T[] => Array.isArray(value) && value.every(itemGuard);
}
