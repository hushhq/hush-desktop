import { describe, expect, it, vi } from 'vitest';
import {
  applyGlassMaterial,
  GlassMaterialError,
  type MaterialApplyTarget,
} from '../src/main/glass-material';

function buildTarget(): MaterialApplyTarget & {
  vibrancyCalls: Array<unknown>;
  backgroundCalls: Array<unknown>;
} {
  const vibrancyCalls: Array<unknown> = [];
  const backgroundCalls: Array<unknown> = [];
  return {
    vibrancyCalls,
    backgroundCalls,
    setVibrancy: vi.fn((value: unknown) => {
      vibrancyCalls.push(value);
    }),
    setBackgroundMaterial: vi.fn((value: unknown) => {
      backgroundCalls.push(value);
    }),
  };
}

describe('applyGlassMaterial', () => {
  it('resolves "auto" to the conservative macOS vibrancy', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'auto', 'darwin');
    expect(target.vibrancyCalls).toEqual(['sidebar']);
    expect(target.backgroundCalls).toEqual([]);
  });

  it('applies a whitelisted macOS material', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'under-window', 'darwin');
    expect(target.vibrancyCalls).toEqual(['under-window']);
  });

  it('ignores Win11 materials on macOS rather than crashing', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'mica', 'darwin');
    expect(target.vibrancyCalls).toEqual([]);
  });

  it('resolves "auto" to mica on Windows', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'auto', 'win32');
    expect(target.backgroundCalls).toEqual(['mica']);
    expect(target.vibrancyCalls).toEqual([]);
  });

  it('applies a whitelisted Windows material', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'acrylic', 'win32');
    expect(target.backgroundCalls).toEqual(['acrylic']);
  });

  it('ignores macOS materials on Windows rather than crashing', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'sidebar', 'win32');
    expect(target.backgroundCalls).toEqual([]);
  });

  it('is a no-op on Linux', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'auto', 'linux');
    applyGlassMaterial(target, 'mica', 'linux');
    applyGlassMaterial(target, 'sidebar', 'linux');
    expect(target.vibrancyCalls).toEqual([]);
    expect(target.backgroundCalls).toEqual([]);
  });

  it('rejects unknown material identifiers', () => {
    const target = buildTarget();
    expect(() => applyGlassMaterial(target, 'plaid', 'darwin')).toThrow(
      GlassMaterialError,
    );
  });

  it('is a safe no-op when the window is null', () => {
    expect(() => applyGlassMaterial(null, 'auto', 'darwin')).not.toThrow();
  });

  it('survives runtimes that lack setVibrancy / setBackgroundMaterial', () => {
    const macStub: MaterialApplyTarget = {};
    const winStub: MaterialApplyTarget = {};
    expect(() => applyGlassMaterial(macStub, 'sidebar', 'darwin')).not.toThrow();
    expect(() => applyGlassMaterial(winStub, 'mica', 'win32')).not.toThrow();
  });
});
