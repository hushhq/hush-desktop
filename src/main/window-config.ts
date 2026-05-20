import type { BrowserWindowConstructorOptions } from 'electron';

const HUSH_BLACK = '#09090b';
const HUSH_TEXT = '#EEEEF0';
const WIN_TITLEBAR_HEIGHT = 40;
// Fully transparent background. Required so native vibrancy (macOS) /
// backgroundMaterial mica (Win11) actually shows through the window
// instead of being covered by an opaque pre-paint fill.
const TRANSPARENT_BACKGROUND = '#00000000';

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
        color: TRANSPARENT_BACKGROUND,
        symbolColor: HUSH_TEXT,
        height: WIN_TITLEBAR_HEIGHT,
      },
    };
  }
  return {};
}

/**
 * Per-platform native window material so the authenticated shell's
 * server-rail / channel-sidebar / topbar chrome blends with the OS
 * desktop surface instead of reading as a flat gray slab.
 *
 * - macOS: NSVisualEffectView with `sidebar` material (subtle, neutral,
 *   matches what native sidebar surfaces use in Finder, Mail, etc.).
 *   `visualEffectState: 'active'` keeps the material vibrant even when
 *   the window is in the background, so the shell does not flip to a
 *   different tint on focus changes.
 *   The window paints with a fully transparent background so the
 *   vibrancy layer is visible from the first frame; CSS keeps the
 *   chat content opaque.
 * - Windows 11: `backgroundMaterial: 'mica'` is the conservative
 *   Windows analog. Older Windows builds where mica is unsupported
 *   ignore the hint and fall back to the transparent backgroundColor
 *   plus the CSS chrome color, which still reads as a regular dark
 *   sidebar surface.
 * - Linux: no native material — keep the solid Hush black so the
 *   shell does not show a transparent void.
 */
function buildPlatformMaterial(
  platform: NodeJS.Platform,
): Partial<BrowserWindowConstructorOptions> {
  if (platform === 'darwin') {
    return {
      backgroundColor: TRANSPARENT_BACKGROUND,
      // `menu` is the macOS vibrancy default. The material selector is
      // hidden in the renderer, so BrowserWindow init must match
      // `glass-material.ts`' `auto` resolution: first paint and the
      // post-IPC `auto` apply land on the same NSVisualEffectView
      // material.
      vibrancy: 'menu',
      visualEffectState: 'active',
    };
  }
  if (platform === 'win32') {
    return {
      backgroundColor: TRANSPARENT_BACKGROUND,
      backgroundMaterial: 'mica',
    };
  }
  return { backgroundColor: HUSH_BLACK };
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
    ...buildPlatformMaterial(platform),
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
