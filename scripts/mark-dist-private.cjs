#!/usr/bin/env node

/**
 * Marks the local electron-builder output directory as private to Spotlight.
 *
 * macOS indexes packaged `.app` bundles under `dist/mac*` because they carry
 * the same bundle identifier as the installed app. That makes Spotlight and
 * LaunchServices surface stale development builds next to `/Applications/Hush.app`.
 *
 * The `.metadata_never_index` marker is the platform-native, non-destructive
 * way to keep local build artifacts out of Spotlight without deleting them.
 */
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { resolve } = require('path');

function prepareDistDirectory(rootDir = process.cwd()) {
  const distDir = resolve(rootDir, 'dist');
  mkdirSync(distDir, { recursive: true });
  // Remove unpacked mac app bundles from previous runs. They are development
  // convenience output, not release artifacts, and stale copies with the
  // production bundle id are the exact shape that pollutes Spotlight.
  for (const dirname of ['mac', 'mac-arm64']) {
    rmSync(resolve(distDir, dirname), { recursive: true, force: true });
  }
  writeFileSync(
    resolve(distDir, '.metadata_never_index'),
    'Local Hush desktop build artifacts are intentionally not indexed by Spotlight.\n',
  );
  return distDir;
}

if (require.main === module) {
  const distDir = prepareDistDirectory();
  process.stdout.write(`Marked ${distDir} as private to Spotlight.\n`);
}

module.exports = {
  prepareDistDirectory,
};
