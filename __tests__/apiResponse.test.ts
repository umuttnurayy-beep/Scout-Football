import {
  ApiResponseError,
  clearContextFallbackStats,
  clearLastApiError,
  getContextFallbackStats,
  getLastApiError,
  isStaleApiData,
  logApiError,
  readApiJson,
  recordContextFallback,
} from '../services/apiResponse';

function response(payload: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(payload),
  } as Response;
}

describe('readApiJson', () => {
  it('unwraps successful API envelopes and attaches non-enumerable stale metadata', async () => {
    const data = await readApiJson<{ rows: string[] }>(
      response({ ok: true, stale: true, warning: { code: 'partial' }, data: { rows: ['A'] } }),
      { rows: [] }
    );

    expect(data).toEqual({ rows: ['A'] });
    expect(isStaleApiData(data)).toBe(true);
    expect(Object.keys(data)).toEqual(['rows']);
  });

  it('uses fallback when envelope data is nullish', async () => {
    await expect(readApiJson(response({ ok: true, data: null }), ['fallback']))
      .resolves.toEqual(['fallback']);
  });

  it('returns plain payloads without stale metadata', async () => {
    const data = await readApiJson(response([{ id: 1 }]), []);

    expect(data).toEqual([{ id: 1 }]);
    expect(isStaleApiData(data)).toBe(false);
  });

  it('handles primitive and undefined payloads with safe fallback behavior', async () => {
    await expect(readApiJson(response(undefined), 'fallback')).resolves.toBe('fallback');
    await expect(readApiJson(response('ok'), 'fallback')).resolves.toBe('ok');
    await expect(readApiJson(response({ ok: true, data: 7 }), 0)).resolves.toBe(7);
  });

  it('throws ApiResponseError for explicit API errors and HTTP failures', async () => {
    await expect(readApiJson(
      response({ ok: false, error: { code: 'bad_source', message: 'Bad source' } }, true, 200),
      null
    )).rejects.toMatchObject({ code: 'bad_source', message: 'Bad source', status: 200 });

    await expect(readApiJson(response({ message: 'nope' }, false, 503), null))
      .rejects.toMatchObject({ code: 'http_503', message: 'HTTP 503', status: 503 });
  });
});

describe('api error and fallback stats', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    clearLastApiError();
    clearContextFallbackStats();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('records structured API errors and generic client errors', () => {
    logApiError('standings', new ApiResponseError('http_500', 'HTTP 500', 500));
    expect(getLastApiError()).toMatchObject({
      scope: 'standings',
      code: 'http_500',
      message: 'HTTP 500',
      status: 500,
    });

    logApiError('home', new Error('network down'));
    expect(getLastApiError()).toMatchObject({
      scope: 'home',
      code: 'client_error',
      message: 'network down',
    });

    logApiError('raw', 'string failure');
    expect(getLastApiError()).toMatchObject({
      scope: 'raw',
      code: 'client_error',
      message: 'Unknown API error',
    });
  });

  it('tracks context fallback totals, reasons, and recent events immutably', () => {
    recordContextFallback('match', 'source_error', 'm1');
    recordContextFallback('superlig', 'empty_payload', 's1');
    recordContextFallback('match', 'source_error', 'm2');

    const stats = getContextFallbackStats();
    expect(stats.total).toBe(3);
    expect(stats.byScope).toEqual({ match: 2, superlig: 1 });
    expect(stats.byReason).toEqual({ source_error: 2, empty_payload: 1 });
    expect(stats.recent.map(item => item.key)).toEqual(['m2', 's1', 'm1']);

    stats.recent[0].key = 'changed';
    expect(getContextFallbackStats().recent[0].key).toBe('m2');
  });

  it('keeps only the most recent 20 fallback events', () => {
    Array.from({ length: 22 }, (_, index) => {
      recordContextFallback('match', 'source_error', `m${index}`);
    });

    const stats = getContextFallbackStats();
    expect(stats.total).toBe(22);
    expect(stats.recent).toHaveLength(20);
    expect(stats.recent[0].key).toBe('m21');
    expect(stats.recent[19].key).toBe('m2');
  });
});
