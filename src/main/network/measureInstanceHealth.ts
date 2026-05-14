import type { DesktopHealthResult } from '../../shared/desktop-api';

/**
 * Hard ceiling for a single ping attempt. Network black-holes can stall
 * a fetch indefinitely; the abort fires past this bound and the result
 * collapses to `{ ok: false, error: 'timeout' }`.
 */
export const HEALTH_TIMEOUT_MS = 4_000;

/**
 * Health endpoint path is fixed in main and never accepted from the
 * renderer. This guarantees the IPC channel cannot be used as a generic
 * outbound fetch primitive.
 */
export const HEALTH_PATH = '/api/health';

/**
 * Minimal fetch contract — enough for tests to inject a stub without
 * depending on Node's global `fetch` typing.
 */
export type FetchLike = (
  input: string,
  init?: { method?: string; signal?: AbortSignal; credentials?: 'omit' },
) => Promise<{ ok: boolean; status: number }>;

export interface MeasureClock {
  now(): number;
}

/**
 * Default wall-clock backed by `performance.now()` when available, and
 * `Date.now()` otherwise. Tests inject a deterministic clock.
 */
export const defaultClock: MeasureClock = {
  now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  },
};

/**
 * Validates a renderer-supplied instance URL.
 *
 * Accepts only absolute `http:` / `https:` URLs. Rebuilds the path as
 * `/api/health` to discard any renderer-supplied path, query, or fragment.
 */
export function buildHealthUrl(instanceUrl: unknown): string | null {
  if (typeof instanceUrl !== 'string' || instanceUrl.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(instanceUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  // Reject embedded userinfo. A URL like `https://user:pass@example.com`
  // would otherwise drive Electron's net stack to attach HTTP Basic
  // credentials on the renderer's behalf, defeating the "no credentials"
  // contract of this IPC channel even though no Authorization header is
  // ever set explicitly.
  if (parsed.username || parsed.password) return null;
  // Reset the request URL to the fixed health path. Renderer paths /
  // queries / fragments are discarded by construction.
  parsed.pathname = HEALTH_PATH;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

/**
 * Pure, dependency-injected ping. Returns a structured result so the
 * renderer never needs to wrap calls in try/catch.
 *
 * Connectivity failures (timeout, network error, non-2xx response,
 * malformed URL) become `{ ok: false, ... }`. Programmer errors do not
 * exist on this path — every branch returns a `DesktopHealthResult`.
 *
 * @param instanceUrl renderer-supplied instance origin (validated)
 * @param fetchImpl injected fetch (defaults to the global)
 * @param clock injected clock (defaults to performance.now)
 * @param timeoutMs hard ceiling per attempt
 */
export async function measureInstanceHealth(
  instanceUrl: unknown,
  fetchImpl: FetchLike,
  clock: MeasureClock = defaultClock,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<DesktopHealthResult> {
  const url = buildHealthUrl(instanceUrl);
  if (!url) {
    return { ok: false, ms: null, error: 'invalid-url' };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  const start = clock.now();
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
    });
    const elapsed = Math.max(0, clock.now() - start);
    if (!response.ok) {
      return {
        ok: false,
        ms: null,
        statusCode: response.status,
        error: 'non-2xx',
      };
    }
    return { ok: true, ms: elapsed, statusCode: response.status };
  } catch (err) {
    const aborted =
      (err as { name?: string })?.name === 'AbortError' ||
      controller.signal.aborted;
    return {
      ok: false,
      ms: null,
      error: aborted ? 'timeout' : 'network',
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
