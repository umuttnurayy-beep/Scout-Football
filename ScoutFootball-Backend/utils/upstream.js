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
    throw new Error(`${label} returned non-JSON response (${response.status})`);
  }
  if (!response.ok) {
    const detail = data?.message || data?.error || JSON.stringify(data).slice(0, 180);
    throw new Error(`${label} returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return data;
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

    const promise = Promise.resolve()
      .then(() => fetchImpl(url, options))
      .then(response => readJsonResponse(response, label))
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
