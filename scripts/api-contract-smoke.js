const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;

  const mod = new Module(filePath, module);
  mod.filename = filePath;
  mod.paths = Module._nodeModulePaths(path.dirname(filePath));
  mod._compile(output, filePath);
  return mod.exports;
}

function makeResponse(payload, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => payload,
  };
}

function assertObject(value, label) {
  assert.equal(Boolean(value && typeof value === 'object' && !Array.isArray(value)), true, `${label} must be an object`);
}

function assertArray(value, label) {
  assert.equal(Array.isArray(value), true, `${label} must be an array`);
}

function validateMatchContextPayload(payload) {
  assertObject(payload, 'match context payload');
  assertObject(payload.match, 'match context match');
  assertArray(payload.homeForm, 'match context homeForm');
  assertArray(payload.awayForm, 'match context awayForm');
  assertArray(payload.h2h, 'match context h2h');
  assertArray(payload.issues, 'match context issues');
  assert.equal(typeof payload.generatedAt, 'string', 'match context generatedAt must be a string');
}

function validateSuperLigMatchContextPayload(payload) {
  assertObject(payload, 'superlig match context payload');
  assertObject(payload.event, 'superlig match context event');
  assert.equal(payload.homeContext === null || typeof payload.homeContext === 'object', true, 'superlig homeContext must be object or null');
  assert.equal(payload.awayContext === null || typeof payload.awayContext === 'object', true, 'superlig awayContext must be object or null');
  assertArray(payload.h2h, 'superlig match context h2h');
  assertArray(payload.issues, 'superlig match context issues');
  assert.equal(typeof payload.generatedAt, 'string', 'superlig match context generatedAt must be a string');
}

function validateHomePayload(payload) {
  assertObject(payload, 'home payload');
  assert.equal(typeof payload.date, 'string', 'home payload date must be a string');
  assertArray(payload.matches, 'home payload matches');
  assertArray(payload.superLigMatches, 'home payload superLigMatches');
  assertObject(payload.standings, 'home payload standings');
  assert.equal(
    payload.featuredMatchId === null || payload.featuredMatchId === undefined || typeof payload.featuredMatchId === 'number',
    true,
    'home payload featuredMatchId must be number, null, or undefined',
  );
  assertArray(payload.issues, 'home payload issues');
  assertArray(payload.sourceWarnings, 'home payload sourceWarnings');
  assert.equal(payload.nextPreview === null || typeof payload.nextPreview === 'object', true, 'home payload nextPreview must be object or null');
  if (payload.nextPreview) {
    assert.equal(typeof payload.nextPreview.date, 'string', 'home nextPreview date must be a string');
    assertArray(payload.nextPreview.matches, 'home nextPreview matches');
    assertArray(payload.nextPreview.superLigMatches, 'home nextPreview superLigMatches');
    assert.equal(
      payload.nextPreview.featuredMatchId === null ||
      payload.nextPreview.featuredMatchId === undefined ||
      typeof payload.nextPreview.featuredMatchId === 'number',
      true,
      'home nextPreview featuredMatchId must be number, null, or undefined',
    );
  }
  assert.equal(typeof payload.generatedAt, 'string', 'home payload generatedAt must be a string');
}

