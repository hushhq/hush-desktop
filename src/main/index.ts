import { app, BrowserWindow, nativeImage, session } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { registerAppScheme, registerAppProtocol } from './protocol';
import { createMainWindow } from './window';
import { registerIpcHandlers } from './ipc/handlers';
import { registerMediaHandlers } from './media-handlers';
import { logBootSnapshot } from './diagnostics';

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
 *
 * Source preference (set by scripts/copy-icons.cjs at build time):
 *   1. build/icon.icns — the canonical macOS render of `hush.icon`
 *      (Apple Icon Composer document) with the Tahoe Liquid Glass /
 *      gradient effects baked into the standard renditions. Preferred.
 *   2. build/icon.png  — the cross-platform PWA fallback. Used when
 *      .icns is unavailable (e.g. cross-building from non-macOS hosts).
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

app.on('second-instance', () => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) return;
  const win = windows[0];
  if (win.isMinimized()) win.restore();
  win.focus();
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
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
