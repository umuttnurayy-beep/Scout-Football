#!/usr/bin/env node

const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'https://scoutfootball-backend-production.up.railway.app';
const SUPPORTED_COMPETITIONS = new Set([2021, 2014, 2002, 2019, 2015, 2001]);
const SUPER_LIG_CONTEXT_TEAM_ID = 138092; // Gaziantep FK, often exposes limited SportsDB form data.

const baseUrl = (process.env.SCOUT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const args = process.argv.slice(2);
const requireClean = args.includes('--require-clean');
const dateArg = args.find(arg => !arg.startsWith('--'));
const date = dateArg || new Date().toISOString().slice(0, 10);

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function warn(message) {
  console.warn(`WARN ${message}`);
}

function ok(message) {
  console.log(`OK   ${message}`);
}

function assert(condition, message) {
  if (condition) ok(message);
  else fail(message);
}

async function readJson(path) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  let payload = null;
  try {
    payload = await res.json();
  } catch (error) {
    throw new Error(`${url} returned non-JSON response (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

function unwrap(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data;
  return payload;
}

function validateHomePayload(payload, label) {
  const data = unwrap(payload);
  assert(payload && payload.ok !== false, `${label}: envelope is ok`);
  assert(data && typeof data === 'object', `${label}: data object exists`);
  assert(Array.isArray(data.matches), `${label}: matches is an array`);
  assert(Array.isArray(data.superLigMatches), `${label}: superLigMatches is an array`);
  assert(data.standings && typeof data.standings === 'object' && !Array.isArray(data.standings), `${label}: standings is an object`);
  assert('featuredMatchId' in data, `${label}: featuredMatchId field exists`);
  assert(typeof data.generatedAt === 'string' && data.generatedAt.length > 0, `${label}: generatedAt exists`);
  assert(Array.isArray(data.issues || []), `${label}: issues is an array when present`);
  assert(Array.isArray(data.sourceWarnings || []), `${label}: sourceWarnings is an array when present`);

  const competitionIds = [...new Set((data.matches || []).map(match => match?.competition?.id).filter(Boolean))].sort();
  const unsupported = competitionIds.filter(id => !SUPPORTED_COMPETITIONS.has(id));
  assert(unsupported.length === 0, `${label}: unsupported competition ids are filtered`);

  const standingsKeys = Object.keys(data.standings || {}).sort();
  const next = validateNextPreview(data.nextPreview, label);

  return {
    data,
    matchCount: data.matches.length,
    superLigCount: data.superLigMatches.length,
    competitionIds,
    standingsKeys,
    featuredMatchId: data.featuredMatchId ?? null,
    generatedAt: data.generatedAt,
    stale: Boolean(payload.stale || data.stale),
    issues: Array.isArray(data.issues) ? data.issues : [],
    sourceWarnings: Array.isArray(data.sourceWarnings) ? data.sourceWarnings : [],
    next,
  };
}

function validateNextPreview(nextPreview, label) {
  if (!nextPreview) {
    ok(`${label}: nextPreview is empty`);
    return { exists: false, date: null, matchCount: 0, superLigCount: 0, competitionIds: [] };
  }

  assert(typeof nextPreview.date === 'string' && nextPreview.date.length > 0, `${label}: nextPreview.date exists`);
  assert(Array.isArray(nextPreview.matches), `${label}: nextPreview.matches is an array`);
  assert(Array.isArray(nextPreview.superLigMatches), `${label}: nextPreview.superLigMatches is an array`);

  const competitionIds = [...new Set((nextPreview.matches || []).map(match => match?.competition?.id).filter(Boolean))].sort();
  const unsupported = competitionIds.filter(id => !SUPPORTED_COMPETITIONS.has(id));
  assert(unsupported.length === 0, `${label}: nextPreview unsupported competition ids are filtered`);

  return {
    exists: true,
    date: nextPreview.date,
    matchCount: Array.isArray(nextPreview.matches) ? nextPreview.matches.length : 0,
    superLigCount: Array.isArray(nextPreview.superLigMatches) ? nextPreview.superLigMatches.length : 0,
    competitionIds,
  };
}

function validateSuperLigTeamContext(payload, teamId) {
  const context = unwrap(payload);
  assert(context && typeof context === 'object', '/superlig/team-context/:teamId returns an object');
  assert(context.teamId === teamId, '/superlig/team-context/:teamId preserves teamId');
  assert(Array.isArray(context.recentMatches), '/superlig/team-context/:teamId recentMatches is an array');
  assert(typeof context.formMatchesCount === 'number', '/superlig/team-context/:teamId formMatchesCount is a number');
  assert(context.formMatchesCount === context.recentMatches.length, '/superlig/team-context/:teamId formMatchesCount matches recentMatches length');
  assert(typeof context.isLimited === 'boolean', '/superlig/team-context/:teamId isLimited is boolean');
  assert(['espn', 'allsports', 'sportsdb', 'mixed'].includes(context.source), '/superlig/team-context/:teamId source is known');
  assert('standingsStats' in context, '/superlig/team-context/:teamId standingsStats field exists');

  if (context.isLimited) {
    assert(context.source === 'mixed', '/superlig/team-context/:teamId limited data uses mixed source');
    assert(Boolean(context.fallbackReason), '/superlig/team-context/:teamId limited data explains fallbackReason');
    assert(context.standingsStats && typeof context.standingsStats === 'object', '/superlig/team-context/:teamId limited data includes standingsStats');
  } else {
    assert(context.formMatchesCount >= 5, '/superlig/team-context/:teamId non-limited context has at least 5 form matches');
  }

  return context;
}

async function main() {
  console.log(`ScoutFootball /home smoke`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Date: ${date}`);
  console.log(`Require clean payload: ${requireClean ? 'yes' : 'no'}`);
  console.log('');

  const health = unwrap(await readJson('/health'));
  assert(health && health.status === 'ok', '/health status is ok');
  if (health && health.mongo !== true) warn('/health mongo is not true');
  assert(health?.seasons && typeof health.seasons === 'object', '/health seasons metadata exists');

  const first = validateHomePayload(await readJson(`/home?date=${encodeURIComponent(date)}`), 'first /home');
  const second = validateHomePayload(await readJson(`/home?date=${encodeURIComponent(date)}`), 'second /home');
  const superLigContext = validateSuperLigTeamContext(
    await readJson(`/superlig/team-context/${SUPER_LIG_CONTEXT_TEAM_ID}`),
    SUPER_LIG_CONTEXT_TEAM_ID,
  );

  assert(
    first.featuredMatchId === second.featuredMatchId,
    `featuredMatchId is stable across two calls (${first.featuredMatchId ?? 'null'})`,
  );
  if (first.matchCount + first.superLigCount <= 1 && !first.next.exists) {
    warn('selected day has zero/one match but nextPreview is empty');
  }
  if (first.next.exists && first.next.matchCount + first.next.superLigCount === 0) {
    warn('nextPreview exists but has no matches');
  }
  if (first.issues.length > 0) {
    warn(`/home returned issues: ${first.issues.join(', ')}`);
  }
  if (first.sourceWarnings.length > 0) {
    warn(`/home returned sourceWarnings: ${first.sourceWarnings.join(' | ')}`);
  }
  if (requireClean) {
    assert(first.issues.length === 0, '/home issues is empty in clean mode');
    assert(first.sourceWarnings.length === 0, '/home sourceWarnings is empty in clean mode');
  }

  console.log('');
  console.log('Summary');
  console.log(`matches: ${first.matchCount}`);
  console.log(`superLigMatches: ${first.superLigCount}`);
  console.log(`competitionIds: ${first.competitionIds.join(',') || '-'}`);
  console.log(`standingsKeys: ${first.standingsKeys.join(',') || '-'}`);
  console.log(`featuredMatchId: ${first.featuredMatchId ?? '-'}`);
  console.log(`nextPreviewDate: ${first.next.date || '-'}`);
  console.log(`nextPreviewMatches: ${first.next.matchCount}`);
  console.log(`nextPreviewSuperLigMatches: ${first.next.superLigCount}`);
  console.log(`nextPreviewCompetitionIds: ${first.next.competitionIds.join(',') || '-'}`);
  console.log(`issues: ${first.issues.join(',') || '-'}`);
  console.log(`sourceWarnings: ${first.sourceWarnings.join(' | ') || '-'}`);
  console.log(`superLigContextTeamId: ${superLigContext.teamId}`);
  console.log(`superLigContextSource: ${superLigContext.source}`);
  console.log(`superLigContextLimited: ${superLigContext.isLimited}`);
  console.log(`superLigContextFormCount: ${superLigContext.formMatchesCount}`);
  console.log(`superLigContextStandingsTeam: ${superLigContext.standingsStats?.team || '-'}`);
  console.log(`seasonFootballData: ${health?.seasons?.footballData || '-'}`);
  console.log(`seasonSportsDb: ${health?.seasons?.sportsDb || '-'}`);
  console.log(`seasonDisplay: ${health?.seasons?.display || '-'}`);
  console.log(`stale: ${first.stale}`);
  console.log(`generatedAt: ${first.generatedAt}`);

  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(error => {
  fail(error.message || String(error));
  process.exit(process.exitCode || 1);
});
