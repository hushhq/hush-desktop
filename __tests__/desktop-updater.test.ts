import { describe, it, expect, beforeEach } from 'vitest';
import {
  DesktopUpdaterController,
  type ProgressInfoLike,
  type UpdaterLike,
  type UpdateInfoLike,
} from '../src/main/update/desktopUpdater';
import type { DesktopUpdateState } from '../src/shared/desktop-update';

type AnyListener = (arg: unknown) => void;

class FakeUpdater {
  autoDownload = true;
  autoInstallOnAppQuit = true;

  private listeners = new Map<string, Set<AnyListener>>();

  checkForUpdatesCalls = 0;
  downloadUpdateCalls = 0;
  quitAndInstallCalls = 0;
  checkRejection: Error | null = null;
  downloadRejection: Error | null = null;
  quitRejection: Error | null = null;

  on = ((event: string, listener: AnyListener) => {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }) as unknown as UpdaterLike['on'];

  emit(event: string, payload?: unknown): void {
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    for (const fn of bucket) fn(payload);
  }

  async checkForUpdates(): Promise<unknown> {
    this.checkForUpdatesCalls += 1;
    if (this.checkRejection) throw this.checkRejection;
    return {};
  }

  async downloadUpdate(): Promise<unknown> {
    this.downloadUpdateCalls += 1;
    if (this.downloadRejection) throw this.downloadRejection;
    return [];
  }

  quitAndInstall(): void {
    this.quitAndInstallCalls += 1;
    if (this.quitRejection) throw this.quitRejection;
  }
}

interface FakeTimer {
  fn: () => void;
  ms: number;
  cleared: boolean;
}

function makeTimerHarness() {
  const timers: FakeTimer[] = [];
  const setTimeoutFake = (fn: () => void, ms: number): FakeTimer => {
    const t: FakeTimer = { fn, ms, cleared: false };
    timers.push(t);
    return t;
  };
  const clearTimeoutFake = (handle: unknown): void => {
    const t = handle as FakeTimer | null;
    if (t) t.cleared = true;
  };
  function fireLatest(): void {
    const t = timers[timers.length - 1];
    if (!t || t.cleared) return;
    t.fn();
  }
  return { timers, setTimeoutFake, clearTimeoutFake, fireLatest };
}

