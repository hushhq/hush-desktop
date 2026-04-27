#!/usr/bin/env node
/**
 * Copies the hush-web production build into renderer/ for electron-builder packaging.
 * Run `cd ../hush-web && npm run build` before this script.
 */

const { cpSync, rmSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const src = join(__dirname, '..', '..', 'hush-web', 'dist');
const dest = join(__dirname, '..', 'renderer');

if (!existsSync(src)) {
  console.error(`hush-web dist not found at: ${src}`);
  console.error('Run `npm run build` in hush-web first.');
  process.exit(1);
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

console.log(`Renderer assets copied: ${src} -> ${dest}`);
