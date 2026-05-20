import { ipcMain, app, BrowserWindow, net } from 'electron';
import { IPC_CHANNEL } from '../../shared/ipc-channels';
import { VaultSessionService, vaultSessionService } from '../vault/VaultSessionService';
import {
  APP_MIN_WINDOW_HEIGHT,
  APP_MIN_WINDOW_WIDTH,
  AUTH_MIN_WINDOW_HEIGHT,
  AUTH_MIN_WINDOW_WIDTH,
} from '../window-config';
import {
  measureInstanceHealth,
  type FetchLike,
} from '../network/measureInstanceHealth';
import {
  getDesktopUpdateStateSnapshot,
  requestDesktopUpdateCheck,
} from '../update/desktopUpdaterRegistry';
import { applyGlassMaterialToBrowserWindow } from '../glass-material';
import { computeGlassCapabilities } from '../glass-capabilities';
import { release as osRelease } from 'node:os';

/**
 * Two-level resize floor: tall for the pre-login LinkDevice surface,
 * compact for the operative app shell. Switched by the renderer via
 * `window.hushDesktop.setMinWindowFloor(profile)` as the boot state
 * crosses the auth boundary.
 */
export const WINDOW_FLOOR = {
  auth: { width: AUTH_MIN_WINDOW_WIDTH, height: AUTH_MIN_WINDOW_HEIGHT },
  app: { width: APP_MIN_WINDOW_WIDTH, height: APP_MIN_WINDOW_HEIGHT },
} as const;

export type WindowFloorProfile = keyof typeof WINDOW_FLOOR;

/**
 * Minimal contract the floor handler needs from a window. Carved out so the
 * handler can be unit-tested without instantiating Electron.
 */
export interface ResizableWindow {
  setMinimumSize(width: number, height: number): void;
  /**
   * Electron's `BrowserWindow.getSize()` is typed as `number[]` rather than
   * a tuple. Keep the interface compatible while we only ever read the first
   * two entries below.
   */
  getSize(): number[];
  setSize(width: number, height: number): void;
}

export function buildWindowFloorHandler() {
  return {
    setMinFloor(win: ResizableWindow | null, profile: unknown): void {
      if (!win) return;
      if (profile !== 'auth' && profile !== 'app') {
        throw new Error(
          `window:set-min-floor: invalid profile ${JSON.stringify(profile)}`,
        );
      }
      const floor = WINDOW_FLOOR[profile];
      win.setMinimumSize(floor.width, floor.height);
      // If the window is currently smaller than the new floor, grow it so
      // the OS does not leave the renderer painted below its own minimum.
      const size = win.getSize();
      const currentWidth = size[0] ?? floor.width;
      const currentHeight = size[1] ?? floor.height;
      const nextWidth = Math.max(currentWidth, floor.width);
      const nextHeight = Math.max(currentHeight, floor.height);
      if (nextWidth !== currentWidth || nextHeight !== currentHeight) {
        win.setSize(nextWidth, nextHeight);
      }
    },
  };
}

/**
 * Pure handler logic, extracted from Electron coupling for unit testing.
 * Each handler validates its inputs and delegates to the service.
 */
export function buildVaultHandlers(service: VaultSessionService) {
  return {
    setSessionKey(userId: unknown, rawKeyHex: unknown): void {
      if (typeof userId !== 'string' || userId.length === 0) {
        throw new Error('vault:set-session-key: invalid userId');
      }
      if (typeof rawKeyHex !== 'string' || rawKeyHex.length === 0) {
        throw new Error('vault:set-session-key: invalid rawKeyHex');
      }
      service.setSessionKey(userId, rawKeyHex);
    },

    getSessionKey(userId: unknown): string | null {
      if (typeof userId !== 'string' || userId.length === 0) return null;
      return service.getSessionKey(userId);
    },

    clearSessionKey(userId: unknown): void {
      if (typeof userId !== 'string' || userId.length === 0) return;
      service.clearSessionKey(userId);
    },
  };
}

export function registerIpcHandlers(): void {
  const vault = buildVaultHandlers(vaultSessionService);
  const windowFloor = buildWindowFloorHandler();

  ipcMain.handle(IPC_CHANNEL.GET_APP_VERSION, () => app.getVersion());

  ipcMain.handle(IPC_CHANNEL.VAULT_SET_SESSION_KEY, (_e, userId, rawKeyHex) =>
    vault.setSessionKey(userId, rawKeyHex),
  );
  ipcMain.handle(IPC_CHANNEL.VAULT_GET_SESSION_KEY, (_e, userId) =>
    vault.getSessionKey(userId),
  );
  ipcMain.handle(IPC_CHANNEL.VAULT_CLEAR_SESSION_KEY, (_e, userId) =>
    vault.clearSessionKey(userId),
  );
  ipcMain.handle(IPC_CHANNEL.WINDOW_SET_MIN_FLOOR, (event, profile) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    windowFloor.setMinFloor(win, profile);
  });
  const glassCapabilities = computeGlassCapabilities(process.platform, osRelease());
  ipcMain.handle(IPC_CHANNEL.WINDOW_SET_GLASS_MATERIAL, (event, material) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    applyGlassMaterialToBrowserWindow(win, material, glassCapabilities);
  });
  ipcMain.handle(IPC_CHANNEL.WINDOW_GET_GLASS_CAPABILITIES, () => glassCapabilities);
  ipcMain.handle(
    IPC_CHANNEL.NETWORK_MEASURE_INSTANCE_HEALTH,
    (_event, instanceUrl) => measureInstanceHealth(instanceUrl, buildDefaultFetch()),
  );
  ipcMain.handle(IPC_CHANNEL.UPDATE_GET_STATE, () =>
    getDesktopUpdateStateSnapshot(app.getVersion()),
  );
  ipcMain.handle(IPC_CHANNEL.UPDATE_CHECK_NOW, () =>
    requestDesktopUpdateCheck(app.getVersion()),
  );
}

/**
 * Adapter from Electron `net.fetch` to the `FetchLike` shape consumed by
 * the pure handler. `net.fetch` was added in Electron 28; it runs on the
 * main process network stack, so requests are not subject to renderer
 * COEP / CORS policies. Reused across IPC calls but instantiated lazily
 * so test environments without Electron's `net` symbol stay importable.
 */
function buildDefaultFetch(): FetchLike {
  if (typeof net !== 'undefined' && typeof net.fetch === 'function') {
    return ((url, init) => net.fetch(url, init)) as FetchLike;
  }
  // Fallback for environments where Electron's `net` is not available
  // (unit tests, dev tooling). The handler is dependency-injected in
  // tests, so this branch only fires when the runtime is misconfigured.
  return ((url, init) => fetch(url, init as RequestInit)) as FetchLike;
}
