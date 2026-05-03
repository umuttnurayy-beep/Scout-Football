jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isArrayOf, readTimedCache, writeTimedCache } from '../utils/timedCache';

const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;

function isRow(value: unknown): value is { id: number; name: string } {
  if (!value || typeof value !== 'object') return false;
  const row = value as { id?: unknown; name?: unknown };
  return typeof row.id === 'number' && typeof row.name === 'string';
}

describe('timed cache helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-03T12:00:00Z'));
    jest.clearAllMocks();
    setItemMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns valid cached data inside TTL', async () => {
    getItemMock.mockResolvedValue(JSON.stringify({
      ts: Date.now() - 1_000,
      data: [{ id: 1, name: 'A' }],
    }));

    await expect(readTimedCache('key', 60_000, isArrayOf(isRow)))
      .resolves.toEqual([{ id: 1, name: 'A' }]);
  });

  it('rejects missing, malformed, expired, and shape-invalid cache payloads', async () => {
    getItemMock.mockResolvedValueOnce(null);
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow))).resolves.toBeNull();

    getItemMock.mockResolvedValueOnce('{not json');
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow))).resolves.toBeNull();

    getItemMock.mockResolvedValueOnce(JSON.stringify({ data: [{ id: 1, name: 'A' }] }));
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow))).resolves.toBeNull();

    getItemMock.mockResolvedValueOnce(JSON.stringify({ ts: Date.now() - 120_000, data: [{ id: 1, name: 'A' }] }));
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow))).resolves.toBeNull();

    getItemMock.mockResolvedValueOnce(JSON.stringify({ ts: Date.now(), data: [{ id: 'bad', name: 'A' }] }));
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow))).resolves.toBeNull();

    getItemMock.mockResolvedValueOnce('false');
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow))).resolves.toBeNull();

    getItemMock.mockResolvedValueOnce('[]');
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow))).resolves.toBeNull();
  });

  it('rejects non-finite timestamps and missing custom payload keys', async () => {
    getItemMock.mockResolvedValueOnce(JSON.stringify({
      ts: Number.POSITIVE_INFINITY,
      data: [{ id: 1, name: 'A' }],
    }));
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow))).resolves.toBeNull();

    getItemMock.mockResolvedValueOnce(JSON.stringify({
      ts: Date.now(),
      data: [{ id: 1, name: 'A' }],
    }));
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow), 'rows')).resolves.toBeNull();
  });

  it('returns null when JSON.parse produces a non-object primitive', async () => {
    // JSON.parse('null') returns null (not an object) — covers the typeof check on line 12
    getItemMock.mockResolvedValueOnce('null');
    await expect(readTimedCache('key', 60_000, isArrayOf(isRow))).resolves.toBeNull();
  });

  it('writes timestamped cache payloads and swallows storage failures', () => {
    writeTimedCache('key', [{ id: 1, name: 'A' }]);

    expect(setItemMock).toHaveBeenCalledWith(
      'key',
      JSON.stringify({ ts: Date.now(), data: [{ id: 1, name: 'A' }] }),
    );

    setItemMock.mockReturnValueOnce(Promise.reject(new Error('disk full')));
    expect(() => writeTimedCache('key', [])).not.toThrow();
  });

  it('supports custom payload keys for legacy cache shapes', async () => {
    getItemMock.mockResolvedValueOnce(JSON.stringify({
      ts: Date.now() - 1_000,
      rows: [{ id: 1, name: 'A' }],
    }));

    await expect(readTimedCache('key', 60_000, isArrayOf(isRow), 'rows'))
      .resolves.toEqual([{ id: 1, name: 'A' }]);

    writeTimedCache('key', [{ id: 2, name: 'B' }], 'rows');

    expect(setItemMock).toHaveBeenLastCalledWith(
      'key',
      JSON.stringify({ ts: Date.now(), rows: [{ id: 2, name: 'B' }] }),
    );
  });
});
