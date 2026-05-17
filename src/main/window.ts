import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { buildWindowOptions } from './window-config';
import type { LifecycleState } from './lifecycle';

const IS_DEV = process.env.NODE_ENV === 'development';
const WEB_DEV_URL = process.env.HUSH_WEB_URL ?? 'http://localhost:5173';
const PROD_URL = 'app://localhost/';

export function createMainWindow(lifecycle?: LifecycleState, initialPath = '/'): BrowserWindow {
  const preloadPath = join(__dirname, '../preload/index.js');
  const win = new BrowserWindow(buildWindowOptions(preloadPath));

  // Close-to-tray / menu-bar: route the OS close button through the
  // lifecycle interceptor so the window hides instead of being destroyed.
  // The renderer process stays alive — joined voice rooms, draft input,
  // scroll positions all survive a re-open without a reload.
  lifecycle?.attachCloseInterceptor(win);

  win.once('ready-to-show', () => win.show());

  // Route external link clicks to the OS browser rather than opening a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (IS_DEV) {
    win.loadURL(buildRendererUrl(WEB_DEV_URL, initialPath));
    win.webContents.openDevTools();
  } else {
    win.loadURL(buildRendererUrl(PROD_URL, initialPath));
  }

  return win;
}

export function loadRendererPath(win: BrowserWindow, path: string): void {
  win.loadURL(buildRendererUrl(IS_DEV ? WEB_DEV_URL : PROD_URL, path));
}

function buildRendererUrl(baseUrl: string, path: string): string {
  const target = new URL(baseUrl);
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const parsed = new URL(normalized, target);
  target.pathname = parsed.pathname;
  target.search = parsed.search;
  target.hash = parsed.hash;
  return target.toString();
}
