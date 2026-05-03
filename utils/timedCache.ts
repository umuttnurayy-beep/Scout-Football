import AsyncStorage from '@react-native-async-storage/async-storage';

type TimedCachePayload<T> = {
  ts: number;
  [dataKey: string]: T | number;
};

function isTimedCachePayload<T>(
  value: unknown,
  isData: (data: unknown) => data is T,
  dataKey = 'data',
): value is TimedCachePayload<T> {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<TimedCachePayload<T>>;
  return typeof payload.ts === 'number' &&
    Number.isFinite(payload.ts) &&
    isData(payload[dataKey]);
}

export async function readTimedCache<T>(
  key: string,
  ttl: number,
  isData: (data: unknown) => data is T,
  dataKey = 'data',
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isTimedCachePayload(parsed, isData, dataKey)) return null;
    const timestamp = parsed.ts;
    if (typeof timestamp !== 'number' || Date.now() - timestamp > ttl) return null;
    return parsed[dataKey] as T;
  } catch {
    return null;
  }
}

export function writeTimedCache(key: string, data: unknown, dataKey = 'data'): void {
  Promise.resolve(AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), [dataKey]: data }))).catch(() => {});
}

export function isArrayOf<T>(itemGuard: (item: unknown) => item is T) {
  return (value: unknown): value is T[] => Array.isArray(value) && value.every(itemGuard);
}
