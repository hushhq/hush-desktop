#!/usr/bin/env node
/**
 * Verifies the macOS release artifacts that users actually download.
 *
 * electron-builder can skip signing when the imported certificate is not a
 * Developer ID Application identity. That still produces DMG/ZIP files, but
 * Gatekeeper reports the app as damaged. This script mounts/extracts the built
 * artifacts and asks macOS trust tools to validate the contained app before CI
 * is allowed to publish a release.
 */

const { execFileSync } = require('child_process');
const { existsSync, mkdtempSync, readdirSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

function execFile(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function findBuiltArtifacts(distDir, extension) {
  if (!existsSync(distDir)) return [];
  return readdirSync(distDir)
    .filter((name) => name.endsWith(extension))
    .map((name) => join(distDir, name));
}

function findMountedVolume(output) {
  const line = output
    .split('\n')
    .find((entry) => entry.includes('/Volumes/'));
  if (!line) {
    throw new Error(`hdiutil did not report a mounted volume:\n${output}`);
  }
  return line.slice(line.indexOf('/Volumes/')).trim();
}

function findAppBundle(directory) {
  const appName = readdirSync(directory).find((name) => name.endsWith('.app'));
  if (!appName) {
    throw new Error(`No .app bundle found in ${directory}`);
  }
  return join(directory, appName);
}

function verifyApp(appPath) {
  execFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=4', appPath]);
  execFile('/usr/sbin/spctl', ['-a', '-vvv', '-t', 'open', appPath]);
  console.log(`[verify-mac-release] trusted app: ${appPath}`);
}

function verifyDmg(dmgPath) {
  execFile('/usr/bin/xcrun', ['stapler', 'validate', dmgPath]);
  const output = execFile('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', dmgPath]);
  const mountPath = findMountedVolume(output);
  try {
    verifyApp(findAppBundle(mountPath));
  } finally {
    execFile('/usr/bin/hdiutil', ['detach', mountPath]);
  }
}

function verifyZip(zipPath) {
  const extractDir = mkdtempSync(join(tmpdir(), 'hush-mac-zip-'));
  try {
    execFile('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir]);
    verifyApp(findAppBundle(extractDir));
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

function main() {
  if (process.platform !== 'darwin') return;

  const distDir = join(process.cwd(), 'dist');
  const dmgs = findBuiltArtifacts(distDir, '.dmg');
  const zips = findBuiltArtifacts(distDir, '.zip').filter((path) => path.endsWith('-mac.zip'));

  if (dmgs.length === 0 || zips.length === 0) {
    throw new Error(`Expected macOS DMG and ZIP artifacts in ${distDir}`);
  }

  for (const dmg of dmgs) verifyDmg(dmg);
  for (const zip of zips) verifyZip(zip);
}

main();
