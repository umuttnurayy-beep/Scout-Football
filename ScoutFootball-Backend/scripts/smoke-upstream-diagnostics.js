#!/usr/bin/env node

const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'https://scoutfootball-backend-production.up.railway.app';
const baseUrl = (process.env.SCOUT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const diagnosticsSecret = process.env.DIAGNOSTICS_SECRET;

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK   ${message}`);
}

function assert(condition, message) {
  if (condition) ok(message);
  else fail(message);
}

async function readJson(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch (error) {
    throw new Error(`${url} returned non-JSON response (${res.status})`);
  }
  return { status: res.status, payload };
}

function validateStats(payload) {
  assert(payload && payload.ok === true, '/diagnostics/upstream authorized response is ok');
  assert(payload.upstream && typeof payload.upstream === 'object', '/diagnostics/upstream includes upstream object');
  assert(typeof payload.upstream.startedCount === 'number', 'startedCount is a number');
  assert(typeof payload.upstream.dedupedCount === 'number', 'dedupedCount is a number');
  assert(typeof payload.upstream.inFlightCount === 'number', 'inFlightCount is a number');
  assert(payload.upstream.byLabel && typeof payload.upstream.byLabel === 'object' && !Array.isArray(payload.upstream.byLabel), 'byLabel is an object');
  assert(payload.cache && typeof payload.cache === 'object', '/diagnostics/upstream includes cache metrics');
  assert(typeof payload.cache.hitCount === 'number', 'cache.hitCount is a number');
  assert(typeof payload.cache.missCount === 'number', 'cache.missCount is a number');
  assert(typeof payload.cache.staleHitCount === 'number', 'cache.staleHitCount is a number');
  assert(typeof payload.cache.staleMissCount === 'number', 'cache.staleMissCount is a number');
  assert(typeof payload.cache.setCount === 'number', 'cache.setCount is a number');
  assert(typeof payload.cache.dedupeStartedCount === 'number', 'cache.dedupeStartedCount is a number');
  assert(typeof payload.cache.dedupeSharedCount === 'number', 'cache.dedupeSharedCount is a number');
  assert(typeof payload.cache.inFlightCount === 'number', 'cache.inFlightCount is a number');
  assert(payload.cache.byPrefix && typeof payload.cache.byPrefix === 'object' && !Array.isArray(payload.cache.byPrefix), 'cache.byPrefix is an object');
  assert(payload.cachePolicy && typeof payload.cachePolicy === 'object', '/diagnostics/upstream includes cache policy');
  assert(payload.cachePolicy.live && typeof payload.cachePolicy.live.ttlMs === 'number', 'cachePolicy.live.ttlMs is a number');
  assert(payload.cachePolicy.live.realtime === true, 'cachePolicy.live is marked realtime');
  assert(payload.cachePolicy.odds && typeof payload.cachePolicy.odds.refresh === 'string', 'cachePolicy.odds includes refresh note');
  assert(payload.fallbacks && typeof payload.fallbacks === 'object', '/diagnostics/upstream includes fallback metrics');
  assert(typeof payload.fallbacks.staleServedCount === 'number', 'fallbacks.staleServedCount is a number');
  assert(typeof payload.fallbacks.errorWithoutStaleCount === 'number', 'fallbacks.errorWithoutStaleCount is a number');
  assert(payload.fallbacks.byCode && typeof payload.fallbacks.byCode === 'object' && !Array.isArray(payload.fallbacks.byCode), 'fallbacks.byCode is an object');
  assert(payload.fallbacks.byCachePrefix && typeof payload.fallbacks.byCachePrefix === 'object' && !Array.isArray(payload.fallbacks.byCachePrefix), 'fallbacks.byCachePrefix is an object');
  assert(payload.buildHistory && typeof payload.buildHistory === 'object', '/diagnostics/upstream includes buildHistory');
  assert(payload.buildHistory.summary && typeof payload.buildHistory.summary === 'object', 'buildHistory.summary is an object');
  assert(typeof payload.buildHistory.summary.total === 'number', 'buildHistory.summary.total is a number');
  assert(typeof payload.buildHistory.summary.withIssues === 'number', 'buildHistory.summary.withIssues is a number');
  assert(typeof payload.buildHistory.summary.withWarnings === 'number', 'buildHistory.summary.withWarnings is a number');
  assert(typeof payload.buildHistory.summary.staleServed === 'number', 'buildHistory.summary.staleServed is a number');
  assert(typeof payload.buildHistory.summary.withNextPreview === 'number', 'buildHistory.summary.withNextPreview is a number');
  assert(payload.buildHistory.summary.bySeverity && typeof payload.buildHistory.summary.bySeverity === 'object', 'buildHistory.summary.bySeverity is an object');
  assert(typeof payload.buildHistory.summary.bySeverity.warning === 'number', 'buildHistory.summary.bySeverity.warning is a number');
  assert(typeof payload.buildHistory.summary.bySeverity.error === 'number', 'buildHistory.summary.bySeverity.error is a number');
  assert(payload.buildHistory.summary.nextPreviewBySource && typeof payload.buildHistory.summary.nextPreviewBySource === 'object', 'buildHistory.summary.nextPreviewBySource is an object');
  assert(typeof payload.buildHistory.summary.nextPreviewBySource.fresh === 'number', 'buildHistory.summary.nextPreviewBySource.fresh is a number');
  assert(typeof payload.buildHistory.summary.nextPreviewBySource.cache === 'number', 'buildHistory.summary.nextPreviewBySource.cache is a number');
  assert(typeof payload.buildHistory.summary.nextPreviewBySource.stale === 'number', 'buildHistory.summary.nextPreviewBySource.stale is a number');
  assert(Array.isArray(payload.buildHistory.recent), 'buildHistory.recent is an array');
  if (payload.buildHistory.recent.length > 0) {
    const recent = payload.buildHistory.recent[0];
    assert(typeof recent.date === 'string', 'buildHistory.recent[0].date is a string');
    assert(typeof recent.generatedAt === 'string', 'buildHistory.recent[0].generatedAt is a string');
    assert(typeof recent.matchCount === 'number', 'buildHistory.recent[0].matchCount is a number');
    assert(Array.isArray(recent.issues), 'buildHistory.recent[0].issues is an array');
    assert(Array.isArray(recent.sourceWarnings), 'buildHistory.recent[0].sourceWarnings is an array');
    assert(
      recent.sourceSeverity === null || ['warning', 'error'].includes(recent.sourceSeverity),
      'buildHistory.recent[0].sourceSeverity is known or null',
    );
    assert(typeof recent.stale === 'boolean', 'buildHistory.recent[0].stale is a boolean');
    assert(
      recent.featuredMatchId === null || typeof recent.featuredMatchId === 'number',
      'buildHistory.recent[0].featuredMatchId is a number or null',
    );
    assert(
      recent.nextPreviewDate === null || typeof recent.nextPreviewDate === 'string',
      'buildHistory.recent[0].nextPreviewDate is a string or null',
    );
    assert(
      recent.nextPreviewFeaturedMatchId === null || typeof recent.nextPreviewFeaturedMatchId === 'number',
      'buildHistory.recent[0].nextPreviewFeaturedMatchId is a number or null',
    );
    assert(
      recent.nextPreviewSource === null || ['fresh', 'cache', 'stale'].includes(recent.nextPreviewSource),
      'buildHistory.recent[0].nextPreviewSource is known or null',
    );
  }
}

async function main() {
  if (!diagnosticsSecret) {
    fail('DIAGNOSTICS_SECRET env is required for authorized diagnostics smoke test');
    return;
  }

  console.log(`Base URL: ${baseUrl}`);

  const forbidden = await readJson('/diagnostics/upstream');
  assert(forbidden.status === 403, '/diagnostics/upstream rejects requests without secret');
  assert(forbidden.payload?.ok === false, '/diagnostics/upstream forbidden response is an error envelope');

  const authorized = await readJson('/diagnostics/upstream', {
    headers: { 'x-diagnostics-secret': diagnosticsSecret },
  });
  assert(authorized.status === 200, '/diagnostics/upstream accepts valid diagnostics secret');
  validateStats(authorized.payload);

  if (process.exitCode) return;
  console.log('Upstream diagnostics smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
