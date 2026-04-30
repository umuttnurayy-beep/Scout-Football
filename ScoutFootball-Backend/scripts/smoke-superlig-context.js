#!/usr/bin/env node

const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'https://scoutfootball-backend-production.up.railway.app';
const DEFAULT_TEAM_IDS = [138092, 133794]; // Gaziantep FK, Besiktas

const baseUrl = (process.env.SCOUT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const teamIds = process.argv.slice(2).map(id => parseInt(id)).filter(Boolean);
const targetTeamIds = teamIds.length > 0 ? teamIds : DEFAULT_TEAM_IDS;

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

function validateContext(payload, teamId) {
  const context = unwrap(payload);
  assert(context && typeof context === 'object', `team ${teamId}: context object exists`);
  assert(context.teamId === teamId, `team ${teamId}: teamId matches`);
  assert(Array.isArray(context.recentMatches), `team ${teamId}: recentMatches is an array`);
  assert(typeof context.formMatchesCount === 'number', `team ${teamId}: formMatchesCount is a number`);
  assert(context.formMatchesCount === context.recentMatches.length, `team ${teamId}: formMatchesCount matches recentMatches length`);
  assert(typeof context.isLimited === 'boolean', `team ${teamId}: isLimited is boolean`);
  assert(['espn', 'allsports', 'sportsdb', 'mixed'].includes(context.source), `team ${teamId}: source is known`);
  assert('standingsStats' in context, `team ${teamId}: standingsStats field exists`);

  if (context.isLimited) {
    assert(context.source === 'mixed', `team ${teamId}: limited data uses mixed source`);
    assert(Boolean(context.fallbackReason), `team ${teamId}: fallbackReason exists`);
    assert(context.standingsStats && typeof context.standingsStats === 'object', `team ${teamId}: standingsStats exists for limited data`);
  } else {
    assert(context.formMatchesCount >= 5, `team ${teamId}: non-limited context has at least 5 form matches`);
  }

  if (!context.standingsStats) warn(`team ${teamId}: standingsStats is empty`);
  return context;
}

async function main() {
  console.log('ScoutFootball Super Lig context smoke');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Team IDs: ${targetTeamIds.join(', ')}`);
  console.log('');

  const health = unwrap(await readJson('/health'));
  assert(health && health.status === 'ok', '/health status is ok');
  if (health && health.mongo !== true) warn('/health mongo is not true');
  assert(health?.seasons && typeof health.seasons === 'object', '/health seasons metadata exists');

  const contexts = [];
  for (const teamId of targetTeamIds) {
    console.log('');
    const context = validateContext(
      await readJson(`/superlig/team-context/${encodeURIComponent(teamId)}`),
      teamId,
    );
    contexts.push(context);
  }

  console.log('');
  console.log('Summary');
  console.log(`seasonFootballData: ${health?.seasons?.footballData || '-'}`);
  console.log(`seasonSportsDb: ${health?.seasons?.sportsDb || '-'}`);
  console.log(`seasonDisplay: ${health?.seasons?.display || '-'}`);
  for (const context of contexts) {
    console.log(
      `team ${context.teamId}: source=${context.source}, limited=${context.isLimited}, form=${context.formMatchesCount}, standings=${context.standingsStats?.team || '-'}`,
    );
  }

  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(error => {
  fail(error.message || String(error));
  process.exit(process.exitCode || 1);
});
