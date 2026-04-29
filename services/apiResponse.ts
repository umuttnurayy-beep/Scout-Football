export type ApiEnvelope<T> = {
  ok?: boolean;
  stale?: boolean;
  data?: T;
  warning?: { code?: string; message?: string };
  error?: { code?: string; message?: string };
};

export class ApiResponseError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiResponseError';
    this.code = code;
    this.status = status;
  }
}

export type ApiErrorInfo = {
  scope: string;
  code: string;
  message: string;
  status?: number;
  at: number;
};

let lastApiError: ApiErrorInfo | null = null;

export type ApiMeta = {
  stale: boolean;
  warning?: { code?: string; message?: string };
};

export type WithApiMeta<T> = T & { __apiMeta?: ApiMeta };

function withApiMeta<T>(data: T, meta: ApiMeta): T {
  if (data && typeof data === 'object') {
    try {
      Object.defineProperty(data as object, '__apiMeta', {
        value: meta,
        enumerable: false,
        configurable: true,
      });
    } catch {}
  }
  return data;
}

function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'ok' in payload && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
}

export async function readApiJson<T>(res: Response, fallback: T): Promise<T> {
  const raw = await res.json() as T | ApiEnvelope<T>;
  if (raw && typeof raw === 'object' && 'ok' in raw && (raw as ApiEnvelope<T>).ok === false) {
    const error = (raw as ApiEnvelope<T>).error;
    throw new ApiResponseError(error?.code || `http_${res.status}`, error?.message || 'API request failed', res.status);
  }
  if (!res.ok) {
    throw new ApiResponseError(`http_${res.status}`, `HTTP ${res.status}`, res.status);
  }
  const data = unwrapApiData<T>(raw) ?? fallback;
  if (raw && typeof raw === 'object' && 'ok' in raw) {
    return withApiMeta(data, {
      stale: Boolean((raw as ApiEnvelope<T>).stale),
      warning: (raw as ApiEnvelope<T>).warning,
    });
  }
  return data;
}

export function isStaleApiData(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as { __apiMeta?: ApiMeta }).__apiMeta?.stale);
}

export function clearLastApiError() {
  lastApiError = null;
}

export function getLastApiError() {
  return lastApiError;
}

export function logApiError(scope: string, error: unknown) {
  if (error instanceof ApiResponseError) {
    lastApiError = {
      scope,
      code: error.code,
      message: error.message,
      status: error.status,
      at: Date.now(),
    };
    console.error(`${scope} hata: [${error.code}] ${error.message}`);
    return;
  }
  lastApiError = {
    scope,
    code: 'client_error',
    message: error instanceof Error ? error.message : 'Unknown API error',
    at: Date.now(),
  };
  console.error(`${scope} hata:`, error);
}
