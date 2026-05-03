export type FavTeam = {
  name: string;
  teamId: number;
  apiId: number;
  leagueName: string;
  leagueFlag: string;
};

export type RecentItem = {
  id: number;
  name: string;
  leagueName: string;
  apiId: number;
  timestamp: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}

export function isFavTeam(value: unknown): value is FavTeam {
  if (!isRecord(value)) return false;
  return typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.teamId === 'number' &&
    Number.isFinite(value.teamId) &&
    typeof value.apiId === 'number' &&
    Number.isFinite(value.apiId) &&
    typeof value.leagueName === 'string' &&
    typeof value.leagueFlag === 'string';
}

export function isRecentItem(value: unknown): value is RecentItem {
  if (!isRecord(value)) return false;
  return typeof value.id === 'number' &&
    Number.isFinite(value.id) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.leagueName === 'string' &&
    typeof value.apiId === 'number' &&
    Number.isFinite(value.apiId) &&
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp);
}

export function parseFavTeam(raw: string | null): FavTeam | null {
  if (!raw) return null;
  const parsed = parseJson(raw);
  return isFavTeam(parsed) ? parsed : null;
}

export function parseFavTeamList(raw: string | null): FavTeam[] {
  if (!raw) return [];
  const parsed = parseJson(raw);
  return Array.isArray(parsed) ? parsed.filter(isFavTeam) : [];
}

export function parseRecentItems(raw: string | null): RecentItem[] {
  if (!raw) return [];
  const parsed = parseJson(raw);
  return Array.isArray(parsed) ? parsed.filter(isRecentItem) : [];
}
