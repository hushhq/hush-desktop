import type { DesktopUpdateState } from './desktop-update';

/**
 * User-selectable native window material identifiers exchanged across the
 * preload boundary. Mirrors the renderer-side type in
 * `hush-web/src/lib/appearancePreferences.ts`.
 *
 * - `"auto"`: reset to the platform default picked by `window-config.ts`
 *   (menu on macOS, mica on Win11 22H2+). Selecting `auto` after a
 *   manual pick reverts the window to that platform default; it is not a
 *   no-op.
 * - macOS: a curated subset of `NSVisualEffectView` materials supported
 *   by Electron's `setVibrancy()`.
 * - Windows 11 22H2+: the supported subset of `backgroundMaterial`
 *   values for `setBackgroundMaterial()`.
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
 * Reason the desktop host cannot apply runtime native materials.
 * Surfaced for diagnostics + tests; the renderer branches on
 * `materialSwitchingSupported`.
 */
export type GlassUnsupportedReason =
  | 'linux-no-native-material'
  | 'win32-pre-22h2'
  | 'win32-unparseable-release';

/**
 * Capability payload the renderer reads at startup before applying the
 * stored native material preference. Computed once in the main process
 * from the host platform plus OS release information (Win11 22H2
 * requires NT build 22621+) so the renderer never has to second-guess
 * Electron's runtime behaviour.
 */
export interface GlassCapabilities {
  readonly platform: NodeJS.Platform;
  readonly materialSwitchingSupported: boolean;
  readonly materials: readonly GlassMaterial[];
  readonly unsupportedReason: GlassUnsupportedReason | null;
}

/**
 * Shape of window.hushDesktop exposed by the preload bridge.
 * Kept narrow by design — add methods here only when main-process access is provably needed.
 */
export interface DesktopApi {
  readonly isDesktop: true;
  readonly platform: NodeJS.Platform;
  readonly arch: NodeJS.Architecture;
  getAppVersion(): Promise<string>;
  getRuntimeInfo(): Promise<DesktopRuntimeInfo>;
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
   * `BrowserWindow.setBackgroundMaterial` (Win11 22H2+). The renderer
   * must call {@link DesktopApi.getGlassCapabilities} first and only
   * send identifiers from `capabilities.materials`; values outside that
   * set will be rejected. `'auto'` resets the window to the platform
   * default chosen in `window-config.ts`.
   */
  setGlassMaterial(material: GlassMaterial): Promise<void>;
  /**
   * Returns a snapshot of native window material capabilities for the
   * current host. Computed in main from `process.platform` plus
   * `os.release()` so the renderer cannot disagree with what Electron
   * will actually honour (Windows 11 22H2+ for `backgroundMaterial`,
   * macOS for `setVibrancy`, nothing on Linux). Safe to call multiple
   * times — the value is stable for the lifetime of the process.
   */
  getGlassCapabilities(): Promise<GlassCapabilities>;
  /**
   * Tells main that the renderer-side desktop shell has mounted and the
   * cold-launch window can be revealed. Fire-and-forget; the channel is
   * idempotent in main, so re-mount (HMR, route reset) does not cause
   * a second reveal. A reveal fallback in main caps the wait so a
   * broken renderer cannot leave the window invisible.
   */
  notifyRendererReady(): void;
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
   * Restarts and installs a downloaded update. No-op unless the updater state
   * is `ready`; returns the resulting state snapshot.
   */
  installDesktopUpdate(): Promise<DesktopUpdateState>;
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

export interface DesktopRuntimeInfo {
  readonly appVersion: string;
  readonly platform: NodeJS.Platform;
  readonly arch: NodeJS.Architecture;
  readonly osRelease: string;
  readonly electronVersion: string;
}

declare global {
  interface Window {
    hushDesktop?: DesktopApi;
  }
}
