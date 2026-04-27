import { describe, it, expect, beforeEach } from 'vitest';
import { buildVaultHandlers } from '../src/main/ipc/handlers';
import { VaultSessionService } from '../src/main/vault/VaultSessionService';

describe('buildVaultHandlers', () => {
  let service: VaultSessionService;
  let handlers: ReturnType<typeof buildVaultHandlers>;

  beforeEach(() => {
    service = new VaultSessionService();
    handlers = buildVaultHandlers(service);
  });

  describe('setSessionKey', () => {
    it('stores a key in the service', () => {
      handlers.setSessionKey('user1', 'deadbeef');
      expect(service.getSessionKey('user1')).toBe('deadbeef');
    });

    it('throws on empty userId', () => {
      expect(() => handlers.setSessionKey('', 'deadbeef')).toThrow('invalid userId');
    });

    it('throws on empty rawKeyHex', () => {
      expect(() => handlers.setSessionKey('user1', '')).toThrow('invalid rawKeyHex');
    });

    it('throws on non-string userId', () => {
      expect(() => handlers.setSessionKey(null, 'deadbeef')).toThrow('invalid userId');
    });

    it('throws on non-string rawKeyHex', () => {
      expect(() => handlers.setSessionKey('user1', 42)).toThrow('invalid rawKeyHex');
    });

    it('throws on numeric userId', () => {
      expect(() => handlers.setSessionKey(123, 'deadbeef')).toThrow('invalid userId');
    });
  });

  describe('getSessionKey', () => {
    it('returns null for non-string userId', () => {
      expect(handlers.getSessionKey(null)).toBeNull();
    });

    it('returns null for empty string userId', () => {
      expect(handlers.getSessionKey('')).toBeNull();
    });

    it('returns null when no key is stored', () => {
      expect(handlers.getSessionKey('user1')).toBeNull();
    });

    it('returns the stored key', () => {
      service.setSessionKey('user1', 'deadbeef');
      expect(handlers.getSessionKey('user1')).toBe('deadbeef');
    });
  });

  describe('clearSessionKey', () => {
    it('removes a stored key', () => {
      service.setSessionKey('user1', 'deadbeef');
      handlers.clearSessionKey('user1');
      expect(service.getSessionKey('user1')).toBeNull();
    });

    it('is a no-op for unknown user', () => {
      expect(() => handlers.clearSessionKey('nobody')).not.toThrow();
    });

    it('is a no-op for empty string', () => {
      expect(() => handlers.clearSessionKey('')).not.toThrow();
    });

    it('is a no-op for non-string input', () => {
      expect(() => handlers.clearSessionKey(null)).not.toThrow();
    });

    it('does not affect other users', () => {
      service.setSessionKey('user1', 'k1');
      service.setSessionKey('user2', 'k2');
      handlers.clearSessionKey('user1');
      expect(service.getSessionKey('user2')).toBe('k2');
    });
  });
});
