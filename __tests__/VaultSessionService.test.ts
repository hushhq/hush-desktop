import { describe, it, expect, beforeEach } from 'vitest';
import { VaultSessionService } from '../src/main/vault/VaultSessionService';

describe('VaultSessionService', () => {
  let svc: VaultSessionService;

  beforeEach(() => {
    svc = new VaultSessionService();
  });

  it('stores and retrieves a session key', () => {
    svc.setSessionKey('user1', 'deadbeef');
    expect(svc.getSessionKey('user1')).toBe('deadbeef');
  });

  it('returns null for unknown user', () => {
    expect(svc.getSessionKey('nobody')).toBeNull();
  });

  it('overwrites existing key for same user', () => {
    svc.setSessionKey('user1', 'key1');
    svc.setSessionKey('user1', 'key2');
    expect(svc.getSessionKey('user1')).toBe('key2');
  });

  it('clearSessionKey removes only the targeted user', () => {
    svc.setSessionKey('user1', 'deadbeef');
    svc.setSessionKey('user2', 'cafebabe');
    svc.clearSessionKey('user1');
    expect(svc.getSessionKey('user1')).toBeNull();
    expect(svc.getSessionKey('user2')).toBe('cafebabe');
  });

  it('clearSessionKey on unknown user does not throw', () => {
    expect(() => svc.clearSessionKey('nobody')).not.toThrow();
  });

  it('clearAll removes every session', () => {
    svc.setSessionKey('user1', 'deadbeef');
    svc.setSessionKey('user2', 'cafebabe');
    svc.clearAll();
    expect(svc.getSessionKey('user1')).toBeNull();
    expect(svc.getSessionKey('user2')).toBeNull();
    expect(svc.size).toBe(0);
  });

  it('size tracks the number of active sessions', () => {
    expect(svc.size).toBe(0);
    svc.setSessionKey('user1', 'k');
    expect(svc.size).toBe(1);
    svc.setSessionKey('user2', 'k');
    expect(svc.size).toBe(2);
    svc.clearSessionKey('user1');
    expect(svc.size).toBe(1);
  });
});
