#!/usr/bin/env node
/**
 * Release-readiness preflight for `dist:mac`.
 *
 * Inspects the local macOS signing identities and notarytool environment
 * and prints a clear, human-readable banner about what the upcoming build
 * will and will not be ready for. By default this is advisory — exits 0
 * even on shortfall — so MVP-internal builds with an Apple Development
 * cert and no notarization can still proceed. Set
 *
 *     HUSH_DESKTOP_STRICT_RELEASE=1
 *
 * to turn the shortfall into a hard exit (e.g. for CI).
 *
 * Uses only built-in macOS tooling (`security find-identity`) via
 * execFileSync (no shell, no user input — fixed args only).
 */

const { execFileSync } = require('child_process');

if (process.platform !== 'darwin') {
  // Preflight is macOS-specific. Linux / Windows flows have their own
  // signing stories that this script does not yet cover.
  process.exit(0);
}

let identities = '';
try {
  identities = execFileSync(
    'security',
    ['find-identity', '-v', '-p', 'codesigning'],
    { encoding: 'utf8' },
  );
} catch (err) {
  console.warn(`[release-preflight] could not enumerate codesigning identities: ${err.message}`);
  process.exit(0);
}

const hasDeveloperID = /Developer ID Application/.test(identities);
const hasAppleDev    = /Apple Development/.test(identities);
const hasNotarize    = Boolean(process.env.APPLE_ID || process.env.APPLE_API_KEY_ID);

if (hasDeveloperID && hasNotarize) {
  console.log('[release-preflight] OK — Developer ID Application + notarytool credentials present.');
  process.exit(0);
}

const lines = [
  '',
  '──────────────────────────────────────────────────────────',
  '  HUSH DESKTOP RELEASE PREFLIGHT — please read',
  '──────────────────────────────────────────────────────────',
];

if (!hasDeveloperID) {
  lines.push('  • No Developer ID Application certificate in the local keychain.');
  lines.push(
    hasAppleDev
      ? '    The build will sign with an Apple Development cert (dev-team only).'
      : '    The build will be unsigned.',
  );
}
if (!hasNotarize) {
  lines.push('  • No notarytool credentials in env (APPLE_ID / APPLE_API_KEY_ID).');
  lines.push('    The build will NOT be notarized.');
}

lines.push('  Net effect: this build is fine for MVP-internal use but will trigger');
lines.push('  Gatekeeper warnings on a fresh user Mac. See README.md "macOS');
lines.push('  distribution status" before handing it to external users.');
lines.push('──────────────────────────────────────────────────────────');
lines.push('');

console.warn(lines.join('\n'));

if (process.env.HUSH_DESKTOP_STRICT_RELEASE === '1') {
  console.error('[release-preflight] HUSH_DESKTOP_STRICT_RELEASE=1 → failing on shortfall.');
  process.exit(2);
}

process.exit(0);
