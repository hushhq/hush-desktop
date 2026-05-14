import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildHealthUrl,
  HEALTH_PATH,
  HEALTH_TIMEOUT_MS,
  measureInstanceHealth,
  type FetchLike,
  type MeasureClock,
} from '../src/main/network/measureInstanceHealth';

function fixedClock(values: number[]): MeasureClock {
  let i = 0;
  return {
    now() {
      const v = values[i] ?? values[values.length - 1] ?? 0;
      i += 1;
      return v;
    },
  };
}

describe('buildHealthUrl', () => {
  it('accepts an absolute https origin and rewrites the path to /api/health', () => {
    expect(buildHealthUrl('https://hush.example.com')).toBe(
      'https://hush.example.com/api/health',
    );
  });

  it('accepts an absolute http origin (self-hosted dev instance)', () => {
    expect(buildHealthUrl('http://127.0.0.1:8787')).toBe(
      'http://127.0.0.1:8787/api/health',
    );
  });

  it('discards renderer-supplied paths, queries, and fragments', () => {
    expect(
      buildHealthUrl('https://hush.example.com/some/other/path?token=x#frag'),
    ).toBe('https://hush.example.com/api/health');
  });

  it('rejects file:, data:, javascript:, and other non-http(s) protocols', () => {
    expect(buildHealthUrl('file:///etc/passwd')).toBeNull();
    expect(buildHealthUrl('data:text/plain,hi')).toBeNull();
    expect(buildHealthUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects garbage / non-URL strings', () => {
    expect(buildHealthUrl('not a url')).toBeNull();
    expect(buildHealthUrl('')).toBeNull();
    expect(buildHealthUrl(null)).toBeNull();
    expect(buildHealthUrl(undefined)).toBeNull();
    expect(buildHealthUrl(42)).toBeNull();
  });

  it('rejects URLs with embedded username/password (Basic-auth smuggling)', () => {
    // Electron's `net.fetch` honours URL userinfo and attaches an
    // Authorization: Basic ... header, which would defeat the
    // no-credentials contract of this IPC channel even though we never
    // set an Authorization header ourselves.
    expect(buildHealthUrl('https://user@example.com')).toBeNull();
    expect(buildHealthUrl('https://user:pass@example.com')).toBeNull();
    expect(buildHealthUrl('http://:pass@example.com')).toBeNull();
  });

  it('exposes the fixed health path as a constant the renderer cannot override', () => {
    expect(HEALTH_PATH).toBe('/api/health');
  });
});

describe('measureInstanceHealth', () => {
  it('returns ok: true with elapsed ms and statusCode for a 200 response', async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const clock = fixedClock([0, 37]);

    const result = await measureInstanceHealth(
      'https://hush.example.com',
      fetchImpl,
      clock,
    );

    expect(result).toEqual({ ok: true, ms: 37, statusCode: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://hush.example.com/api/health');
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('omit');
  });

  it('forces the health path even when the renderer URL has its own path', async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await measureInstanceHealth(
      'https://hush.example.com/admin/secret',
      fetchImpl,
      fixedClock([0, 1]),
    );
    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://hush.example.com/api/health');
  });

  it('rejects non-http(s) instance URLs without dispatching a request', async () => {
    const fetchImpl: FetchLike = vi.fn();
    const result = await measureInstanceHealth(
      'file:///etc/passwd',
      fetchImpl,
      fixedClock([0]),
    );
    expect(result).toEqual({ ok: false, ms: null, error: 'invalid-url' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects URLs with embedded userinfo without dispatching a request', async () => {
    const fetchImpl: FetchLike = vi.fn();
    for (const url of [
      'https://user@hush.example.com',
      'https://user:pass@hush.example.com',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const result = await measureInstanceHealth(url, fetchImpl, fixedClock([0]));
      expect(result).toEqual({ ok: false, ms: null, error: 'invalid-url' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports non-2xx responses as ok: false with the upstream status code', async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await measureInstanceHealth(
      'https://hush.example.com',
      fetchImpl,
      fixedClock([0, 4]),
    );
    expect(result).toEqual({
      ok: false,
      ms: null,
      statusCode: 503,
      error: 'non-2xx',
    });
  });

  it('reports network rejections as ok: false with error="network"', async () => {
    const fetchImpl: FetchLike = vi.fn().mockRejectedValue(new Error('refused'));
    const result = await measureInstanceHealth(
      'https://hush.example.com',
      fetchImpl,
      fixedClock([0]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('network');
      expect(result.ms).toBeNull();
    }
  });

  describe('timeout handling', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('actually aborts an in-flight request past the configured ceiling', async () => {
      vi.useFakeTimers();

      let capturedSignal: AbortSignal | undefined;
      let rejectFetch: ((reason: unknown) => void) | undefined;

      const fetchImpl: FetchLike = vi.fn(
        (_url: string, init?: { method?: string; signal?: AbortSignal }) => {
          capturedSignal = init?.signal;
          return new Promise<{ ok: boolean; status: number }>(
            (_resolve, reject) => {
              rejectFetch = reject;
            },
          );
        },
      );

      const TIMEOUT_MS = 10;
      const resultPromise = measureInstanceHealth(
        'https://hush.example.com',
        fetchImpl,
        fixedClock([0, TIMEOUT_MS + 1]),
        TIMEOUT_MS,
      );

      // Drive past the ceiling. Implementation arms a setTimeout against
      // controller.abort(), so once the timer fires the captured signal
      // must report `aborted === true`.
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(true);

      // Drain the pending fetch promise so the handler's await unblocks
      // and the result resolves. A real fetch would reject with an
      // AbortError once its signal aborts; we simulate that here.
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      rejectFetch?.(abortError);

      const result = await resultPromise;
      expect(result).toEqual({ ok: false, ms: null, error: 'timeout' });
    });
  });

  it('never attaches Authorization headers, cookies, or credentials', async () => {
    const fetchImpl: FetchLike = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await measureInstanceHealth(
      'https://hush.example.com',
      fetchImpl,
      fixedClock([0, 1]),
    );
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    // Implementation forwards only { method, signal, credentials: 'omit' }.
    // Asserting on the keys keeps a regression guard if anyone widens it.
    expect(Object.keys(init ?? {}).sort()).toEqual(
      ['credentials', 'method', 'signal'].sort(),
    );
    expect(init?.credentials).toBe('omit');
  });

  it('keeps the default timeout ceiling at 4s so the UI never freezes on the indicator', () => {
    expect(HEALTH_TIMEOUT_MS).toBe(4_000);
  });
});
