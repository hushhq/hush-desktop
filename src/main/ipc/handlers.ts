import { ipcMain, app } from 'electron';
import { IPC_CHANNEL } from '../../shared/ipc-channels';
import { VaultSessionService, vaultSessionService } from '../vault/VaultSessionService';

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
}
