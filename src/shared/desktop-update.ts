/**
 * Shared shape of the desktop auto-update state machine.
 *
 * The main process owns the state; the renderer reads a snapshot via
 * {@link DesktopApi.getDesktopUpdateState} and subscribes to push updates via
 * {@link DesktopApi.onDesktopUpdateState}. Keep this surface minimal, any new
 * field needs an explicit reason and a renderer test.
 */
export type DesktopUpdatePhase =
  /**
   * No check has been issued yet. Gate hidden. In packaged builds this state
   * is short-lived, the controller transitions out of `idle` synchronously
   * from `start()` so the renderer never observes it once an update check
   * has been initiated. Browser builds (no desktop bridge) keep it forever.
   */
  | 'idle'
  /**
   * Startup availability check is in flight, OR an update has been confirmed
   * available and the download is starting but no `download-progress` event
   * has arrived yet. Gate visible. The renderer treats both sub-states the
   * same: full-screen "Checking for desktop update..." surface.
   */
  | 'checking'
  /** Update download is in flight with measurable progress. Gate visible. */
  | 'downloading'
  /** Manual/background update is downloading without blocking the app shell. */
  | 'preparing'
  /** Update fully downloaded; app is about to call quitAndInstall. Gate visible. */
  | 'downloaded'
  /** Update fully downloaded by a manual/background check; user must explicitly restart. */
  | 'ready'
  /** Fail-open: 3s timeout, no update available, or unrecoverable error before download. Gate hidden. */
  | 'skipped'
  /** Fail-open after a download error. Gate hidden. */
  | 'error'
  /**
   * An update is available but this platform cannot self-apply it (Windows
   * builds are unsigned, so an auto-download + restart would not actually
   * update). The app stays fully usable; the renderer shows a non-blocking
   * prompt to download the new version manually. Gate hidden: never blocks.
   * `targetVersion` carries the available version.
   */
  | 'manual-required';

export interface DesktopUpdateProgress {
  readonly percent: number;
  readonly transferred: number;
  readonly total: number;
  readonly bytesPerSecond: number;
}

export interface DesktopUpdateState {
  readonly phase: DesktopUpdatePhase;
  readonly currentVersion: string;
  readonly targetVersion: string | null;
  readonly progress: DesktopUpdateProgress | null;
  /**
   * Diagnostic string for the most recent skip/error reason. Not surfaced to
   * the user, used only for logs and tests.
   */
  readonly error: string | null;
}

export function buildIdleDesktopUpdateState(currentVersion: string): DesktopUpdateState {
  return {
    phase: 'idle',
    currentVersion,
    targetVersion: null,
    progress: null,
    error: null,
  };
}

/**
 * Phases for which the renderer must render a non-dismissible update gate.
 * All other phases keep the normal app shell visible.
 */
export function isDesktopUpdateGateVisible(phase: DesktopUpdatePhase): boolean {
  return phase === 'checking' || phase === 'downloading' || phase === 'downloaded';
}
