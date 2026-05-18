#!/usr/bin/env node
/**
 * electron-builder afterSign hook for macOS release notarization.
 *
 * Notarizing the signed .app before DMG/ZIP creation gives Gatekeeper a ticket
 * on the executable bundle users launch, and avoids submitting every final
 * container artifact to Apple serially.
 */

const { execFileSync } = require('child_process');
const { mkdtempSync, rmSync } = require('fs');
const { basename, join } = require('path');
const { tmpdir } = require('os');

const DEFAULT_TIMEOUT_MINUTES = 180;
const POLL_INTERVAL_MS = 60_000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for macOS notarization`);
  }
  return value;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function execFile(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function execNotaryJson(args) {
  const output = execFile('/usr/bin/xcrun', [
    'notarytool',
    ...args,
    '--output-format',
    'json',
  ]);
  return JSON.parse(output);
}

function createAuthArgs() {
  const keyPath = requireEnv('APPLE_API_KEY');
  const keyId = requireEnv('APPLE_API_KEY_ID');
  const issuer = requireEnv('APPLE_API_ISSUER');

  return ['--key', keyPath, '--key-id', keyId, '--issuer', issuer];
}

function getTimeoutMs() {
  const minutes = Number(process.env.HUSH_NOTARY_TIMEOUT_MINUTES || DEFAULT_TIMEOUT_MINUTES);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error('HUSH_NOTARY_TIMEOUT_MINUTES must be a positive number');
  }
  return minutes * 60_000;
}

function createAppZip(appPath) {
  const tempDir = mkdtempSync(join(tmpdir(), 'hush-notary-app-'));
  const zipPath = join(tempDir, `${basename(appPath, '.app')}.zip`);

  execFile('/usr/bin/ditto', ['-c', '-k', '--keepParent', appPath, zipPath]);
  return { tempDir, zipPath };
}

function printNotaryLog(submissionId, authArgs) {
  try {
    const log = execFile('/usr/bin/xcrun', ['notarytool', 'log', submissionId, ...authArgs]);
    console.log(`[notarize-mac-app] Apple notary log for ${submissionId}:\n${log}`);
  } catch (error) {
    console.warn(`[notarize-mac-app] failed to fetch Apple notary log for ${submissionId}`);
    if (error.stderr) console.warn(String(error.stderr));
  }
}

function pollSubmission(submissionId, appPath, authArgs, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const info = execNotaryJson(['info', submissionId, ...authArgs]);
    const status = info.status || 'Unknown';
    const elapsedMinutes = ((Date.now() - startedAt) / 60_000).toFixed(1);

    console.log(
      `[notarize-mac-app] ${basename(appPath)} submission=${submissionId} status="${status}" elapsed=${elapsedMinutes}m`,
    );

    if (status === 'Accepted') return;
    if (status === 'Invalid' || status === 'Rejected') {
      printNotaryLog(submissionId, authArgs);
      throw new Error(`Apple notarization ${status.toLowerCase()} ${basename(appPath)}`);
    }

    sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for Apple notarization of ${basename(appPath)} after ${timeoutMs / 60_000} minutes`,
  );
}

function submitAppZip(zipPath, appPath, authArgs, timeoutMs) {
  console.log(`[notarize-mac-app] submitting ${zipPath}`);
  const result = execNotaryJson(['submit', zipPath, ...authArgs]);
  const submissionId = result.id;

  if (!submissionId) {
    throw new Error(`Apple notarization did not return a submission id for ${appPath}`);
  }

  console.log(`[notarize-mac-app] submitted ${basename(appPath)} submission=${submissionId}`);
  pollSubmission(submissionId, appPath, authArgs, timeoutMs);
}

function stapleApp(appPath) {
  console.log(`[notarize-mac-app] stapling ${appPath}`);
  execFile('/usr/bin/xcrun', ['stapler', 'staple', appPath]);
  execFile('/usr/bin/xcrun', ['stapler', 'validate', appPath]);
}

module.exports = async function notarizeMacApp(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.HUSH_DESKTOP_NOTARIZE_APP !== '1') return;

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const authArgs = createAuthArgs();
  const timeoutMs = getTimeoutMs();
  const { tempDir, zipPath } = createAppZip(appPath);

  try {
    submitAppZip(zipPath, appPath, authArgs, timeoutMs);
    stapleApp(appPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};
