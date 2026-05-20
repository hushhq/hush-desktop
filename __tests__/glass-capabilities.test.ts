import { describe, expect, it } from 'vitest';
import {
  WIN11_22H2_BUILD,
  computeGlassCapabilities,
  parseWindowsBuildNumber,
} from '../src/main/glass-capabilities';

describe('parseWindowsBuildNumber', () => {
  it('extracts the build number from a Windows release string', () => {
    expect(parseWindowsBuildNumber('10.0.22621.1234')).toBe(22621);
    expect(parseWindowsBuildNumber('10.0.22000.100')).toBe(22000);
  });

  it('rejects malformed inputs', () => {
    expect(parseWindowsBuildNumber('')).toBeNull();
    expect(parseWindowsBuildNumber('10.0')).toBeNull();
    expect(parseWindowsBuildNumber('foo.bar.baz')).toBeNull();
    expect(parseWindowsBuildNumber('10.0.NaN.0')).toBeNull();
    expect(parseWindowsBuildNumber(undefined as unknown as string)).toBeNull();
  });
});

describe('computeGlassCapabilities', () => {
  it('reports macOS as fully supported with the curated vibrancy set', () => {
    const caps = computeGlassCapabilities('darwin', '24.4.0');
    expect(caps).toEqual({
      platform: 'darwin',
      materialSwitchingSupported: true,
      materials: ['auto', 'sidebar', 'under-window', 'menu', 'headerView'],
      unsupportedReason: null,
    });
  });

  it('enables Windows only on builds >= 22H2 (22621)', () => {
    const caps = computeGlassCapabilities('win32', '10.0.22621.1234');
    expect(caps.materialSwitchingSupported).toBe(true);
    expect(caps.materials).toEqual(['auto', 'mica', 'acrylic']);
    expect(caps.unsupportedReason).toBeNull();
  });

  it('disables Windows below 22H2', () => {
    const caps = computeGlassCapabilities('win32', '10.0.22000.100');
    expect(caps.materialSwitchingSupported).toBe(false);
    expect(caps.materials).toEqual([]);
    expect(caps.unsupportedReason).toBe('win32-pre-22h2');
  });

  it('disables Windows when the release string is unparseable', () => {
    const caps = computeGlassCapabilities('win32', 'unknown');
    expect(caps.materialSwitchingSupported).toBe(false);
    expect(caps.unsupportedReason).toBe('win32-unparseable-release');
  });

  it('disables Linux unconditionally', () => {
    const caps = computeGlassCapabilities('linux', '6.6.0');
    expect(caps.materialSwitchingSupported).toBe(false);
    expect(caps.materials).toEqual([]);
    expect(caps.unsupportedReason).toBe('linux-no-native-material');
  });

  it('keeps the 22H2 build constant aligned with public Windows release notes', () => {
    expect(WIN11_22H2_BUILD).toBe(22621);
  });
});
