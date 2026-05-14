import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.js');

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
