import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { buildWindowOptions } from './window-config';

const IS_DEV = process.env.NODE_ENV === 'development';
const WEB_DEV_URL = process.env.HUSH_WEB_URL ?? 'http://localhost:5173';
const PROD_URL = 'app://localhost/';

export function createMainWindow(): BrowserWindow {
  const preloadPath = join(__dirname, '../preload/index.js');
  const win = new BrowserWindow(buildWindowOptions(preloadPath));

  win.once('ready-to-show', () => win.show());

  // Route external link clicks to the OS browser rather than opening a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (IS_DEV) {
    win.loadURL(WEB_DEV_URL);
    win.webContents.openDevTools();
  } else {
    win.loadURL(PROD_URL);
  }

  return win;
}