function buildController(opts?: {
  timeoutMs?: number;
  onBeforeQuitAndInstall?: () => void;
}) {
  const updater = new FakeUpdater();
  const timer = makeTimerHarness();
  const states: DesktopUpdateState[] = [];
  const controller = new DesktopUpdaterController({
    updater: updater as unknown as UpdaterLike,
    currentVersion: '0.1.0-mvp',
    timeoutMs: opts?.timeoutMs ?? 3000,
    setTimeout: timer.setTimeoutFake,
    clearTimeout: timer.clearTimeoutFake,
    onStateChange: (s) => states.push(s),
    onBeforeQuitAndInstall: opts?.onBeforeQuitAndInstall,
  });
  return { controller, updater, timer, states };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('DesktopUpdaterController', () => {
  let h: ReturnType<typeof buildController>;

  beforeEach(() => {
    h = buildController();
  });

  it('starts in idle state with the supplied currentVersion', () => {
    expect(h.controller.getState()).toEqual({
      phase: 'idle',
      currentVersion: '0.1.0-mvp',
      targetVersion: null,
      progress: null,
      error: null,
    });
  });

  it('Start_DisablesAutoDownload_BeforeCheck', () => {
    h.updater.autoDownload = true;
    h.updater.autoInstallOnAppQuit = true;
    h.controller.start();
    expect(h.updater.autoDownload).toBe(false);
    expect(h.updater.autoInstallOnAppQuit).toBe(false);
    expect(h.updater.checkForUpdatesCalls).toBe(1);
  });

  it('Start_SynchronouslyTransitionsToChecking_BeforeAnyEvent', () => {
    h.controller.start();
    // No timer fired, no updater event emitted yet.
    expect(h.controller.getState().phase).toBe('checking');
  });

  it('Start_EmitsCheckingSnapshotToSubscribers_BeforeFirstEvent', () => {
    expect(h.states).toEqual([]);
    h.controller.start();
    expect(h.states.length).toBeGreaterThanOrEqual(1);
    expect(h.states[0]?.phase).toBe('checking');
  });

  it('Start_TimesOutAt3s_TransitionsToSkippedFailOpen', () => {
    h.controller.start();
    h.timer.fireLatest();
    const state = h.controller.getState();
    expect(state.phase).toBe('skipped');
    expect(state.error).toBe('timeout');
  });

  it('Start_NoUpdateAvailable_TransitionsToSkipped', () => {
    h.controller.start();
    h.updater.emit('update-not-available', {});
    const state = h.controller.getState();
    expect(state.phase).toBe('skipped');
    expect(state.error).toBe('no-update');
    expect(h.timer.timers[0]?.cleared).toBe(true);
  });

  it('Start_UpdateAvailableInsideTimeout_TransitionsToCheckingAndStartsDownload', async () => {
    h.controller.start();
    h.updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    const state = h.controller.getState();
    expect(state.phase).toBe('checking');
    expect(state.targetVersion).toBe('0.1.1-mvp');
    expect(h.updater.downloadUpdateCalls).toBe(1);
    expect(h.timer.timers[0]?.cleared).toBe(true);
  });

  it('DownloadProgress_ForwardsPercentTransferredTotalSpeed', async () => {
    h.controller.start();
    h.updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    const payload: ProgressInfoLike = {
      percent: 42.5,
      transferred: 1024,
      total: 2048,
      bytesPerSecond: 512,
    };
    h.updater.emit('download-progress', payload);
    const state = h.controller.getState();
    expect(state.phase).toBe('downloading');
    expect(state.progress).toEqual({
      percent: 42.5,
      transferred: 1024,
      total: 2048,
      bytesPerSecond: 512,
    });
  });

  it('DownloadProgress_ClampsAndSanitizesValues', async () => {
    h.controller.start();
    h.updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    h.updater.emit('download-progress', {
      percent: -10,
      transferred: -1,
      total: NaN,
      bytesPerSecond: 'fast',
    } as unknown as ProgressInfoLike);
    expect(h.controller.getState().progress).toEqual({
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
    });
    h.updater.emit('download-progress', {
      percent: 250,
      transferred: 100,
      total: 200,
      bytesPerSecond: 50,
    });
    expect(h.controller.getState().progress?.percent).toBe(100);
  });

  it('UpdateDownloaded_TransitionsToDownloadedAndCallsQuitAndInstall', async () => {
    h.controller.start();
    h.updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    h.updater.emit('update-downloaded', {});
    expect(h.controller.getState().phase).toBe('downloaded');
    expect(h.updater.quitAndInstallCalls).toBe(1);
  });

  it('UpdateDownloaded_CallsBeforeQuitHookBeforeQuitAndInstall', async () => {
    const order: string[] = [];
    const updater = new FakeUpdater();
    const originalQuitAndInstall = updater.quitAndInstall.bind(updater);
    updater.quitAndInstall = () => {
      order.push('quitAndInstall');
      originalQuitAndInstall();
    };
    const timer = makeTimerHarness();
    const controller = new DesktopUpdaterController({
      updater: updater as unknown as UpdaterLike,
      currentVersion: '0.1.0-mvp',
      setTimeout: timer.setTimeoutFake,
      clearTimeout: timer.clearTimeoutFake,
      onBeforeQuitAndInstall: () => order.push('beforeQuit'),
    });
    controller.start();
    updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    updater.emit('update-downloaded', {});
    expect(order).toEqual(['beforeQuit', 'quitAndInstall']);
  });

  it('Error_BeforeAvailability_FailsOpenSkipped', () => {
    h.controller.start();
    h.updater.emit('error', new Error('boom'));
    const state = h.controller.getState();
    expect(state.phase).toBe('skipped');
    expect(state.error).toBe('boom');
    expect(h.timer.timers[0]?.cleared).toBe(true);
  });

  it('Error_AfterAvailability_TransitionsToErrorFailOpen', async () => {
    h.controller.start();
    h.updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    h.updater.emit('error', new Error('disk full'));
    const state = h.controller.getState();
    expect(state.phase).toBe('error');
    expect(state.error).toBe('disk full');
  });

  it('LateUpdateAvailable_AfterTimeout_IsIgnored', () => {
    h.controller.start();
    h.timer.fireLatest(); // timeout → skipped
    h.updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    const state = h.controller.getState();
    expect(state.phase).toBe('skipped');
    expect(state.targetVersion).toBeNull();
    expect(h.updater.downloadUpdateCalls).toBe(0);
  });

  it('LateUpdateNotAvailable_AfterTimeout_IsIgnored', () => {
    h.controller.start();
    h.timer.fireLatest();
    const before = h.controller.getState();
    h.updater.emit('update-not-available', {});
    expect(h.controller.getState()).toEqual(before);
  });

  it('CheckForUpdatesRejects_BeforeTimeout_FailsOpen', async () => {
    const updater = new FakeUpdater();
    updater.checkRejection = new Error('dns failure');
    const timer = makeTimerHarness();
    const states: DesktopUpdateState[] = [];
    const controller = new DesktopUpdaterController({
      updater: updater as unknown as UpdaterLike,
      currentVersion: '0.1.0-mvp',
      timeoutMs: 3000,
      setTimeout: timer.setTimeoutFake,
      clearTimeout: timer.clearTimeoutFake,
      onStateChange: (s) => states.push(s),
    });
    controller.start();
    await flushMicrotasks();
    const state = controller.getState();
    expect(state.phase).toBe('skipped');
    expect(state.error).toBe('dns failure');
    expect(timer.timers[0]?.cleared).toBe(true);
  });

  it('DownloadUpdateRejects_AfterAvailability_TransitionsToError', async () => {
    const updater = new FakeUpdater();
    updater.downloadRejection = new Error('connection reset');
    const timer = makeTimerHarness();
    const controller = new DesktopUpdaterController({
      updater: updater as unknown as UpdaterLike,
      currentVersion: '0.1.0-mvp',
      timeoutMs: 3000,
      setTimeout: timer.setTimeoutFake,
      clearTimeout: timer.clearTimeoutFake,
    });
    controller.start();
    updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    await flushMicrotasks();
    const state = controller.getState();
    expect(state.phase).toBe('error');
    expect(state.error).toBe('connection reset');
  });

  it('Subscribe_ReceivesAllTransitions_UnsubscribeStopsDelivery', async () => {
    const received: string[] = [];
    const unsubscribe = h.controller.subscribe((s) => received.push(s.phase));
    h.controller.start();
    h.updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    h.updater.emit('download-progress', { percent: 10, transferred: 1, total: 10, bytesPerSecond: 1 });
    unsubscribe();
    h.updater.emit('update-downloaded', {});
    // start() emits checking, update-available re-emits checking with targetVersion,
    // download-progress emits downloading. After unsubscribe, downloaded is dropped.
    expect(received).toEqual(['checking', 'checking', 'downloading']);
  });

  it('Start_IsIdempotent_DoesNotIssueDoubleCheck', () => {
    h.controller.start();
    h.controller.start();
    expect(h.updater.checkForUpdatesCalls).toBe(1);
  });

  it('ManualCheck_NoUpdate_RunsInBackgroundAndResolvesSkipped', async () => {
    h.controller.start();
    h.updater.emit('update-not-available', {});
    expect(h.controller.getState().phase).toBe('skipped');
    h.states.length = 0;

    const pending = h.controller.requestManualCheck();
    expect(h.updater.checkForUpdatesCalls).toBe(2);
    expect(h.states).toEqual([]);

    h.updater.emit('update-not-available', {});
    const result = await pending;
    expect(result.phase).toBe('skipped');
    expect(result.error).toBe('no-update');
  });

  it('ManualCheck_UpdateAvailable_DownloadsWithoutRestarting', async () => {
    h.controller.start();
    h.updater.emit('update-not-available', {});

    const pending = h.controller.requestManualCheck();
    h.updater.emit('update-available', { version: '0.1.2-mvp' } as UpdateInfoLike);
    await flushMicrotasks();

    const result = await pending;
    expect(result.phase).toBe('preparing');
    expect(result.targetVersion).toBe('0.1.2-mvp');
    expect(h.controller.getState().phase).toBe('preparing');
    expect(h.updater.downloadUpdateCalls).toBe(1);

    h.updater.emit('update-downloaded', {});
    expect(h.controller.getState().phase).toBe('ready');
    expect(h.updater.quitAndInstallCalls).toBe(0);
  });

  it('InstallDownloadedUpdate_Ready_CallsQuitAndInstall', async () => {
    h.controller.start();
    h.updater.emit('update-not-available', {});

    void h.controller.requestManualCheck();
    h.updater.emit('update-available', { version: '0.1.2-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    h.updater.emit('update-downloaded', {});

    const state = h.controller.installDownloadedUpdate();
    expect(state.phase).toBe('downloaded');
    expect(h.updater.quitAndInstallCalls).toBe(1);
  });

  it('InstallDownloadedUpdate_NotReady_IsNoOp', () => {
    h.controller.start();
    const state = h.controller.installDownloadedUpdate();
    expect(state.phase).toBe('checking');
    expect(h.updater.quitAndInstallCalls).toBe(0);
  });

  it('BackgroundCheck_UpdateAvailable_DownloadsWithoutOpeningGateOrRestarting', async () => {
    h.controller.start();
    h.updater.emit('update-not-available', {});
    h.states.length = 0;

    h.controller.requestBackgroundCheck();
    expect(h.updater.checkForUpdatesCalls).toBe(2);
    expect(h.states).toEqual([]);

    h.updater.emit('update-available', { version: '0.1.2-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    h.updater.emit('download-progress', { percent: 50, transferred: 1, total: 2, bytesPerSecond: 1 });
    h.updater.emit('update-downloaded', {});

    expect(h.controller.getState().phase).toBe('ready');
    expect(h.states.map((s) => s.phase)).toEqual(['preparing', 'ready']);
    expect(h.updater.downloadUpdateCalls).toBe(1);
    expect(h.updater.quitAndInstallCalls).toBe(0);
  });

  it('ManualCheck_Timeout_ResolvesSkippedWithoutOpeningGate', async () => {
    h.controller.start();
    h.updater.emit('update-not-available', {});
    h.states.length = 0;

    const pending = h.controller.requestManualCheck();
    h.timer.fireLatest();
    const result = await pending;

    expect(result.phase).toBe('skipped');
    expect(result.error).toBe('timeout');
    expect(h.states.map((s) => s.phase)).toEqual(['skipped']);
  });

  it('ManualCheck_AfterDownloadError_AllowsRetry', async () => {
    h.controller.start();
    h.updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    h.updater.emit('error', new Error('download failed'));
    expect(h.controller.getState().phase).toBe('error');

    const pending = h.controller.requestManualCheck();
    expect(h.updater.checkForUpdatesCalls).toBe(2);
    h.updater.emit('update-not-available', {});

    const result = await pending;
    expect(result.phase).toBe('skipped');
    expect(result.error).toBe('no-update');
  });

  it('LateProgressAfterDownloaded_IsIgnored', async () => {
    h.controller.start();
    h.updater.emit('update-available', { version: '0.1.1-mvp' } as UpdateInfoLike);
    await flushMicrotasks();
    h.updater.emit('update-downloaded', {});
    expect(h.controller.getState().phase).toBe('downloaded');
    h.updater.emit('download-progress', { percent: 99, transferred: 1, total: 1, bytesPerSecond: 1 });
    expect(h.controller.getState().phase).toBe('downloaded');
  });
});
