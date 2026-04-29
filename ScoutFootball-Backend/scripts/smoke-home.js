#!/usr/bin/env node

const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'https://scoutfootball-backend-production.up.railway.app';
const SUPPORTED_COMPETITIONS = new Set([2021, 2014, 2002, 2019, 2015, 2001]);

const baseUrl = (process.env.SCOUT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const date = process.argv[2] || new Date().toISOString().slice(0, 10);

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

async function main() {
  console.log(`ScoutFootball /home smoke`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Date: ${date}`);
  console.log('');

  const health = unwrap(await readJson('/health'));
  assert(health && health.status === 'ok', '/health status is ok');
  if (health && health.mongo !== true) warn('/health mongo is not true');

  const first = validateHomePayload(await readJson(`/home?date=${encodeURIComponent(date)}`), 'first /home');
  const second = validateHomePayload(await readJson(`/home?date=${encodeURIComponent(date)}`), 'second /home');

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
  console.log(`stale: ${first.stale}`);
  console.log(`generatedAt: ${first.generatedAt}`);

  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(error => {
  fail(error.message || String(error));
  process.exit(process.exitCode || 1);
});
