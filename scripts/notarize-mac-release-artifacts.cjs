#!/usr/bin/env node
/**
 * Notarizes the built macOS release artifacts with explicit, visible polling.
 *
 * electron-builder can notarize inline, but it hides `notarytool --wait` inside
 * the packaging step. First-time Developer ID notarization can sit in Apple's
 * queue for a long time, so CI needs the submission id and periodic status logs.
 */

const { execFileSync } = require('child_process');
const { existsSync, readdirSync } = require('fs');
const { basename, join } = require('path');

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

function findBuiltArtifacts(distDir, extension) {
  if (!existsSync(distDir)) return [];
  return readdirSync(distDir)
    .filter((name) => name.endsWith(extension))
    .map((name) => join(distDir, name));
}

function findMacArtifacts() {
  const distDir = join(process.cwd(), 'dist');
  const dmgs = findBuiltArtifacts(distDir, '.dmg');
  const zips = findBuiltArtifacts(distDir, '.zip').filter((path) => path.endsWith('-mac.zip'));

  if (dmgs.length === 0 || zips.length === 0) {
    throw new Error(`Expected macOS DMG and ZIP artifacts in ${distDir}`);
  }

  return [...dmgs, ...zips];
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

function printNotaryLog(submissionId, authArgs) {
  try {
    const log = execFile('/usr/bin/xcrun', ['notarytool', 'log', submissionId, ...authArgs]);
    console.log(`[notarize-mac] Apple notary log for ${submissionId}:\n${log}`);
  } catch (error) {
    console.warn(`[notarize-mac] failed to fetch Apple notary log for ${submissionId}`);
    if (error.stderr) console.warn(String(error.stderr));
  }
}

function pollSubmission(submissionId, artifactPath, authArgs, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const info = execNotaryJson(['info', submissionId, ...authArgs]);
    const status = info.status || 'Unknown';
    const elapsedMinutes = ((Date.now() - startedAt) / 60_000).toFixed(1);

    console.log(
      `[notarize-mac] ${basename(artifactPath)} submission=${submissionId} status="${status}" elapsed=${elapsedMinutes}m`,
    );

    if (status === 'Accepted') return;
    if (status === 'Invalid' || status === 'Rejected') {
      printNotaryLog(submissionId, authArgs);
      throw new Error(`Apple notarization ${status.toLowerCase()} ${basename(artifactPath)}`);
    }

    sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for Apple notarization of ${basename(artifactPath)} after ${timeoutMs / 60_000} minutes`,
  );
}

function submitArtifact(artifactPath, authArgs, timeoutMs) {
  console.log(`[notarize-mac] submitting ${artifactPath}`);
  const result = execNotaryJson(['submit', artifactPath, ...authArgs]);
  const submissionId = result.id;

  if (!submissionId) {
    throw new Error(`Apple notarization did not return a submission id for ${artifactPath}`);
  }

  console.log(`[notarize-mac] submitted ${basename(artifactPath)} submission=${submissionId}`);
  pollSubmission(submissionId, artifactPath, authArgs, timeoutMs);
}

function stapleDmg(artifactPath) {
  if (!artifactPath.endsWith('.dmg')) return;
  console.log(`[notarize-mac] stapling ${artifactPath}`);
  execFile('/usr/bin/xcrun', ['stapler', 'staple', artifactPath]);
  execFile('/usr/bin/xcrun', ['stapler', 'validate', artifactPath]);
}

function main() {
  if (process.platform !== 'darwin') return;

  const authArgs = createAuthArgs();
  const timeoutMs = getTimeoutMs();
  const artifacts = findMacArtifacts();

  for (const artifact of artifacts) {
    submitArtifact(artifact, authArgs, timeoutMs);
    stapleDmg(artifact);
  }
}

main();
