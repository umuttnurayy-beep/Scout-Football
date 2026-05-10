function requestKey(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = typeof options.body === 'string' ? options.body : '';
  return `${method} ${url} ${body}`;
}

async function readJsonResponse(response, label) {
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    const err = new Error(`${label} returned non-JSON response (${response.status})`);
    err.status = response.status;
    throw err;
  }
  if (!response.ok) {
    const detail = data?.message || data?.error || JSON.stringify(data).slice(0, 180);
    const err = new Error(`${label} returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const UPSTREAM_DEFAULT_TIMEOUT_MS = 8000;

function shouldRetry(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return false;
  if (error.status === 429) return true;
  if (typeof error.status === 'number') return error.status >= 500;
  return true;
}

function createUpstreamJsonClient({ fetchImpl }) {
  const inFlight = new Map();
  const stats = {
    startedCount: 0,
    dedupedCount: 0,
    byLabel: {},
  };

  function ensureLabelStats(label) {
    if (!stats.byLabel[label]) {
      stats.byLabel[label] = { started: 0, deduped: 0 };
    }
    return stats.byLabel[label];
  }

  async function fetchJson(url, options = {}, label = 'upstream') {
    const key = requestKey(url, options);
    if (inFlight.has(key)) {
      stats.dedupedCount += 1;
      ensureLabelStats(label).deduped += 1;
      return inFlight.get(key);
    }

    stats.startedCount += 1;
    ensureLabelStats(label).started += 1;
    const attempts = Math.max(1, options.retryAttempts || 2);
    const retryDelayMs = Math.max(0, options.retryDelayMs || 250);
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : UPSTREAM_DEFAULT_TIMEOUT_MS;
    const requestOptions = { ...options };
    delete requestOptions.retryAttempts;
    delete requestOptions.retryDelayMs;
    delete requestOptions.timeoutMs;

    const promise = Promise.resolve()
      .then(async () => {
        let lastError;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const response = await fetchImpl(url, { ...requestOptions, signal: controller.signal });
            return await readJsonResponse(response, label);
          } catch (error) {
            lastError = error;
            if (attempt >= attempts || !shouldRetry(error)) throw error;
            await sleep(retryDelayMs * attempt);
          } finally {
            clearTimeout(timer);
          }
        }
        throw lastError;
      })
      .finally(() => inFlight.delete(key));

    inFlight.set(key, promise);
    return promise;
  }

  return {
    fetchJson,
    getInFlightCount: () => inFlight.size,
    getStats: () => ({
      startedCount: stats.startedCount,
      dedupedCount: stats.dedupedCount,
      inFlightCount: inFlight.size,
      byLabel: Object.fromEntries(
        Object.entries(stats.byLabel).map(([label, value]) => [label, { ...value }])
      ),
    }),
  };
}

module.exports = {
  createUpstreamJsonClient,
  readJsonResponse,
};
