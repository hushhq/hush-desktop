import { app, autoUpdater as electronAutoUpdater, BrowserWindow, nativeImage, session, Tray } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { registerAppScheme, registerAppProtocol } from './protocol';
import { createMainWindow, loadRendererPath } from './window';
import { registerIpcHandlers } from './ipc/handlers';
import { registerMediaHandlers } from './media-handlers';
import { logBootSnapshot, recordEvent } from './diagnostics';
import { createLifecycleState } from './lifecycle';
import { installAppMenu } from './appMenu';
import { createAppTray } from './tray';
import { startDesktopUpdater } from './update/desktopUpdaterFactory';
import { requestDesktopUpdateCheck } from './update/desktopUpdaterRegistry';
import { showManualUpdateFeedback } from './update/manualUpdateFeedback';

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
let pendingDeepLinkPath: string | null = null;

function getMainWindow(): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow;
}

function revealMainWindow(path = '/'): void {
  const win = getMainWindow();
  if (win) {
    if (path !== '/') {
      loadRendererPath(win, path);
    }
    lifecycle.revealWindow(win);
    return;
  }
  mainWindow = createMainWindow(lifecycle, path);
}

function spawnMainWindow(): void {
  mainWindow = createMainWindow(lifecycle, pendingDeepLinkPath ?? '/');
  pendingDeepLinkPath = null;
}

function checkForUpdatesFromShell(): void {
  void requestDesktopUpdateCheck(app.getVersion()).then((state) =>
    showManualUpdateFeedback(state, {
      appName: app.name || 'Hush',
      window: getMainWindow(),
    }),
  );
}

function deepLinkToRendererPath(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol === 'hush:') {
    const segments = [parsed.hostname, ...parsed.pathname.split('/')]
      .map((part) => part.trim())
      .filter(Boolean);
    const kind = segments[0];
    if (kind === 'invite' && segments[1]) {
      return `/invite/${encodeURIComponent(segments[1])}${parsed.hash}`;
    }
    if (kind === 'join' && segments[1] && segments[2]) {
      return `/join/${encodeURIComponent(segments[1])}/${encodeURIComponent(segments[2])}${parsed.hash}`;
    }
    return null;
  }
  if (parsed.protocol === 'https:' && parsed.hostname === 'app.gethush.live') {
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return null;
}

function extractDeepLinkArg(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith('hush://')) ?? null;
}

function handleDeepLink(rawUrl: string): void {
  const path = deepLinkToRendererPath(rawUrl);
  if (!path) return;
  pendingDeepLinkPath = path;
  if (!app.isReady()) return;
  revealMainWindow(path);
}

app.setAsDefaultProtocolClient('hush');

app.on('open-url', (event, rawUrl) => {
  event.preventDefault();
  handleDeepLink(rawUrl);
});

app.on('second-instance', (_event, argv) => {
  // Single-instance handler — reuse the existing window if any (which may
  // currently be hidden in the tray), otherwise spawn a fresh one.
  const rawUrl = extractDeepLinkArg(argv);
  if (rawUrl) {
    handleDeepLink(rawUrl);
    return;
  }
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
  recordEvent('native-autoupdater', 'before-quit-for-update');
});

// ── Native Squirrel.Mac autoUpdater diagnostics ────────────────────────────
//
// On macOS, electron-updater's `quitAndInstall()` hands the downloaded zip
// off to Electron's built-in `autoUpdater` (which binds Squirrel.Mac) via
// a local HTTP proxy. Squirrel.Mac then re-fetches the archive, validates
// the signature, and on success emits its own `update-downloaded` and
// quits the app to swap bundles.
//
// If the code signature of the downloaded archive does not match the
// running app's signing identity / team id, or Hardened Runtime / entitlements
// mismatch, or the zip is unsigned, Squirrel.Mac aborts SILENTLY: no native
// `update-downloaded`, no quit, no error surfaced through electron-updater
// (which has already considered the download "complete" at this point).
// The renderer sits on the "Relaunching" gate forever.
//
// These listeners append every native autoUpdater transition to the diagnostics
// log so the next failure self-reports the exact step Squirrel aborted on.
// They have no behavioural side-effect; the controller still owns the state
// machine.
electronAutoUpdater.on('error', (err: Error) => {
  const message = err instanceof Error ? err.message : String(err);
  recordEvent('native-autoupdater', 'error', { message });
});
electronAutoUpdater.on('checking-for-update', () => {
  recordEvent('native-autoupdater', 'checking-for-update');
});
electronAutoUpdater.on('update-available', () => {
  recordEvent('native-autoupdater', 'update-available');
});
electronAutoUpdater.on('update-not-available', () => {
  recordEvent('native-autoupdater', 'update-not-available');
});
electronAutoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
  recordEvent('native-autoupdater', 'update-downloaded', {
    releaseName: typeof releaseName === 'string' ? releaseName : null,
    hasReleaseNotes: typeof releaseNotes === 'string' && releaseNotes.length > 0,
  });
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
  // Start the auto-update gate BEFORE the renderer is created so the very
  // first `getDesktopUpdateState()` IPC call from the renderer returns a
  // `checking` snapshot — otherwise the renderer can briefly hydrate as
  // `idle` and unblock the PIN/auth surface underneath the update boundary.
  // No-ops in dev because `startDesktopUpdater` checks `app.isPackaged`.
  startDesktopUpdater(getMainWindow, {
    onBeforeQuitAndInstall: () => lifecycle.markQuitting(),
  });
  installAppMenu({
    onCheckForUpdates: checkForUpdatesFromShell,
  }, {
    appName: app.name || 'Hush',
    platform: process.platform,
  });
  spawnMainWindow();

  appTray = createAppTray({
    onShow: revealMainWindow,
    onCheckForUpdates: checkForUpdatesFromShell,
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
