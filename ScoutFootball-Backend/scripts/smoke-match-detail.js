#!/usr/bin/env node

const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'https://scout-football-backend.onrender.com';
const baseUrl = (process.env.SCOUT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const matchId = process.argv[2];

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

function teamLabel(team) {
  return team?.shortName || team?.name || '-';
}

async function main() {
  if (!matchId) {
    fail('usage: node scripts/smoke-match-detail.js <matchId>');
    process.exit(1);
  }

  console.log('ScoutFootball match detail smoke');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Match ID: ${matchId}`);
  console.log('');

  const health = unwrap(await readJson('/health'));
  assert(health && health.status === 'ok', '/health status is ok');
  if (health && health.mongo !== true) warn('/health mongo is not true');

  const match = unwrap(await readJson(`/match/${encodeURIComponent(matchId)}`));
  assert(match && typeof match === 'object', '/match/:id returned match object');
  assert(Boolean(match?.homeTeam?.id), 'homeTeam.id exists');
  assert(Boolean(match?.awayTeam?.id), 'awayTeam.id exists');

  const homeTeamId = match?.homeTeam?.id;
  const awayTeamId = match?.awayTeam?.id;

  const [homeForm, awayForm, h2h] = await Promise.all([
    homeTeamId ? readJson(`/team/${encodeURIComponent(homeTeamId)}/matches`).then(unwrap) : Promise.resolve([]),
    awayTeamId ? readJson(`/team/${encodeURIComponent(awayTeamId)}/matches`).then(unwrap) : Promise.resolve([]),
    readJson(`/h2h/${encodeURIComponent(matchId)}`).then(unwrap),
  ]);

  assert(Array.isArray(homeForm), 'home team form endpoint returns array');
  assert(Array.isArray(awayForm), 'away team form endpoint returns array');
  assert(Array.isArray(h2h), 'h2h endpoint returns array');

  if (Array.isArray(homeForm) && homeForm.length === 0) warn('home team form is empty');
  if (Array.isArray(awayForm) && awayForm.length === 0) warn('away team form is empty');
  if (Array.isArray(h2h) && h2h.length === 0) warn('h2h is empty');

  console.log('');
  console.log('Summary');
  console.log(`match: ${teamLabel(match.homeTeam)} - ${teamLabel(match.awayTeam)}`);
  console.log(`competition: ${match?.competition?.name || '-'} (${match?.competition?.id || '-'})`);
  console.log(`status: ${match?.status || '-'}`);
  console.log(`stage: ${match?.stage || '-'}`);
  console.log(`utcDate: ${match?.utcDate || '-'}`);
  console.log(`homeFormTeamId: ${homeTeamId || '-'}`);
  console.log(`awayFormTeamId: ${awayTeamId || '-'}`);
  console.log(`homeFormCount: ${Array.isArray(homeForm) ? homeForm.length : 0}`);
  console.log(`awayFormCount: ${Array.isArray(awayForm) ? awayForm.length : 0}`);
  console.log(`h2hCount: ${Array.isArray(h2h) ? h2h.length : 0}`);

  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(error => {
  fail(error.message || String(error));
  process.exit(process.exitCode || 1);
});
