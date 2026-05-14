import type { BrowserWindowConstructorOptions } from 'electron';

const HUSH_BLACK = '#09090b';
const HUSH_TEXT = '#EEEEF0';
const WIN_TITLEBAR_HEIGHT = 40;

/**
 * Pre-auth window floor.
 *
 * Width 900: gives the auth card breathing room plus space for the chrome
 * (traffic lights / titlebar overlay / drag region).
 *
 * Height 860: matches the tallest auth surface — the `LinkDevice`
 * "Waiting for approval" card stack (QR 264 + heading + instance picker
 * + code row + countdown + status + actions + back link + card and
 * `.ld-container` padding). Below this floor the flex-centered
 * `.home-page` wrapper pushes the card's bottom controls off-screen
 * with no scroll path.
 */
export const AUTH_MIN_WINDOW_WIDTH = 900;
export const AUTH_MIN_WINDOW_HEIGHT = 860;

/**
 * Post-auth (operative app) window floor.
 *
 * Once the user is authenticated the heavyweight auth/LinkDevice surfaces
 * are no longer reachable, so the floor can drop to a compact size that
 * still keeps the main shell usable (rail + sidebar + content column).
 */
export const APP_MIN_WINDOW_WIDTH = 940;
export const APP_MIN_WINDOW_HEIGHT = 500;

/**
 * Per-platform window chrome.
 * - macOS: hidden title bar with inset traffic lights, drag region drawn by renderer.
 * - Windows: hidden frame with `titleBarOverlay` so native min/max/close (and Win11 Snap
 *   Layouts) are drawn by Electron above the renderer's custom title bar.
 * - Linux: native frame retained — no overlay support.
 */
function buildPlatformChrome(
  platform: NodeJS.Platform,
): Partial<BrowserWindowConstructorOptions> {
  if (platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset' };
  }
  if (platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: HUSH_BLACK,
        symbolColor: HUSH_TEXT,
        height: WIN_TITLEBAR_HEIGHT,
      },
    };
  }
  return {};
}

/**
 * Returns secure BrowserWindow construction options.
 * Extracted as a pure function so security defaults can be unit-tested
 * without instantiating Electron.
 */
export function buildWindowOptions(
  preloadPath: string,
  platform: NodeJS.Platform = process.platform,
): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 900,
    minWidth: AUTH_MIN_WINDOW_WIDTH,
    minHeight: AUTH_MIN_WINDOW_HEIGHT,
    show: false,
    resizable: true,
    backgroundColor: HUSH_BLACK,
    ...buildPlatformChrome(platform),
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  };
}
