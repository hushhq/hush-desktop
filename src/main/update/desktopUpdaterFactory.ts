import { app, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC_CHANNEL } from '../../shared/ipc-channels';
import type { DesktopUpdateState } from '../../shared/desktop-update';
import { recordEvent } from '../diagnostics';
import { DesktopUpdaterController, type UpdaterLike } from './desktopUpdater';
import { setActiveDesktopUpdater } from './desktopUpdaterRegistry';

/**
 * Starts the desktop auto-update gate for the given main window.
 *
 * Returns `null` (and skips the check entirely) outside packaged builds so
 * `npm run dev` never contacts GitHub Releases. Returns the controller in
 * packaged builds so callers can subscribe for diagnostics if needed.
 *
 * The controller pushes state to the renderer via the dedicated
 * {@link IPC_CHANNEL.UPDATE_STATE_EVENT} channel. The IPC handler for
 * {@link IPC_CHANNEL.UPDATE_GET_STATE} reads the snapshot from the registry.
 */
export function startDesktopUpdater(window: BrowserWindow): DesktopUpdaterController | null {
  if (!app.isPackaged) return null;

  const controller = new DesktopUpdaterController({
    updater: autoUpdater as unknown as UpdaterLike,
    currentVersion: app.getVersion(),
    onStateChange: (state) => emitToRenderer(window, state),
    logger: (event, detail) => {
      recordEvent('desktop-updater', event, detail);
    },
  });

  setActiveDesktopUpdater(controller);
  controller.start();
  return controller;
}

function emitToRenderer(window: BrowserWindow, state: DesktopUpdateState): void {
  if (window.isDestroyed()) return;
  try {
    window.webContents.send(IPC_CHANNEL.UPDATE_STATE_EVENT, state);
  } catch {
    // Window may have been torn down between the destroyed check and the send.
    // Nothing actionable in main — the renderer will re-query on next mount.
  }
}
