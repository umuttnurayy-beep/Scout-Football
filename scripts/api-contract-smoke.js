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

async function main() {
  const apiResponse = loadTsModule(path.join(__dirname, '..', 'services', 'apiResponse.ts'));
  const {
    ApiResponseError,
    clearLastApiError,
    getLastApiError,
    isStaleApiData,
    logApiError,
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
