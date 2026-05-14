import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/desktop-api';
import { IPC_CHANNEL } from '../shared/ipc-channels';

/**
 * Minimal preload bridge. Exposes only the exact methods the renderer needs.
 * No generic invoke — each IPC method is named explicitly to constrain surface area.
 */
const api: DesktopApi = {
  isDesktop: true,
  platform: process.platform,
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNEL.GET_APP_VERSION),
  setVaultSessionKey: (userId, rawKeyHex) =>
    ipcRenderer.invoke(IPC_CHANNEL.VAULT_SET_SESSION_KEY, userId, rawKeyHex),
  getVaultSessionKey: (userId) =>
    ipcRenderer.invoke(IPC_CHANNEL.VAULT_GET_SESSION_KEY, userId),
  clearVaultSessionKey: (userId) =>
    ipcRenderer.invoke(IPC_CHANNEL.VAULT_CLEAR_SESSION_KEY, userId),
  setMinWindowFloor: (profile) =>
    ipcRenderer.invoke(IPC_CHANNEL.WINDOW_SET_MIN_FLOOR, profile),
  measureInstanceHealth: (instanceUrl) =>
    ipcRenderer.invoke(IPC_CHANNEL.NETWORK_MEASURE_INSTANCE_HEALTH, instanceUrl),
};

contextBridge.exposeInMainWorld('hushDesktop', api);
