import { describe, expect, it, vi } from 'vitest';
import {
  applyGlassMaterial,
  GlassMaterialError,
  type MaterialApplyTarget,
} from '../src/main/glass-material';
import {
  computeGlassCapabilities,
  type GlassCapabilities,
} from '../src/main/glass-capabilities';

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

const macCaps: GlassCapabilities = computeGlassCapabilities('darwin', '24.4.0');
const win22h2Caps: GlassCapabilities = computeGlassCapabilities(
  'win32',
  '10.0.22621.1234',
);
const win22000Caps: GlassCapabilities = computeGlassCapabilities(
  'win32',
  '10.0.22000.100',
);
const linuxCaps: GlassCapabilities = computeGlassCapabilities('linux', '6.6.0');

describe('applyGlassMaterial', () => {
  it('resolves "auto" to the macOS menu vibrancy default', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'auto', macCaps);
    expect(target.vibrancyCalls).toEqual(['menu']);
    expect(target.backgroundCalls).toEqual([]);
  });

  it('applies a whitelisted macOS material', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'under-window', macCaps);
    expect(target.vibrancyCalls).toEqual(['under-window']);
  });

  it('rejects a Win11 material on macOS', () => {
    const target = buildTarget();
    expect(() => applyGlassMaterial(target, 'mica', macCaps)).toThrow(
      GlassMaterialError,
    );
    expect(target.vibrancyCalls).toEqual([]);
  });

  it('resolves "auto" to mica on Windows 11 22H2+', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'auto', win22h2Caps);
    expect(target.backgroundCalls).toEqual(['mica']);
    expect(target.vibrancyCalls).toEqual([]);
  });

  it('applies a whitelisted Windows material on Win11 22H2+', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'acrylic', win22h2Caps);
    expect(target.backgroundCalls).toEqual(['acrylic']);
  });

  it('rejects a macOS material on Windows', () => {
    const target = buildTarget();
    expect(() => applyGlassMaterial(target, 'sidebar', win22h2Caps)).toThrow(
      GlassMaterialError,
    );
    expect(target.backgroundCalls).toEqual([]);
  });

  it('is a no-op on Windows builds older than 22H2', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'auto', win22000Caps);
    applyGlassMaterial(target, 'mica', win22000Caps);
    expect(target.backgroundCalls).toEqual([]);
    expect(target.vibrancyCalls).toEqual([]);
  });

  it('is a no-op on Linux', () => {
    const target = buildTarget();
    applyGlassMaterial(target, 'auto', linuxCaps);
    applyGlassMaterial(target, 'mica', linuxCaps);
    applyGlassMaterial(target, 'sidebar', linuxCaps);
    expect(target.vibrancyCalls).toEqual([]);
    expect(target.backgroundCalls).toEqual([]);
  });

  it('rejects unknown material identifiers', () => {
    const target = buildTarget();
    expect(() => applyGlassMaterial(target, 'plaid', macCaps)).toThrow(
      GlassMaterialError,
    );
  });

  it('rejects non-string inputs before consulting capabilities', () => {
    const target = buildTarget();
    expect(() => applyGlassMaterial(target, 42, macCaps)).toThrow(
      GlassMaterialError,
    );
  });

  it('is a safe no-op when the window is null', () => {
    expect(() => applyGlassMaterial(null, 'auto', macCaps)).not.toThrow();
  });

  it('survives runtimes that lack setVibrancy / setBackgroundMaterial', () => {
    const macStub: MaterialApplyTarget = {};
    const winStub: MaterialApplyTarget = {};
    expect(() => applyGlassMaterial(macStub, 'sidebar', macCaps)).not.toThrow();
    expect(() => applyGlassMaterial(winStub, 'mica', win22h2Caps)).not.toThrow();
  });
});
