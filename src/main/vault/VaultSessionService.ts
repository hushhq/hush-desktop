/**
 * Main-process in-memory vault session store.
 *
 * Holds the per-user AES-256 wrapping key hex string after a successful PIN
 * unlock. Keys are never written to disk or exposed to the renderer — they live
 * only in this Node.js process. contextIsolation + nodeIntegration:false ensures
 * renderer scripts cannot reach main-process memory, so a key held here is not
 * reachable from any script running in the renderer sandbox.
 *
 * Keys are cleared on lockVault, performLogout, or app quit. They are NOT
 * backed by the OS keychain in this slice — that remains deferred.
 */
export class VaultSessionService {
  private readonly sessions = new Map<string, string>();

  setSessionKey(userId: string, rawKeyHex: string): void {
    this.sessions.set(userId, rawKeyHex);
  }

  getSessionKey(userId: string): string | null {
    return this.sessions.get(userId) ?? null;
  }

  clearSessionKey(userId: string): void {
    this.sessions.delete(userId);
  }

  clearAll(): void {
    this.sessions.clear();
  }

  get size(): number {
    return this.sessions.size;
  }
}

export const vaultSessionService = new VaultSessionService();
