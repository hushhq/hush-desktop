import type { DesktopUpdateState } from './desktop-update';

/**
 * User-selectable native window material identifiers exchanged across the
 * preload boundary. Mirrors the renderer-side type in
 * `hush-web/src/lib/appearancePreferences.ts`.
 *
 * - `"auto"`: keep the conservative default picked by `window-config.ts`.
 * - macOS: a curated subset of `NSVisualEffectView` materials supported
 *   by Electron's `setVibrancy()`.
 * - Windows 11: the supported subset of `backgroundMaterial` values for
 *   `setBackgroundMaterial()`.
 *
 * Linux has no native material and is intentionally not represented here.
 */
export type GlassMaterial =
  | 'auto'
  | 'sidebar'
  | 'under-window'
  | 'menu'
  | 'headerView'
  | 'mica'
  | 'acrylic';

/**
 * Shape of window.hushDesktop exposed by the preload bridge.
 * Kept narrow by design — add methods here only when main-process access is provably needed.
 */
export interface DesktopApi {
  readonly isDesktop: true;
  readonly platform: NodeJS.Platform;
  getAppVersion(): Promise<string>;
  /**
   * Stores the AES-256 wrapping key hex in the main process after PIN unlock.
   * The key lives only in main-process memory — never in renderer storage.
   */
  setVaultSessionKey(userId: string, rawKeyHex: string): Promise<void>;
  /**
   * Retrieves the wrapping key hex from the main process, or null if not present.
   * Used on page reload to auto-unlock the vault without re-entering the PIN.
   */
  getVaultSessionKey(userId: string): Promise<string | null>;
  /**
   * Clears the wrapping key from the main process.
   * Called on lockVault, performLogout, and inactivity timeout.
   */
  clearVaultSessionKey(userId: string): Promise<void>;
  /**
   * Switches the BrowserWindow minimum-size floor.
   *
   * - `'auth'`: tall floor sized for the LinkDevice auth surface (pre-login).
   * - `'app'` : compact floor for the operative app shell (post-login).
   *
   * Called by the renderer when the boot state crosses the auth boundary so
   * the OS resize handle reflects the new minimum.
   */
  setMinWindowFloor(profile: 'auth' | 'app'): Promise<void>;
  /**
   * Applies a user-selected native window material to the focused window
   * at runtime. Routed through the main process because only the main
   * process can call `BrowserWindow.setVibrancy` (macOS) /
   * `BrowserWindow.setBackgroundMaterial` (Win11). Unsupported pairings
   * (e.g. `mica` on macOS, `sidebar` on Win11, anything on Linux) resolve
   * without taking effect — the renderer must not rely on this for
   * platform detection.
   */
  setGlassMaterial(material: GlassMaterial): Promise<void>;
  /**
   * Measures round-trip latency to `${instanceUrl}/api/health` in the main
   * process so the request bypasses renderer COEP / CORS constraints.
   *
   * Validation lives in main:
   *   - `instanceUrl` must be an absolute `http:` or `https:` URL.
   *   - The path is always rebuilt as `/api/health`. Renderer-supplied paths
   *     and query strings are discarded so the channel cannot be used as a
   *     generic outbound fetch primitive.
   *   - No `Authorization` header, no cookies, no credentials are attached.
   *
   * Connectivity failures are reported as `{ ok: false }` rather than as a
   * thrown promise rejection so the renderer can render a `--` indicator
   * without try/catch boilerplate.
   */
  measureInstanceHealth(instanceUrl: string): Promise<DesktopHealthResult>;
  /**
   * Fetches the current desktop auto-update state snapshot. Safe to call from
   * any renderer mount — main process never throws, even if no update check has
   * been started (returns an `idle` snapshot in that case).
   */
  getDesktopUpdateState(): Promise<DesktopUpdateState>;
  /**
   * Requests an explicit user-initiated update check. This is used by native
   * menus, tray menus, and command-palette actions. The main process owns the
   * updater; the renderer only receives the resulting state snapshot.
   */
  checkForDesktopUpdates(): Promise<DesktopUpdateState>;
  /**
   * Subscribes to push updates of the desktop auto-update state. The listener
   * fires for every state transition in main. Returns an unsubscribe function
   * — call it on component unmount to remove the underlying IPC listener.
   */
  onDesktopUpdateState(listener: (state: DesktopUpdateState) => void): () => void;
}

/**
 * Structured result for {@link DesktopApi.measureInstanceHealth}.
 *
 * Successful probes carry the measured round-trip and the upstream HTTP
 * status code so the renderer can colour the indicator without re-classifying.
 * Failures carry a short machine-readable `error` tag (e.g. `'timeout'`,
 * `'network'`, `'invalid-url'`, `'non-2xx'`) for diagnostics + tests.
 */
export type DesktopHealthResult =
  | { ok: true; ms: number; statusCode: number }
  | { ok: false; ms: null; statusCode?: number; error: string };

declare global {
  interface Window {
    hushDesktop?: DesktopApi;
  }
}
