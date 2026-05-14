import { describe, expect, it, vi } from 'vitest';

// Mock the bits of `electron` that protocol.ts touches at import time. We
// only need `protocol.registerSchemesAsPrivileged` for this test; the
// `protocol.handle` / `net.fetch` / `app.getAppPath` paths exercise the
// runtime serving behaviour and are not invoked here.
vi.mock('electron', () => {
  const registerSchemesAsPrivileged = vi.fn();
  const handle = vi.fn();
  return {
    protocol: { registerSchemesAsPrivileged, handle },
    net: { fetch: vi.fn() },
    app: { isPackaged: false, getAppPath: () => '/tmp' },
  };
});

// Import AFTER the mock so the module under test resolves against it.
import { protocol } from 'electron';
import { registerAppScheme } from '../src/main/protocol';

describe('registerAppScheme', () => {
  it('registers the app:// scheme with service workers disabled', () => {
    registerAppScheme();

    expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledOnce();
    const arg = (protocol.registerSchemesAsPrivileged as unknown as {
      mock: { calls: [Array<{ scheme: string; privileges: Record<string, unknown> }>][] };
    }).mock.calls[0][0];

    expect(arg).toHaveLength(1);
    const entry = arg[0];
    expect(entry.scheme).toBe('app');

    // SW is intentionally OFF in desktop; the renderer reinstall owns
    // updates. A regression that flips this back to true would re-introduce
    // the stale-precache trap discussed in protocol.ts comments.
    expect(entry.privileges.allowServiceWorkers).toBe(false);

    // Everything else the renderer needs must remain true: COOP/COEP-aware
    // fetch, CORS, and the "standard"/"secure" treatment that lets
    // `app://localhost/...` behave like an https origin for purposes of
    // crypto.subtle, etc.
    expect(entry.privileges.secure).toBe(true);
    expect(entry.privileges.standard).toBe(true);
    expect(entry.privileges.supportFetchAPI).toBe(true);
    expect(entry.privileges.corsEnabled).toBe(true);
  });
});
