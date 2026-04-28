/**
 * electron-builder configuration.
 *
 * Icons: the brand icon is mirrored from hush-web/public/icon-512.png into
 * build/icon.png by `npm run copy-icons`, which the dist:* scripts invoke
 * automatically. electron-builder auto-derives icon.icns / icon.ico from
 * the single 512×512 source.
 *
 * Renderer assets: run `npm run copy-renderer` (copies ../hush-web/dist → renderer/)
 * before packaging. electron-builder copies renderer/ into app resources via
 * extraResources so it lives outside the asar (required for net.fetch file:// serving).
 *
 * Code signing posture: this config does NOT pin a specific identity or
 * configure notarize. electron-builder picks the first available macOS
 * signing identity in the local keychain (typically an Apple Development
 * cert on a developer machine). That is sufficient for local MVP use but
 * is NOT a Developer ID Application signature, and notarization is
 * skipped, so the resulting .app is not safe to hand to external users
 * without first wiring up Developer ID + notarytool. See README.md
 * "macOS distribution status" for the full picture before shipping.
 *
 * Note: this file must remain CommonJS (module.exports). The package.json has no
 * "type":"module", so electron-builder loads .js configs as CJS.
 */

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'live.gethush.desktop',
  productName: 'Hush',
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
  ],
  mac: {
    category: 'public.app-category.social-networking',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
  },
  linux: {
    target: ['deb', 'AppImage'],
  },
  win: {
    target: ['nsis'],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
};
