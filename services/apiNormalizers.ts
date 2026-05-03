import type { FDMatch, HomeData, SLMatch, Standing } from './api';

export function arrayOrEmpty<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isStanding(value: unknown): value is Standing {
  if (!isRecord(value)) return false;
  return typeof value.team === 'string' &&
    typeof value.pos === 'number' &&
    typeof value.played === 'number' &&
    typeof value.pts === 'number';
}

export function standingsOrEmpty(value: unknown): Standing[] {
  return arrayOrEmpty<unknown>(value).filter(isStanding);
}

export function standingsMapOrEmpty(value: unknown): Record<number, Standing[]> {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<number, Standing[]>>((acc, [key, rows]) => {
    const leagueApiId = Number(key);
    if (!Number.isFinite(leagueApiId)) return acc;
    acc[leagueApiId] = standingsOrEmpty(rows);
    return acc;
  }, {});
}

export function normalizeNextPreview(value: unknown): HomeData['nextPreview'] {
  if (!isRecord(value)) return null;
  if (
    typeof value.date !== 'string' ||
    !Array.isArray(value.matches) ||
    !Array.isArray(value.superLigMatches)
  ) {
    return null;
  }
  const source = value.source === 'fresh' || value.source === 'cache' || value.source === 'stale'
    ? value.source
    : null;
  return {
    date: value.date,
    matches: arrayOrEmpty<FDMatch>(value.matches),
    superLigMatches: arrayOrEmpty<SLMatch>(value.superLigMatches),
    featuredMatchId: typeof value.featuredMatchId === 'number' ? value.featuredMatchId : null,
    source,
  };
}
