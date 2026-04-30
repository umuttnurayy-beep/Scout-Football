function cachePrefix(cacheKey) {
  return String(cacheKey || 'unknown').split('_').slice(0, 2).join('_') || 'unknown';
}

function bumpMetric(bucket, key, field) {
  const safeKey = key || 'unknown';
  if (!bucket[safeKey]) bucket[safeKey] = { staleServed: 0, errorWithoutStale: 0 };
  bucket[safeKey][field] += 1;
}

function createApiResponder({ getStaleCache, diagnosticsSecret }) {
  const fallbackMetrics = {
    staleServedCount: 0,
    errorWithoutStaleCount: 0,
    byCode: {},
    byCachePrefix: {},
  };

  function recordFallbackMetric({ cacheKey, code, servedStale }) {
    const field = servedStale ? 'staleServed' : 'errorWithoutStale';
    if (servedStale) fallbackMetrics.staleServedCount += 1;
    else fallbackMetrics.errorWithoutStaleCount += 1;
    bumpMetric(fallbackMetrics.byCode, code, field);
    bumpMetric(fallbackMetrics.byCachePrefix, cachePrefix(cacheKey), field);
  }

  function getFallbackMetrics() {
    return {
      staleServedCount: fallbackMetrics.staleServedCount,
      errorWithoutStaleCount: fallbackMetrics.errorWithoutStaleCount,
      byCode: JSON.parse(JSON.stringify(fallbackMetrics.byCode)),
      byCachePrefix: JSON.parse(JSON.stringify(fallbackMetrics.byCachePrefix)),
    };
  }

  function apiError(res, status, code, message, data) {
    return res.status(status).json({
      ok: false,
      error: { code, message },
      data,
    });
  }

  function apiStale(res, data, code, message) {
    return res.json({
      ok: true,
      stale: true,
      warning: { code, message },
      data,
    });
  }

  async function apiStaleOrError(res, cacheKey, status, code, message, data) {
    const stale = await getStaleCache(cacheKey);
    if (stale !== null && stale !== undefined) {
      recordFallbackMetric({ cacheKey, code, servedStale: true });
      return apiStale(res, stale, code, message);
    }
    recordFallbackMetric({ cacheKey, code, servedStale: false });
    return apiError(res, status, code, message, data);
  }

  function missingConfig(res, name, data) {
    return apiError(res, 503, 'missing_config', `${name} is not configured`, data);
  }

  function requireDiagnosticsSecret(req, res) {
    if (!diagnosticsSecret) {
      apiError(res, 404, 'not_found', 'diagnostics disabled', null);
      return false;
    }
    if (req.headers['x-diagnostics-secret'] !== diagnosticsSecret) {
      apiError(res, 403, 'forbidden', 'forbidden', null);
      return false;
    }
    return true;
  }

  return {
    apiError,
    apiStaleOrError,
    getFallbackMetrics,
    missingConfig,
    requireDiagnosticsSecret,
  };
}

module.exports = {
  createApiResponder,
};
