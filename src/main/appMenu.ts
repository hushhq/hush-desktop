import { Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

export interface AppMenuHooks {
  onCheckForUpdates: () => void;
}

export interface AppMenuOptions {
  appName: string;
  platform: NodeJS.Platform;
}

export function buildAppMenuTemplate(
  hooks: AppMenuHooks,
  opts: AppMenuOptions,
): MenuItemConstructorOptions[] {
  if (opts.platform === 'darwin') return buildMacMenuTemplate(hooks, opts.appName);
  return buildDefaultMenuTemplate(hooks);
}

export function installAppMenu(hooks: AppMenuHooks, opts: AppMenuOptions): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildAppMenuTemplate(hooks, opts)));
}

function buildMacMenuTemplate(
  hooks: AppMenuHooks,
  appName: string,
): MenuItemConstructorOptions[] {
  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates...', click: hooks.onCheckForUpdates },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    buildEditMenu(),
    buildViewMenu(),
    buildWindowMenu(),
  ];
}

function buildDefaultMenuTemplate(hooks: AppMenuHooks): MenuItemConstructorOptions[] {
  return [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    buildEditMenu(),
    buildViewMenu(),
    buildWindowMenu(),
    {
      label: 'Help',
      submenu: [
        { label: 'Check for Updates...', click: hooks.onCheckForUpdates },
        { type: 'separator' },
        { role: 'about' },
      ],
    },
  ];
}

function buildEditMenu(): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  };
}

function buildViewMenu(): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };
}

function buildWindowMenu(): MenuItemConstructorOptions {
  return {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'close' },
    ],
  };
}
