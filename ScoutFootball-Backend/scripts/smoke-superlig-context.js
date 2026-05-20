#!/usr/bin/env node

const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'https://scout-football-backend.onrender.com';
const DEFAULT_TEAM_IDS = [138092, 133794]; // Gaziantep FK, Besiktas

const baseUrl = (process.env.SCOUT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const args = process.argv.slice(2);
const checkAllTeams = args.includes('--all');
const requireEspn = args.includes('--require-espn') || process.env.REQUIRE_ESPN === '1';
const teamIds = args
  .filter(arg => !arg.startsWith('--'))
  .map(id => parseInt(id))
  .filter(Boolean);
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

function validateContext(payload, teamId, standingRow = null) {
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
  if (standingRow?.team && context.standingsStats?.team && context.standingsStats.team !== standingRow.team) {
    warn(`team ${teamId}: standings name mismatch (${standingRow.team} -> ${context.standingsStats.team})`);
  }
  if (requireEspn) {
    assert(context.source === 'espn', `team ${teamId}: source is espn`);
  } else if (context.source !== 'espn') {
    warn(`team ${teamId}: source is ${context.source}, ESPN mapping may be missing or fallback was used`);
  }
  return context;
}

async function loadTargetTeams() {
  if (!checkAllTeams) return targetTeamIds.map(teamId => ({ teamId }));
  const standings = unwrap(await readJson('/superlig/standings'));
  assert(Array.isArray(standings), '/superlig/standings returns an array');
  const teams = standings
    .map(row => ({ teamId: parseInt(row.teamId), team: row.team, row }))
    .filter(item => item.teamId);
  assert(teams.length >= 16, '/superlig/standings exposes current league teams');
  const uniqueIds = new Set(teams.map(item => item.teamId));
  assert(uniqueIds.size === teams.length, '/superlig/standings team IDs are unique');
  return teams;
}

async function main() {
  console.log('ScoutFootball Super Lig context smoke');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Mode: ${checkAllTeams ? 'all standings teams' : 'selected teams'}`);
  console.log(`Require ESPN source: ${requireEspn ? 'yes' : 'no'}`);
  if (!checkAllTeams) console.log(`Team IDs: ${targetTeamIds.join(', ')}`);
  console.log('');

  const health = unwrap(await readJson('/health'));
  assert(health && health.status === 'ok', '/health status is ok');
  if (health && health.mongo !== true) warn('/health mongo is not true');
  assert(health?.seasons && typeof health.seasons === 'object', '/health seasons metadata exists');

  const targetTeams = await loadTargetTeams();
  const contexts = [];
  for (const target of targetTeams) {
    const teamId = target.teamId;
    console.log('');
    const context = validateContext(
      await readJson(`/superlig/team-context/${encodeURIComponent(teamId)}`),
      teamId,
      target.row,
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
