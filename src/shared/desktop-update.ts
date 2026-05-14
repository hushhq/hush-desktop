/**
 * Shared shape of the desktop auto-update state machine.
 *
 * The main process owns the state; the renderer reads a snapshot via
 * {@link DesktopApi.getDesktopUpdateState} and subscribes to push updates via
 * {@link DesktopApi.onDesktopUpdateState}. Keep this surface minimal — any new
 * field needs an explicit reason and a renderer test.
 */
export type DesktopUpdatePhase =
  /** Initial state before any check has been issued. Gate hidden. */
  | 'idle'
  /** Update was confirmed available within the startup budget. Download starting. Gate visible. */
  | 'checking'
  /** Update download is in flight with measurable progress. Gate visible. */
  | 'downloading'
  /** Update fully downloaded; app is about to call quitAndInstall. Gate visible. */
  | 'downloaded'
  /** Fail-open: 3s timeout, no update available, or unrecoverable error before download. Gate hidden. */
  | 'skipped'
  /** Fail-open after a download error. Gate hidden. */
  | 'error';

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
   * the user — used only for logs and tests.
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
