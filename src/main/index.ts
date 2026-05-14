import { app, autoUpdater as electronAutoUpdater, BrowserWindow, nativeImage, session, Tray } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { registerAppScheme, registerAppProtocol } from './protocol';
import { createMainWindow } from './window';
import { registerIpcHandlers } from './ipc/handlers';
import { registerMediaHandlers } from './media-handlers';
import { logBootSnapshot } from './diagnostics';
import { createLifecycleState } from './lifecycle';
import { createAppTray } from './tray';
import { startDesktopUpdater } from './update/desktopUpdaterFactory';

// registerAppScheme must run before app.whenReady()
registerAppScheme();

/**
 * In packaged builds, macOS reads the brand icon from the .icns embedded
 * in Hush.app/Contents/Resources by electron-builder, so the dock and
 * the cmd-tab switcher already show the Hush icon.
 *
 * In `electron-vite dev`, the renderer is hosted by the Electron Helper
 * binary inside `node_modules/electron/dist/Electron.app`, which carries
 * the stock Electron icon. The dock icon therefore reverts to Electron's
 * default unless we explicitly override it via `app.dock.setIcon` once
 * the app is ready. Guarded on `!app.isPackaged` and `process.platform
 * === 'darwin'` so production builds and non-mac platforms keep their
 * existing path.
 */
function applyDevDockIconIfNeeded(): void {
  if (app.isPackaged) return;
  if (process.platform !== 'darwin') return;
  if (!app.dock) return;

  const candidates = [
    join(app.getAppPath(), 'build', 'icon.icns'),
    join(app.getAppPath(), 'build', 'icon.png'),
  ];
  for (const iconPath of candidates) {
    if (!existsSync(iconPath)) continue;
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      app.dock.setIcon(image);
      return;
    }
  }
  // No usable icon present yet — keep the default rather than crash.
}

// Single-instance lock: second launch focuses the existing window instead of opening a new one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// ── Lifecycle state ────────────────────────────────────────────────────────
//
// The hide-on-close interceptor and the tray's "Quit Hush" item both need to
// share a single `isQuitting` flag so the OS close button never tears down
// the renderer while a *real* quit is still allowed to terminate the app.
const lifecycle = createLifecycleState();

let mainWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;

function getMainWindow(): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow;
}

function revealMainWindow(): void {
  const win = getMainWindow();
  if (win) {
    lifecycle.revealWindow(win);
    return;
  }
  mainWindow = createMainWindow(lifecycle);
}

function spawnMainWindow(): void {
  mainWindow = createMainWindow(lifecycle);
  // Kick off the packaged-build auto-update gate once the renderer is hosted.
  // No-ops in dev because `startDesktopUpdater` checks `app.isPackaged`.
  // Wait for ready-to-show so webContents.send pushes after the renderer mounts.
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow) startDesktopUpdater(mainWindow);
  });
}

app.on('second-instance', () => {
  // Single-instance handler — reuse the existing window if any (which may
  // currently be hidden in the tray), otherwise spawn a fresh one.
  revealMainWindow();
});

app.on('before-quit', () => {
  // Any code path that reaches `app.quit()` (tray menu, Cmd-Q, OS shutdown)
  // flips the lifecycle flag so the close handler stops intercepting.
  lifecycle.markQuitting();
});

electronAutoUpdater.on('before-quit-for-update', () => {
  // electron-updater/Squirrel emits this update-specific quit path before
  // closing windows. Treat it like a real quit so hide-to-tray does not
  // intercept the close event and leave the downloaded update pending.
  lifecycle.markQuitting();
});

app.whenReady().then(() => {
  registerAppProtocol();
  registerIpcHandlers();
  // Wire mic/camera/screen-share permission + capture handlers on the
  // default session before any window opens; otherwise renderer
  // getUserMedia/getDisplayMedia calls hit Electron's empty defaults
  // (mic/cam silently rejected, getDisplayMedia throws NotSupportedError).
  registerMediaHandlers(session.defaultSession, {
    devRendererUrl: process.env.HUSH_WEB_URL,
  });
  // Capture boot context (paths, argv, packaged-or-not) to the desktop
  // diagnostics log. Critical for `open Hush.app` debugging because
  // LaunchServices detaches stdout in that flow — without the file log
  // there is no record of permission decisions or boot state.
  logBootSnapshot({ devRendererUrl: process.env.HUSH_WEB_URL ?? null });
  applyDevDockIconIfNeeded();
  spawnMainWindow();

  appTray = createAppTray({
    onShow: revealMainWindow,
    onQuit: () => {
      lifecycle.markQuitting();
      app.quit();
    },
  });

  app.on('activate', () => {
    // macOS dock click — surface the existing window when present so the
    // renderer is not re-mounted (joined voice room must survive).
    revealMainWindow();
  });
});

app.on('window-all-closed', () => {
  // Hide-to-tray means the renderer process intentionally outlives a
  // window close. Do not call `app.quit()` here — the only quit paths
  // are the tray menu and the platform Quit / Cmd-Q shortcut, both of
  // which flip `lifecycle.markQuitting()` before close fires.
  void appTray;
});
