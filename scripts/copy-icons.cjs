#!/usr/bin/env node
/**
 * Copies the canonical Hush brand icon from hush-web/public into
 * hush-desktop/build so electron-builder picks it up for every platform
 * target (mac .icns / linux .png / win .ico are all auto-derived from a
 * single icon.png that is >= 512×512).
 *
 * Single source of truth: hush-web/public/icon-512.png. Re-run is
 * idempotent. The script is invoked from the dist:* package scripts
 * so a packaged build always carries the current brand asset.
 */

const { cpSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const src = join(__dirname, '..', '..', 'hush-web', 'public', 'icon-512.png');
const buildDir = join(__dirname, '..', 'build');
const dest = join(buildDir, 'icon.png');

if (!existsSync(src)) {
  console.error(`brand icon not found at: ${src}`);
  console.error('expected hush-web/public/icon-512.png to exist.');
  process.exit(1);
}

if (!existsSync(buildDir)) {
  mkdirSync(buildDir, { recursive: true });
}

cpSync(src, dest);
console.log(`brand icon copied: ${src} -> ${dest}`);
