const DEFAULT_FETCH_TIMEOUT_MS = parsePositiveInt(process.env.FETCH_TIMEOUT_MS, 10_000);
const DEFAULT_FETCH_RETRIES = parseNonNegativeInt(process.env.FETCH_RETRIES, 2);

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit | undefined,
  options: {
    label: string;
    retries?: number;
    timeoutMs?: number;
  },
): Promise<Response> {
  const retries = options.retries ?? DEFAULT_FETCH_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, init, timeoutMs);

      if (!isRetryableStatus(response.status) || attempt === retries) {
        return response;
      }

      const delayMs = getRetryDelayMs(attempt);
      console.warn(`[HTTP] ${options.label} returned ${response.status}, retrying in ${delayMs}ms`);
      await sleep(delayMs);
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || attempt === retries) {
        throw error;
      }

      const delayMs = getRetryDelayMs(attempt);
      console.warn(`[HTTP] transient fetch error during ${options.label}, retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isTransientFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === 'AbortError' ||
    message.includes('fetch failed') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('ecanceled') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('socket hang up') ||
    message.includes('network')
  );
}

function isRetryableStatus(status: number) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function getRetryDelayMs(attempt: number) {
  return 250 * (attempt + 1);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
