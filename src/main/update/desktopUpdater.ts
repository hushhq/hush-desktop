/**
 * Desktop auto-update controller.
 *
 * Wraps `electron-updater` behind a small, testable surface. Dependency-injected
 * so unit tests can drive the state machine without touching Electron or the
 * GitHub Releases feed.
 *
 * Startup contract (see hush-desktop/docs/release-distribution.md):
 *   - Packaged builds check GitHub for an update during startup.
 *   - The check has a hard 3 second timeout. Network/DNS/outage MUST fail open
 *     into the existing local app, IndexedDB history stays reachable offline.
 *   - When an update is confirmed available inside the budget the renderer
 *     shows a non-dismissible gate while the download runs. Download itself is
 *     allowed to take longer than 3 seconds; only the availability check is
 *     budgeted.
 *   - Late `update-available` / `update-not-available` events that arrive
 *     after the timeout already fired MUST be ignored so the gate cannot pop
 *     back open after fail-open.
 */
import {
  buildIdleDesktopUpdateState,
  type DesktopUpdatePhase,
  type DesktopUpdateProgress,
  type DesktopUpdateState,
} from '../../shared/desktop-update';

/**
 * Minimal subset of the `electron-updater` AppUpdater surface the controller
 * actually uses. Carving out an interface here keeps the controller importable
 * in unit tests without dragging Electron into the test runtime.
 */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: 'checking-for-update', listener: () => void): unknown;
  on(event: 'update-available', listener: (info: UpdateInfoLike) => void): unknown;
  on(event: 'update-not-available', listener: (info: UpdateInfoLike) => void): unknown;
  on(event: 'download-progress', listener: (progress: ProgressInfoLike) => void): unknown;
  on(event: 'update-downloaded', listener: (info: UpdateInfoLike) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdateInfoLike {
  readonly version?: string;
}

export interface ProgressInfoLike {
  readonly percent?: number;
  readonly transferred?: number;
  readonly total?: number;
  readonly bytesPerSecond?: number;
}

export type DesktopUpdateListener = (state: DesktopUpdateState) => void;
type AvailabilityResolver = (state: DesktopUpdateState) => void;
type DownloadInstallPolicy = 'auto' | 'manual';

export interface DesktopUpdaterControllerOptions {
  readonly updater: UpdaterLike;
  readonly currentVersion: string;
  readonly timeoutMs?: number;
  readonly setTimeout?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
  readonly onStateChange?: DesktopUpdateListener;
  readonly onBeforeQuitAndInstall?: () => void;
  readonly logger?: (event: string, detail?: Record<string, unknown>) => void;
  /**
   * When true, an available update is never downloaded or installed in-app;
   * the controller settles into the terminal `manual-required` phase so the
   * renderer can prompt a manual download. Set for platforms whose builds
   * cannot self-apply (today: Windows, unsigned).
   */
  readonly manualDownloadOnly?: boolean;
}

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Drives the desktop update state machine. One instance per main-process boot.
 * The class is small by design, only state transitions live here. Wiring to
 * the real `electron-updater` and to the renderer happens in a factory.
 */
export class DesktopUpdaterController {
  private state: DesktopUpdateState;
  private readonly listeners = new Set<DesktopUpdateListener>();

  private readonly updater: UpdaterLike;
  private readonly timeoutMs: number;
  private readonly setTimeoutImpl: (fn: () => void, ms: number) => unknown;
  private readonly clearTimeoutImpl: (handle: unknown) => void;
  private readonly onBeforeQuitAndInstall: () => void;
  private readonly logger: (event: string, detail?: Record<string, unknown>) => void;

  private availabilitySettled = false;
  private downloadStarted = false;
  private availabilityCheckInFlight = false;
  private startCalled = false;
  private installPolicy: DownloadInstallPolicy = 'auto';
  private readonly manualDownloadOnly: boolean;
  private timeoutHandle: unknown = null;
  private readonly availabilityResolvers: AvailabilityResolver[] = [];

  constructor(opts: DesktopUpdaterControllerOptions) {
    this.updater = opts.updater;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.setTimeoutImpl = opts.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.clearTimeoutImpl = opts.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>));
    this.onBeforeQuitAndInstall = opts.onBeforeQuitAndInstall ?? (() => {});
    this.logger = opts.logger ?? (() => {});
    this.manualDownloadOnly = opts.manualDownloadOnly ?? false;
    this.state = buildIdleDesktopUpdateState(opts.currentVersion);
    if (opts.onStateChange) this.listeners.add(opts.onStateChange);
    this.bindUpdaterEvents();
  }

  /**
   * Begins the startup update check. Safe to call exactly once per controller.
   * Concurrent calls are ignored so accidental re-entry from window lifecycle
   * code cannot start a second check while one is in flight.
   *
   * The controller transitions into `checking` SYNCHRONOUSLY so the renderer's
   * first `getDesktopUpdateState()` snapshot cannot observe an `idle` value in
   * packaged builds, `idle` only means "no check has been issued yet" and
   * leaving that visible to the renderer would briefly unblock the PIN/auth
   * gate underneath the update boundary.
   */
  start(): void {
    if (this.startCalled) return;
    this.startCalled = true;

    this.beginAvailabilityCheck({
      showGateWhileChecking: true,
      installPolicy: 'auto',
    });
  }

  /**
   * Runs a user-initiated update check. Manual checks stay in the background
   * while availability is being queried; if an update is found, the normal
   * download/install gate takes over.
   */
  requestManualCheck(): Promise<DesktopUpdateState> {
    if (this.availabilityCheckInFlight) return this.waitForAvailability();
    if (
      this.state.phase === 'downloading'
      || this.state.phase === 'preparing'
      || this.state.phase === 'downloaded'
      || this.state.phase === 'ready'
      || (this.state.phase === 'checking' && this.downloadStarted)
    ) {
      return Promise.resolve(this.getState());
    }
    const pending = this.waitForAvailability();
    this.beginAvailabilityCheck({
      showGateWhileChecking: false,
      installPolicy: 'manual',
    });
    return pending;
  }

  /**
   * Runs a non-interruptive background check. It shares manual-check semantics:
   * download if available, then wait for an explicit install request instead
   * of restarting the app from a timer callback.
   */
  requestBackgroundCheck(): void {
    if (
      this.availabilityCheckInFlight
      || this.state.phase === 'downloading'
      || this.state.phase === 'preparing'
      || this.state.phase === 'downloaded'
      || this.state.phase === 'ready'
      || (this.state.phase === 'checking' && this.downloadStarted)
    ) {
      return;
    }
    this.beginAvailabilityCheck({
      showGateWhileChecking: false,
      installPolicy: 'manual',
    });
  }

  /**
   * Installs a downloaded manual/background update. No-op unless the controller
   * is in the explicit user-action `ready` state.
   */
  installDownloadedUpdate(): DesktopUpdateState {
    if (this.state.phase !== 'ready') return this.getState();
    this.installPolicy = 'auto';
    this.transition({ phase: 'downloaded' });
    this.quitAndInstall();
    return this.getState();
  }

  private beginAvailabilityCheck(opts: {
    showGateWhileChecking: boolean;
    installPolicy: DownloadInstallPolicy;
  }): void {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;

    this.clearPendingTimeout();
    this.availabilitySettled = false;
    this.availabilityCheckInFlight = true;
    this.downloadStarted = false;
    this.installPolicy = opts.installPolicy;

    if (opts.showGateWhileChecking) {
      this.transition({
        phase: 'checking',
        targetVersion: null,
        progress: null,
        error: null,
      });
    }

    this.timeoutHandle = this.setTimeoutImpl(() => {
      this.timeoutHandle = null;
      if (this.availabilitySettled) return;
      this.availabilitySettled = true;
      this.availabilityCheckInFlight = false;
      this.failOpen('timeout');
    }, this.timeoutMs);

    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(this.updater.checkForUpdates());
    } catch (err) {
      this.handleCheckFailure(err);
      return;
    }
    pending.catch((err) => this.handleCheckFailure(err));
  }

  /** Snapshot accessor. Safe to call from the IPC handler at any time. */
  getState(): DesktopUpdateState {
    return {
      ...this.state,
      progress: this.state.progress ? { ...this.state.progress } : null,
    };
  }

  /**
   * Subscribes to state pushes. Returns an unsubscribe function. The listener
   * is invoked with a frozen snapshot on every transition.
   */
  subscribe(listener: DesktopUpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Internal: updater event wiring ──────────────────────────────────────────

  private bindUpdaterEvents(): void {
    this.updater.on('update-available', (info) => this.onUpdateAvailable(info));
    this.updater.on('update-not-available', () => this.onUpdateNotAvailable());
    this.updater.on('download-progress', (p) => this.onDownloadProgress(p));
    this.updater.on('update-downloaded', () => this.onUpdateDownloaded());
    this.updater.on('error', (err) => this.onUpdaterError(err));
  }

  private onUpdateAvailable(info: UpdateInfoLike | undefined): void {
    if (this.availabilitySettled) {
      this.logger('update-available-late', { phase: this.state.phase });
      return;
    }
    this.availabilitySettled = true;
    this.availabilityCheckInFlight = false;
    this.clearPendingTimeout();
    const targetVersion = typeof info?.version === 'string' ? info.version : null;

    // Platforms that cannot self-apply (Windows, unsigned) settle into a
    // terminal, non-blocking manual-required phase: no download, no restart,
    // the renderer prompts a manual download. Gate stays hidden.
    if (this.manualDownloadOnly) {
      const manualState: DesktopUpdateState = {
        ...this.state,
        phase: 'manual-required',
        targetVersion,
        progress: null,
        error: null,
      };
      this.logger('manual-update-required', { targetVersion });
      this.transition(manualState);
      this.resolveAvailabilityWaiters(manualState);
      return;
    }

    const nextAvailabilityState: DesktopUpdateState = {
      ...this.state,
      phase: this.installPolicy === 'auto' ? 'checking' : 'preparing',
      targetVersion,
      progress: null,
      error: null,
    };
    if (this.installPolicy === 'auto') {
      this.transition(nextAvailabilityState);
    } else {
      this.state = nextAvailabilityState;
    }
    this.resolveAvailabilityWaiters(nextAvailabilityState);
    this.startDownload();
  }

  private onUpdateNotAvailable(): void {
    if (this.availabilitySettled) return;
    this.availabilitySettled = true;
    this.availabilityCheckInFlight = false;
    this.clearPendingTimeout();
    this.failOpen('no-update');
  }

  private onDownloadProgress(progress: ProgressInfoLike | undefined): void {
    if (!this.downloadStarted) return;
    if (
      this.state.phase === 'downloaded'
      || this.state.phase === 'ready'
      || this.state.phase === 'error'
    ) {
      return;
    }
    const next: DesktopUpdateProgress = {
      percent: clampPercent(progress?.percent),
      transferred: nonNegative(progress?.transferred),
      total: nonNegative(progress?.total),
      bytesPerSecond: nonNegative(progress?.bytesPerSecond),
    };
    this.transition({
      phase: this.installPolicy === 'auto' ? 'downloading' : 'preparing',
      progress: next,
    });
  }

  private onUpdateDownloaded(): void {
    if (!this.downloadStarted) return;
    if (
      this.state.phase === 'downloaded'
      || this.state.phase === 'ready'
      || this.state.phase === 'error'
    ) {
      return;
    }
    if (this.installPolicy === 'manual') {
      this.transition({ phase: 'ready' });
      return;
    }
    this.transition({ phase: 'downloaded' });
    this.quitAndInstall();
  }

  private quitAndInstall(): void {
    try {
      this.onBeforeQuitAndInstall();
      this.updater.quitAndInstall();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger('quit-and-install-failed', { message });
      this.transition({ phase: 'error', error: message });
    }
  }

  private onUpdaterError(err: Error): void {
    const message = err instanceof Error ? err.message : String(err);
    if (!this.availabilitySettled) {
      this.availabilitySettled = true;
      this.availabilityCheckInFlight = false;
      this.clearPendingTimeout();
      this.failOpen(message);
      return;
    }
    if (!this.downloadStarted) return;
    if (this.state.phase === 'error') return;
    this.transition({ phase: 'error', error: message });
  }

  private handleCheckFailure(err: unknown): void {
    if (this.availabilitySettled) return;
    this.availabilitySettled = true;
    this.availabilityCheckInFlight = false;
    this.clearPendingTimeout();
    const message = err instanceof Error ? err.message : String(err);
    this.failOpen(message);
  }

  // ── Internal: helpers ───────────────────────────────────────────────────────

  private startDownload(): void {
    if (this.downloadStarted) return;
    this.downloadStarted = true;
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(this.updater.downloadUpdate());
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.onUpdaterError(e);
      return;
    }
    pending.catch((err) => {
      const e = err instanceof Error ? err : new Error(String(err));
      this.onUpdaterError(e);
    });
  }

  private failOpen(reason: string): void {
    this.logger('fail-open', { reason });
    this.transition({
      phase: 'skipped',
      targetVersion: null,
      progress: null,
      error: reason,
    });
    this.resolveAvailabilityWaiters();
  }

  private clearPendingTimeout(): void {
    if (this.timeoutHandle === null) return;
    this.clearTimeoutImpl(this.timeoutHandle);
    this.timeoutHandle = null;
  }

  private transition(patch: Partial<DesktopUpdateState> & { phase: DesktopUpdatePhase }): void {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        this.logger('listener-threw', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private waitForAvailability(): Promise<DesktopUpdateState> {
    return new Promise((resolve) => {
      this.availabilityResolvers.push(resolve);
    });
  }

  private resolveAvailabilityWaiters(snapshotOverride?: DesktopUpdateState): void {
    if (this.availabilityResolvers.length === 0) return;
    const snapshot = snapshotOverride ?? this.getState();
    const resolvers = this.availabilityResolvers.splice(0);
    for (const resolve of resolvers) resolve(snapshot);
  }
}

function clampPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function nonNegative(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return value;
}