async function main() {
  const apiResponse = loadTsModule(path.join(__dirname, '..', 'services', 'apiResponse.ts'));
  const {
    ApiResponseError,
    clearContextFallbackStats,
    clearLastApiError,
    getContextFallbackStats,
    getLastApiError,
    isStaleApiData,
    logApiError,
    recordContextFallback,
    readApiJson,
  } = apiResponse;

  const staleData = await readApiJson(
    makeResponse({
      ok: true,
      stale: true,
      warning: { code: 'upstream_failed', message: 'served stale data' },
      data: [{ id: 1 }],
    }),
    [],
  );
  assert.equal(Array.isArray(staleData), true);
  assert.equal(staleData.length, 1);
  assert.equal(isStaleApiData(staleData), true);
  assert.equal(Object.keys(staleData).includes('__apiMeta'), false);

  const matchContext = await readApiJson(
    makeResponse({
      ok: true,
      data: {
        match: { id: 123, homeTeam: { id: 1 }, awayTeam: { id: 2 } },
        homeForm: [],
        awayForm: [],
        h2h: [],
        issues: [],
        generatedAt: '2026-04-30T00:00:00.000Z',
      },
    }),
    null,
  );
  validateMatchContextPayload(matchContext);

  const superLigMatchContext = await readApiJson(
    makeResponse({
      ok: true,
      data: {
        event: { idEvent: '123', strHomeTeam: 'Galatasaray', strAwayTeam: 'Fenerbahce' },
        homeContext: null,
        awayContext: { teamId: 2, recentMatches: [], formMatchesCount: 0 },
        h2h: [],
        issues: ['form'],
        generatedAt: '2026-04-30T00:00:00.000Z',
      },
    }),
    null,
  );
  validateSuperLigMatchContextPayload(superLigMatchContext);

  const homePayload = await readApiJson(
    makeResponse({
      ok: true,
      data: {
        date: '2026-05-01',
        matches: [],
        superLigMatches: [],
        standings: { 2021: [] },
        featuredMatchId: 12,
        issues: ['matches'],
        sourceWarnings: ['Main match feed failed for the selected day.'],
        nextPreview: {
          date: '2026-05-02',
          matches: [],
          superLigMatches: [],
          featuredMatchId: 99,
        },
        generatedAt: '2026-05-01T00:00:00.000Z',
      },
    }),
    null,
  );
  validateHomePayload(homePayload);

  clearContextFallbackStats();
  recordContextFallback('match', 'missing_context_payload', '123');
  recordContextFallback('superlig', 'missing_context_payload', '456');
  const contextFallbackStats = getContextFallbackStats();
  assert.equal(contextFallbackStats.total, 2);
  assert.equal(contextFallbackStats.byScope.match, 1);
  assert.equal(contextFallbackStats.byScope.superlig, 1);
  assert.equal(contextFallbackStats.byReason.missing_context_payload, 2);
  assert.equal(contextFallbackStats.recent.length, 2);
  assert.equal(contextFallbackStats.recent[0].key, '456');
  clearContextFallbackStats();
  assert.equal(getContextFallbackStats().total, 0);

  await assert.rejects(
    () => readApiJson(
      makeResponse({ ok: false, error: { code: 'api_limit', message: 'limit exceeded' } }, { status: 429 }),
      [],
    ),
    (error) => {
      assert.equal(error instanceof ApiResponseError, true);
      assert.equal(error.code, 'api_limit');
      assert.equal(error.status, 429);
      return true;
    },
  );

  await assert.rejects(
    () => readApiJson(makeResponse({ message: 'bad gateway' }, { ok: false, status: 502 }), null),
    (error) => {
      assert.equal(error instanceof ApiResponseError, true);
      assert.equal(error.code, 'http_502');
      assert.equal(error.status, 502);
      return true;
    },
  );

  clearLastApiError();
  assert.equal(getLastApiError(), null);

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    logApiError('getTodayMatches', new ApiResponseError('api_limit', 'limit exceeded', 429));
    const typedError = getLastApiError();
    assert.equal(typedError.scope, 'getTodayMatches');
    assert.equal(typedError.code, 'api_limit');
    assert.equal(typedError.status, 429);

    clearLastApiError();
    logApiError('getWeather', new Error('network failed'));
    const clientError = getLastApiError();
    assert.equal(clientError.scope, 'getWeather');
    assert.equal(clientError.code, 'client_error');
    assert.equal(clientError.message, 'network failed');
  } finally {
    console.error = originalConsoleError;
  }

  console.log('API contract smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
