import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.js');
const afterPack = require('../scripts/after-pack.cjs');

describe('electron-builder macOS media entitlements', () => {
  it('signs the app and helper processes with the media entitlement file', () => {
    expect(config.mac?.entitlements).toBe('build/entitlements.mac.plist');
    expect(config.mac?.entitlementsInherit).toBe('build/entitlements.mac.plist');
  });

  it('allows macOS TCC to prompt for microphone and camera access', () => {
    const entitlements = readFileSync(
      resolve(__dirname, '../build/entitlements.mac.plist'),
      'utf8',
    );

    expect(entitlements).toContain('<key>com.apple.security.device.audio-input</key>');
    expect(entitlements).toContain('<key>com.apple.security.device.camera</key>');
    expect(entitlements).toContain('<key>com.apple.security.cs.allow-jit</key>');
    expect(entitlements).toContain('<key>com.apple.security.cs.disable-library-validation</key>');
  });
});

describe('electron-builder macOS signing fallback', () => {
  it('runs the afterPack hook so unsigned CI bundles still get sealed', () => {
    expect(config.afterPack).toBe('scripts/after-pack.cjs');
  });

  it('only enables ad-hoc fallback for explicitly unsigned builds', () => {
    expect(
      afterPack._private.isExplicitlyUnsignedBuild({
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      }),
    ).toBe(true);

    expect(
      afterPack._private.isExplicitlyUnsignedBuild({
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        CSC_NAME: 'Developer ID Application: Example',
      }),
    ).toBe(false);

    expect(afterPack._private.isExplicitlyUnsignedBuild({})).toBe(false);
  });
});

describe('electron-builder update feed', () => {
  it('publishes release metadata to the public GitHub Releases feed', () => {
    expect(config.publish).toEqual([
      {
        provider: 'github',
        owner: 'hushhq',
        repo: 'hush-desktop',
        releaseType: 'release',
      },
    ]);
  });
});
