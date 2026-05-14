import { afterEach, describe, expect, it } from 'vitest';
import {
  getActiveDesktopUpdater,
  getDesktopUpdateStateSnapshot,
  requestDesktopUpdateCheck,
  setActiveDesktopUpdater,
} from '../src/main/update/desktopUpdaterRegistry';
import {
  DesktopUpdaterController,
  type UpdaterLike,
} from '../src/main/update/desktopUpdater';

type AnyListener = (arg: unknown) => void;

class StubUpdater {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  private listeners = new Map<string, Set<AnyListener>>();
  on = ((event: string, listener: AnyListener) => {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }) as unknown as UpdaterLike['on'];
  async checkForUpdates() { return {}; }
  async downloadUpdate() { return []; }
  quitAndInstall() {}
}

const noopTimer = () => 0 as unknown as number;

afterEach(() => {
  setActiveDesktopUpdater(null);
});

describe('getDesktopUpdateStateSnapshot', () => {
  it('ReturnsIdleSnapshotWhenNoControllerRegistered', () => {
    setActiveDesktopUpdater(null);
    expect(getDesktopUpdateStateSnapshot('0.0.1-test')).toEqual({
      phase: 'idle',
      currentVersion: '0.0.1-test',
      targetVersion: null,
      progress: null,
      error: null,
    });
  });

  it('ReturnsCheckingSnapshot_AfterStartupRegistration_BeforeAnyUpdaterEvent', () => {
    const controller = new DesktopUpdaterController({
      updater: new StubUpdater() as unknown as UpdaterLike,
      currentVersion: '0.0.1-test',
      timeoutMs: 3000,
      setTimeout: noopTimer,
      clearTimeout: () => {},
    });
    setActiveDesktopUpdater(controller);
    controller.start();

    // Renderer's first hydration must see `checking`, never `idle`, so the
    // update boundary keeps the PIN/auth tree blocked until availability
    // resolves.
    expect(getDesktopUpdateStateSnapshot('fallback').phase).toBe('checking');
    expect(getActiveDesktopUpdater()).toBe(controller);
  });

  it('RequestDesktopUpdateCheck_NoController_ReturnsIdleSnapshot', async () => {
    setActiveDesktopUpdater(null);
    await expect(requestDesktopUpdateCheck('0.0.2-test')).resolves.toEqual({
      phase: 'idle',
      currentVersion: '0.0.2-test',
      targetVersion: null,
      progress: null,
      error: null,
    });
  });
});
