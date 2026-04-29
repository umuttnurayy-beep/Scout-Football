export type DetailDataIssue = 'match' | 'h2h' | 'weather' | 'odds' | 'form';

export function fulfilledOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? (result.value ?? fallback) : fallback;
}

export function hasStaleDetailData(values: unknown[], isStale: (value: unknown) => boolean): boolean {
  return values.some(isStale);
}

export function buildDetailDataIssues({
  matchMissing,
  formRejected,
  h2hRejected,
  weatherRejected,
  oddsRejected = false,
}: {
  matchMissing: boolean;
  formRejected: boolean;
  h2hRejected: boolean;
  weatherRejected: boolean;
  oddsRejected?: boolean;
}): Set<DetailDataIssue> {
  const issues = new Set<DetailDataIssue>();
  if (matchMissing) issues.add('match');
  if (formRejected) issues.add('form');
  if (h2hRejected) issues.add('h2h');
  if (weatherRejected) issues.add('weather');
  if (oddsRejected) issues.add('odds');
  return issues;
}

export function detailIssueFlags(issues: Set<DetailDataIssue>) {
  return {
    hasFormIssue: issues.has('form'),
    hasH2HIssue: issues.has('h2h'),
    hasWeatherIssue: issues.has('weather'),
    hasOddsIssue: issues.has('odds'),
  };
}

type RadarStats = {
  totalAvgGf: string | number;
  totalAvgGa: string | number;
  totalWinPct: number;
  over25Pct: number;
};

export const DETAIL_RADAR_LABELS = ['Hücum', 'Savunma', 'Form', 'Galibiyet', '2.5 Üst'];

function radarValues(stats: RadarStats, formPoints: number) {
  return [
    Math.min(Number(stats.totalAvgGf) / 3, 1),
    Math.max(0, 1 - Number(stats.totalAvgGa) / 3),
    formPoints / 15,
    stats.totalWinPct / 100,
    stats.over25Pct / 100,
  ];
}

function radarScore(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function buildDetailRadar(homeStats: RadarStats, awayStats: RadarStats, homeFormPoints: number, awayFormPoints: number) {
  const homeRadar = radarValues(homeStats, homeFormPoints);
  const awayRadar = radarValues(awayStats, awayFormPoints);
  return {
    homeRadar,
    awayRadar,
    radarLabels: DETAIL_RADAR_LABELS,
    homeLeadsRadar: radarScore(homeRadar) >= radarScore(awayRadar),
  };
}
