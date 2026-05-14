import { app, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC_CHANNEL } from '../../shared/ipc-channels';
import type { DesktopUpdateState } from '../../shared/desktop-update';
import { recordEvent } from '../diagnostics';
import { DesktopUpdaterController, type UpdaterLike } from './desktopUpdater';
import { setActiveDesktopUpdater } from './desktopUpdaterRegistry';

/** Resolver that returns the current main window, or `null` if none exists yet. */
export type MainWindowProvider = () => BrowserWindow | null;

/**
 * Starts the desktop auto-update gate ahead of (and independent from) the main
 * window lifecycle.
 *
 * Why a provider instead of a window:
 *   The renderer's first `getDesktopUpdateState()` call races against window
 *   creation. If we waited for `did-finish-load` to create the controller, the
 *   renderer could hydrate with a stale `idle` snapshot from the registry and
 *   briefly unblock the PIN / auth surface underneath the update boundary.
 *   Creating the controller in `app.whenReady` before `spawnMainWindow()`
 *   guarantees the registry returns `checking` from the very first IPC call.
 *
 * Push pushes via `webContents.send(IPC_CHANNEL.UPDATE_STATE_EVENT, state)` are
 * routed through the provider. If no window exists yet (the controller started
 * before the renderer mounted) the push is dropped — the renderer will catch
 * up on its next `getDesktopUpdateState()` snapshot, which is already part of
 * its hydration path.
 *
 * Returns `null` (and skips the check entirely) outside packaged builds so
 * `npm run dev` never contacts GitHub Releases.
 */
export function startDesktopUpdater(
  getWindow: MainWindowProvider,
): DesktopUpdaterController | null {
  if (!app.isPackaged) return null;

  const controller = new DesktopUpdaterController({
    updater: autoUpdater as unknown as UpdaterLike,
    currentVersion: app.getVersion(),
    onStateChange: (state) => emitToRenderer(getWindow, state),
    logger: (event, detail) => {
      recordEvent('desktop-updater', event, detail);
    },
  });

  setActiveDesktopUpdater(controller);
  controller.start();
  return controller;
}

function emitToRenderer(getWindow: MainWindowProvider, state: DesktopUpdateState): void {
  const window = getWindow();
  if (!window) return;
  if (window.isDestroyed()) return;
  try {
    window.webContents.send(IPC_CHANNEL.UPDATE_STATE_EVENT, state);
  } catch {
    // Window may have been torn down between the destroyed check and the send,
    // or the renderer may not yet be ready to receive IPC. Nothing actionable
    // in main — the renderer hydrates via `getDesktopUpdateState()` on mount.
  }
}
