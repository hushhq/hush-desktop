#!/usr/bin/env node
/**
 * Stages the brand icon assets into hush-desktop/build for both
 * electron-builder and dev-mode use.
 *
 * Source of truth:
 *   - ../hush-web/public/icon-512.png when the monorepo checkout is present.
 *   - assets/hush.icon/Assets/icon.png as the repo-local fallback.
 *
 * Outputs:
 *   - build/icon.png   (always — Linux + Windows derive from this)
 *   - build/icon.icns  (macOS only, generated from build/icon.png)
 *   - build/trayIconTemplate.png     (macOS tray/menu-bar template, 16px)
 *   - build/trayIconTemplate@2x.png  (macOS tray/menu-bar template, 32px)
 *
 * `iconutil` and `sips` only ship on macOS. On other hosts the script
 * falls back to PNG-only; electron-builder can derive platform icons
 * from the PNG when cross-building.
 *
 * Re-run is idempotent. Used by the dist:* and dev npm scripts.
 */

const { cpSync, existsSync, mkdirSync, rmSync } = require('fs');
const { execFileSync } = require('child_process');
const { join } = require('path');

const desktopRoot = join(__dirname, '..');
const repoRoot = join(desktopRoot, '..');
const buildDir = join(__dirname, '..', 'build');

const localIconSrc = join(desktopRoot, 'assets', 'hush.icon');
const localPngSrc = join(localIconSrc, 'Assets', 'icon.png');
const trayTemplateSrc = join(localIconSrc, 'Assets', 'trayIconTemplate.png');
const trayTemplate2xSrc = join(localIconSrc, 'Assets', 'trayIconTemplate@2x.png');
const webPngSrc = join(repoRoot, 'hush-web', 'public', 'icon-512.png');
const pngSrc = existsSync(webPngSrc) ? webPngSrc : localPngSrc;
const pngDest = join(buildDir, 'icon.png');
const trayTemplateDest = join(buildDir, 'trayIconTemplate.png');
const trayTemplate2xDest = join(buildDir, 'trayIconTemplate@2x.png');

const icnsDest = join(buildDir, 'icon.icns');

if (!existsSync(pngSrc)) {
  console.error(`brand PNG not found at: ${pngSrc}`);
  console.error('expected hush-web/public/icon-512.png to exist.');
  process.exit(1);
}

for (const templateSrc of [trayTemplateSrc, trayTemplate2xSrc]) {
  if (!existsSync(templateSrc)) {
    console.error(`tray template icon not found at: ${templateSrc}`);
    console.error('expected committed 16px and 32px template PNGs in assets/hush.icon/Assets.');
    process.exit(1);
  }
}

if (!existsSync(buildDir)) {
  mkdirSync(buildDir, { recursive: true });
}

rmSync(icnsDest, { force: true });
cpSync(pngSrc, pngDest);
console.log(`brand PNG copied: ${pngSrc} -> ${pngDest}`);

cpSync(trayTemplateSrc, trayTemplateDest);
cpSync(trayTemplate2xSrc, trayTemplate2xDest);
console.log(`tray template PNG copied: ${trayTemplateSrc} -> ${trayTemplateDest}`);
console.log(`tray template @2x PNG copied: ${trayTemplate2xSrc} -> ${trayTemplate2xDest}`);

if (process.platform !== 'darwin') {
  // .icns generation needs Apple's iconutil/sips. Skip on non-mac
  // hosts; electron-builder can still derive platform icons from
  // icon.png when cross-building.
  process.exit(0);
}

const iconsetDir = join(buildDir, 'icon.iconset');
rmSync(iconsetDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

const iconSizes = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];

try {
  for (const [size, filename] of iconSizes) {
    execFileSync('sips', ['-z', String(size), String(size), pngDest, '--out', join(iconsetDir, filename)], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }

  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsDest], {
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'inherit'],
  });
} catch (err) {
  console.warn(`macOS .icns generation failed (${err.message}); mac will fall back to icon.png.`);
  process.exit(0);
}

if (!existsSync(icnsDest)) {
  console.warn(`iconutil ran but did not produce ${icnsDest}; skipping macOS .icns.`);
  process.exit(0);
}

console.log(`brand .icns generated: ${pngDest} -> ${icnsDest}`);
