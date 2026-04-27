import { describe, it, expect } from 'vitest';
import { IPC_CHANNEL } from '../src/shared/ipc-channels';

describe('IPC_CHANNEL', () => {
  it('all values are non-empty strings', () => {
    for (const value of Object.values(IPC_CHANNEL)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('all values follow namespace:action pattern', () => {
    for (const value of Object.values(IPC_CHANNEL)) {
      expect(value).toMatch(/^[a-z]+:[a-z-]+$/);
    }
  });

  it('has no duplicate values', () => {
    const values = Object.values(IPC_CHANNEL);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
