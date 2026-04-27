/**
 * electron-builder configuration.
 *
 * Icons: place icon.icns (mac), icon.ico (win), and icon.png (linux) in build/
 * before running dist targets. Unsigned builds are acceptable for MVP.
 *
 * Renderer assets: run `npm run copy-renderer` (copies ../hush-web/dist → renderer/)
 * before packaging. electron-builder copies renderer/ into app resources via
 * extraResources so it lives outside the asar (required for net.fetch file:// serving).
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
