#!/usr/bin/env node
/**
 * Stages the brand icon assets into hush-desktop/build for both
 * electron-builder and dev-mode use.
 *
 * Sources of truth:
 *   - hush-web/public/icon-512.png   (PWA/web brand artwork; used as
 *                                     the cross-platform fallback for
 *                                     Linux .png and Windows .ico)
 *   - ../hush.icon                   (Apple Icon Composer document;
 *                                     macOS-canonical source. Compiled
 *                                     to a real `.icns` via `actool`,
 *                                     which bakes the Tahoe Liquid
 *                                     Glass / gradient effects into
 *                                     the standard 16/32/128/256/512
 *                                     renditions Electron+macOS read.)
 *
 * Outputs:
 *   - build/icon.png   (always — Linux + Windows derive from this)
 *   - build/icon.icns  (macOS only, when hush.icon + actool available)
 *
 * `actool` only ships on macOS (it's part of the Xcode command line
 * tools). On other hosts the script falls back to PNG-only and
 * electron-builder will auto-derive a less polished .icns from the
 * PNG when packaging mac.
 *
 * Re-run is idempotent. Used by the dist:* and dev npm scripts.
 */

const { cpSync, mkdirSync, existsSync } = require('fs');
const { execFileSync } = require('child_process');
const { join } = require('path');

const repoRoot = join(__dirname, '..', '..');
const buildDir = join(__dirname, '..', 'build');

const pngSrc = join(repoRoot, 'hush-web', 'public', 'icon-512.png');
const pngDest = join(buildDir, 'icon.png');

const iconSrc = join(repoRoot, 'hush.icon');
const icnsDest = join(buildDir, 'icon.icns');

if (!existsSync(pngSrc)) {
  console.error(`brand PNG not found at: ${pngSrc}`);
  console.error('expected hush-web/public/icon-512.png to exist.');
  process.exit(1);
}

if (!existsSync(buildDir)) {
  mkdirSync(buildDir, { recursive: true });
}

cpSync(pngSrc, pngDest);
console.log(`brand PNG copied: ${pngSrc} -> ${pngDest}`);

if (process.platform !== 'darwin') {
  // .icns generation needs Apple's actool. Skip on non-mac hosts —
  // electron-builder will still pack mac builds with a derived
  // icns from icon.png if cross-building from Linux/Windows, but
  // the macOS-canonical Liquid Glass render only happens on macOS.
  process.exit(0);
}

if (!existsSync(iconSrc)) {
  console.warn(`hush.icon not found at: ${iconSrc}`);
  console.warn('skipping macOS .icns compile; mac will fall back to icon.png.');
  process.exit(0);
}

// Compile the Icon Composer document to a baked .icns. This is the
// same path Xcode uses internally.
const stagingDir = join(buildDir, '.icon-stage');
const partialPlist = join(stagingDir, 'icon-info.plist');
if (!existsSync(stagingDir)) {
  mkdirSync(stagingDir, { recursive: true });
}

try {
  execFileSync(
    'actool',
    [
      iconSrc,
      '--compile', stagingDir,
      '--platform', 'macosx',
      '--minimum-deployment-target', '10.12',
      '--app-icon', 'hush',
      '--output-partial-info-plist', partialPlist,
      '--output-format', 'human-readable-text',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
} catch (err) {
  console.warn(`actool compile failed (${err.message}); skipping macOS .icns.`);
  console.warn('mac will fall back to icon.png. Run with macOS Xcode CLT installed for the canonical .icns.');
  process.exit(0);
}

const generatedIcns = join(stagingDir, 'hush.icns');
if (!existsSync(generatedIcns)) {
  console.warn(`actool ran but did not produce ${generatedIcns}; skipping macOS .icns.`);
  process.exit(0);
}

cpSync(generatedIcns, icnsDest);
console.log(`brand .icns compiled: ${iconSrc} -> ${icnsDest}`);
