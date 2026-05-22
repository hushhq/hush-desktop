import { describe, expect, it, vi } from 'vitest';
import {
  recoverNativeMaterial,
  type RecoverableMaterialWindow,
} from '../src/main/window-material-recovery';

function buildWindow(): RecoverableMaterialWindow & {
  vibrancyCalls: string[];
  materialCalls: string[];
} {
  const vibrancyCalls: string[] = [];
  const materialCalls: string[] = [];
  return {
    vibrancyCalls,
    materialCalls,
    on: vi.fn(),
    isDestroyed: () => false,
    setVibrancy: (value) => vibrancyCalls.push(value),
    setBackgroundMaterial: (value) => materialCalls.push(value),
  };
}

describe('recoverNativeMaterial', () => {
  it('re-applies mica on Windows', () => {
    const win = buildWindow();
    recoverNativeMaterial(win, 'win32');
    expect(win.materialCalls).toEqual(['mica']);
    expect(win.vibrancyCalls).toEqual([]);
  });

  it('re-applies menu vibrancy on macOS', () => {
    const win = buildWindow();
    recoverNativeMaterial(win, 'darwin');
    expect(win.vibrancyCalls).toEqual(['menu']);
    expect(win.materialCalls).toEqual([]);
  });

  it('does not touch destroyed windows', () => {
    const win = {
      ...buildWindow(),
      isDestroyed: () => true,
    };
    recoverNativeMaterial(win, 'win32');
    expect(win.materialCalls).toEqual([]);
  });
});
