import { app, BrowserWindow } from 'electron';
import { registerAppScheme, registerAppProtocol } from './protocol';
import { createMainWindow } from './window';
import { registerIpcHandlers } from './ipc/handlers';

// registerAppScheme must run before app.whenReady()
registerAppScheme();

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
