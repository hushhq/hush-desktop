#!/usr/bin/env node
/**
 * electron-builder afterPack hook.
 *
 * CI release builds intentionally run without Apple Developer ID secrets.
 * When macOS code signing is skipped completely, the app bundle can be
 * left with only linker-level ad-hoc signatures on Mach-O files and no
 * sealed resource envelope at the bundle level. Gatekeeper reports that
 * shape as a damaged app.
 *
 * This hook adds a bundle-level ad-hoc signature only for explicitly
 * unsigned macOS builds. It is not a distribution signature and does not
 * replace Developer ID signing or notarization.
 */

const { execFileSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

function canApplyAdHocFallback(env) {
  return !env.CSC_LINK && !env.CSC_NAME && env.HUSH_DESKTOP_SKIP_ADHOC_SIGN !== '1';
}

function verifyBundle(appPath) {
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function adHocSignBundle(appPath, entitlementsPath) {
  const args = ['--force', '--deep', '--sign', '-'];
  if (existsSync(entitlementsPath)) {
    args.push('--entitlements', entitlementsPath);
  }
  args.push(appPath);

  execFileSync('/usr/bin/codesign', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  try {
    verifyBundle(appPath);
    return;
  } catch (err) {
    if (!canApplyAdHocFallback(process.env)) {
      throw new Error(`macOS app bundle code signature is invalid: ${err.message}`);
    }
  }

  const entitlementsPath = join(context.packager.projectDir, 'build', 'entitlements.mac.plist');
  adHocSignBundle(appPath, entitlementsPath);
  verifyBundle(appPath);
  console.log(`[after-pack] applied ad-hoc macOS bundle signature: ${appPath}`);
};

module.exports._private = {
  canApplyAdHocFallback,
};
