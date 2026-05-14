import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.js');
const afterPack = require('../scripts/after-pack.cjs');

function loadConfigWithReleaseFlag(value: string | undefined) {
  const configPath = require.resolve('../electron-builder.config.js');
  const previous = process.env.HUSH_DESKTOP_RELEASE_BUILD;
  delete require.cache[configPath];
  if (value === undefined) {
    delete process.env.HUSH_DESKTOP_RELEASE_BUILD;
  } else {
    process.env.HUSH_DESKTOP_RELEASE_BUILD = value;
  }
  try {
    return require('../electron-builder.config.js');
  } finally {
    delete require.cache[configPath];
    if (previous === undefined) {
      delete process.env.HUSH_DESKTOP_RELEASE_BUILD;
    } else {
      process.env.HUSH_DESKTOP_RELEASE_BUILD = previous;
    }
  }
}

describe('electron-builder app identity', () => {
  it('uses a separate bundle id for local package builds', () => {
    const localConfig = loadConfigWithReleaseFlag(undefined);
    expect(localConfig.appId).toBe('live.gethush.desktop.local');
    expect(localConfig.productName).toBe('Hush Local');
  });

  it('uses the production bundle id only for release builds', () => {
    const releaseConfig = loadConfigWithReleaseFlag('1');
    expect(releaseConfig.appId).toBe('live.gethush.desktop');
    expect(releaseConfig.productName).toBe('Hush');
  });
});

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

  it('enables ad-hoc fallback only when no signing identity is configured', () => {
    expect(
      afterPack._private.canApplyAdHocFallback({
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      }),
    ).toBe(true);

    expect(
      afterPack._private.canApplyAdHocFallback({
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        CSC_NAME: 'Developer ID Application: Example',
      }),
    ).toBe(false);

    expect(
      afterPack._private.canApplyAdHocFallback({
        CSC_LINK: 'base64-cert',
      }),
    ).toBe(false);

    expect(afterPack._private.canApplyAdHocFallback({})).toBe(true);
  });
});

describe('electron-builder tray icon bundling', () => {
  it('ships build/icon.png into Resources for non-mac tray fallback', () => {
    const trayResource = config.extraResources?.find(
      (entry: { from?: string; to?: string }) =>
        entry?.from === 'build/icon.png' && entry?.to === 'build/icon.png',
    );
    expect(trayResource).toBeTruthy();
  });

  it('ships macOS tray template images into Resources for native menu-bar rendering', () => {
    const resources = config.extraResources ?? [];
    expect(resources).toContainEqual({
      from: 'build/trayIconTemplate.png',
      to: 'build/trayIconTemplate.png',
    });
    expect(resources).toContainEqual({
      from: 'build/trayIconTemplate@2x.png',
      to: 'build/trayIconTemplate@2x.png',
    });
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
