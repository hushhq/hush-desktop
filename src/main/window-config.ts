import type { BrowserWindowConstructorOptions } from 'electron';

const HUSH_BLACK = '#09090b';
const HUSH_TEXT = '#EEEEF0';
const WIN_TITLEBAR_HEIGHT = 40;

/**
 * Minimum window dimensions required to keep the auth/login card surfaces
 * fully usable inside the window without triggering the flex-centered scroll
 * clip on `.home-page` (`display: flex; align-items: center; overflow-y: auto`).
 *
 * The dominant constraint is the `LinkDevice` "Link to existing device" card:
 * QR (264px) + section title + subtitle + instance selector + code label/row +
 * countdown + "Waiting for approval" + actions + back link, plus card padding
 * (32+32) and `.ld-container` padding (top clamp 48-96px / bottom 48px).
 *
 * Empirically (and mathematically) this content stack lands around 860px tall.
 * If the window is allowed to shrink below that, the flex-centered viewport
 * pushes the bottom of the card (regenerate / back link / status) below the
 * bottom edge with no scroll path — they become unreachable.
 *
 * Width: the auth card is capped at ~420px by `.home-container`; 900px gives
 * the card breathing room plus space for the chrome (titlebar overlay /
 * inset traffic lights / drag region).
 */
export const AUTH_MIN_WINDOW_WIDTH = 900;
export const AUTH_MIN_WINDOW_HEIGHT = 860;

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
