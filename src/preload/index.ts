import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi } from '../shared/desktop-api';
import type { DesktopUpdateState } from '../shared/desktop-update';
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
  setGlassMaterial: (material) =>
    ipcRenderer.invoke(IPC_CHANNEL.WINDOW_SET_GLASS_MATERIAL, material),
  measureInstanceHealth: (instanceUrl) =>
    ipcRenderer.invoke(IPC_CHANNEL.NETWORK_MEASURE_INSTANCE_HEALTH, instanceUrl),
  getDesktopUpdateState: () =>
    ipcRenderer.invoke(IPC_CHANNEL.UPDATE_GET_STATE) as Promise<DesktopUpdateState>,
  checkForDesktopUpdates: () =>
    ipcRenderer.invoke(IPC_CHANNEL.UPDATE_CHECK_NOW) as Promise<DesktopUpdateState>,
  onDesktopUpdateState: (listener) => {
    const wrapped = (_event: IpcRendererEvent, state: DesktopUpdateState) => listener(state);
    ipcRenderer.on(IPC_CHANNEL.UPDATE_STATE_EVENT, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNEL.UPDATE_STATE_EVENT, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('hushDesktop', api);
