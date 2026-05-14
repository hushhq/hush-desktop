/**
 * electron-builder configuration.
 *
 * Icons: the brand icon is mirrored from hush-web/public/icon-512.png into
 * build/icon.png, build/icon.icns, and macOS tray template PNGs by
 * `npm run copy-icons`, which the dist:* scripts invoke automatically.
 *
 * Renderer assets: run `npm run copy-renderer` (copies ../hush-web/dist → renderer/)
 * before packaging. electron-builder copies renderer/ into app resources via
 * extraResources so it lives outside the asar (required for net.fetch file:// serving).
 *
 * Code signing posture: this config does NOT pin a specific identity or
 * configure notarize. electron-builder picks the first available macOS
 * signing identity in the local keychain when auto-discovery is enabled.
 * In unsigned CI builds, afterPack applies an ad-hoc signature so the app
 * bundle is at least structurally valid. That is NOT a Developer ID
 * Application signature, and notarization is skipped, so the resulting
 * .app is not safe to hand to external users without first wiring up
 * Developer ID + notarytool. See README.md "macOS distribution status".
 *
 * Note: this file must remain CommonJS (module.exports). The package.json has no
 * "type":"module", so electron-builder loads .js configs as CJS.
 */

const isReleaseBuild = process.env.HUSH_DESKTOP_RELEASE_BUILD === '1';
const appId = isReleaseBuild ? 'live.gethush.desktop' : 'live.gethush.desktop.local';
const productName = isReleaseBuild ? 'Hush' : 'Hush Local';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId,
  productName,
  copyright: 'Copyright 2026 Hush',
  directories: {
    buildResources: 'build',
    output: 'dist',
  },
  files: [
    'out/**/*',
    'package.json',
    '!renderer/**',
    '!src/**',
    '!__tests__/**',
    '!scripts/**',
    '!*.config.*',
    '!*.vite.*',
    '!tsconfig.json',
    '!vitest.config.ts',
    '!README.md',
    '!LICENSE',
  ],
  extraResources: [
    {
      from: 'renderer',
      to: 'renderer',
      filter: ['**/*'],
    },
    {
      // Windows/Linux tray fallback resolved at runtime from
      // `process.resourcesPath/build/icon.png`.
      from: 'build/icon.png',
      to: 'build/icon.png',
    },
    {
      // macOS menu-bar template image. The "Template" suffix and @2x pair let
      // macOS render the icon sharply and recolor it for light/dark menu bars.
      from: 'build/trayIconTemplate.png',
      to: 'build/trayIconTemplate.png',
    },
    {
      from: 'build/trayIconTemplate@2x.png',
      to: 'build/trayIconTemplate@2x.png',
    },
  ],
  mac: {
    category: 'public.app-category.social-networking',
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
  },
  afterPack: 'scripts/after-pack.cjs',
  afterAllArtifactBuild: 'scripts/after-all-artifact-build.cjs',
  linux: {
    // Debian's `dpkg-deb` requires a maintainer "Real Name <email>" string.
    // Sourced from the documented contact in hush-web/CONTRIBUTING.md so the
    // packaged .deb carries a real, reachable email and not a fabricated one.
    maintainer: 'Hush <security@gethush.live>',
    category: 'Network',
    // `deb` is intentionally only built on a real Linux host.
    // electron-builder ships an `fpm` for macOS that produces malformed
    // .deb files (BSD ar archive, ~96 bytes) — the truthful default is
    // therefore AppImage on macOS, and AppImage + deb + tar.gz when running from
    // a Linux host. Override at the CLI (`--linux deb`) if you have
    // `dpkg-deb` available locally and want to opt in.
    target: process.platform === 'linux' ? ['deb', 'AppImage', 'tar.gz'] : ['AppImage'],
  },
  win: {
    target: ['nsis', 'portable'],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  publish: [
    {
      provider: 'github',
      owner: 'hushhq',
      repo: 'hush-desktop',
      releaseType: 'release',
    },
  ],
};
