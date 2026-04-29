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
  assert(payload.fallbacks && typeof payload.fallbacks === 'object', '/diagnostics/upstream includes fallback metrics');
  assert(typeof payload.fallbacks.staleServedCount === 'number', 'fallbacks.staleServedCount is a number');
  assert(typeof payload.fallbacks.errorWithoutStaleCount === 'number', 'fallbacks.errorWithoutStaleCount is a number');
  assert(payload.fallbacks.byCode && typeof payload.fallbacks.byCode === 'object' && !Array.isArray(payload.fallbacks.byCode), 'fallbacks.byCode is an object');
  assert(payload.fallbacks.byCachePrefix && typeof payload.fallbacks.byCachePrefix === 'object' && !Array.isArray(payload.fallbacks.byCachePrefix), 'fallbacks.byCachePrefix is an object');
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
