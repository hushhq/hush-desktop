import { app } from 'electron';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Desktop diagnostics surface.
 *
 * Why this module exists:
 *   The packaged Hush.app behaves differently when launched via
 *   `/Hush.app/Contents/MacOS/Hush` (stdout attached to the terminal) vs
 *   `open Hush.app` (LaunchServices detaches stdout). Permission handler
 *   decisions and boot context that are visible in the first form are
 *   completely invisible in the second, which is the symptom that
 *   produced the "permissions/copy buttons broken when opened as .app"
 *   bug report.
 *
 *   This module records boot context and permission decisions to a
 *   stable on-disk log so they can be inspected post-mortem after any
 *   launch path. It also mirrors every event to `console.info` for the
 *   direct-binary / remote-debugging-port flow.
 *
 * Privacy posture:
 *   - Logs only: bundle/exe paths, isPackaged, platform, electron/chrome
 *     versions, sanitized argv (see `sanitizeArgv`), configured dev
 *     renderer URL (the renderer origin, not arbitrary URLs), and
 *     permission decisions (origin, permission name, granted/denied).
 *   - Never logs: vault session keys, message contents, auth tokens, PINs,
 *     user identifiers from the renderer, window titles, desktop-capturer
 *     source names (which can include document titles or other app names),
 *     or any other IPC payload contents outside the explicit recordEvent
 *     calls.
 *
 * Log location:
 *   `app.getPath('logs')` on macOS resolves to
 *   `~/Library/Logs/<productName>/desktop-diagnostics.log`. Inspectable
 *   via Console.app or `tail -f`.
 */

const DIAG_FILENAME = 'desktop-diagnostics.log';

/**
 * Switches whose values are known not to leak user data and are useful
 * for diagnosing launch differences (e.g. CDP debugging, GPU toggles,
 * Electron/Chromium feature flags). Anything outside this set has its
 * value redacted, and anything that is not a `--switch` at all is
 * treated as a positional and redacted entirely.
 */
const SAFE_ARGV_SWITCH_NAMES = new Set([
  '--remote-debugging-port',
  '--remote-allow-origins',
  '--enable-logging',
  '--inspect',
  '--inspect-brk',
  '--no-sandbox',
  '--disable-gpu',
  '--enable-features',
  '--disable-features',
  '--disable-software-rasterizer',
  '--enable-blink-features',
]);

/**
 * Indices of `process.argv` that are expected to be the Electron/Node
 * binary path and the main-process script path respectively. Both are
 * controlled by us (not user input), so logging them verbatim is safe
 * and useful for diagnosing the bundle that LaunchServices selected.
 */
const ARGV_BUNDLE_FIXED_INDICES = 2;

/**
 * Returns a copy of `argv` with values stripped from any `--switch=value`
 * the allow-list does not vouch for, and with positional arguments past
 * the bundle prefix replaced with `<redacted-positional>`. Switch names
 * are always preserved so we can still see *that* a flag was passed.
 */
export function sanitizeArgv(argv: ReadonlyArray<string>): string[] {
  return argv.map((arg, idx) => {
    if (idx < ARGV_BUNDLE_FIXED_INDICES) return arg;
    if (!arg.startsWith('--')) return '<redacted-positional>';
    const eqIndex = arg.indexOf('=');
    const name = eqIndex === -1 ? arg : arg.slice(0, eqIndex);
    if (SAFE_ARGV_SWITCH_NAMES.has(name)) return arg;
    if (eqIndex === -1) return name;
    return `${name}=<redacted>`;
  });
}

function diagnosticsFilePath(): string {
  const dir = app.getPath('logs');
  // `recursive: true` is idempotent — cheap to call per event, and
  // avoids any stale cache during long-running sessions where the OS
  // log directory might be rotated or relocated under the app.
  mkdirSync(dir, { recursive: true });
  return join(dir, DIAG_FILENAME);
}

export type DiagnosticPayload = Record<string, unknown>;

/**
 * Record one diagnostic event. Mirrored to `console.info` (visible via
 * direct-binary launch + remote-debugging-port DevTools) and persisted
 * as a JSON line to the log file (visible after any launch path).
 *
 * Failures to write the log file are themselves logged to console but
 * never thrown — diagnostics must never be load-bearing.
 */
export function recordEvent(
  category: string,
  event: string,
  data: DiagnosticPayload = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    category,
    event,
    ...data,
  });

  console.info(`[diag] ${category} ${event}`, data);

  try {
    appendFileSync(diagnosticsFilePath(), `${line}\n`, 'utf8');
  } catch (err) {
    console.warn('[diag] failed to persist diagnostic event', err);
  }
}

/**
 * Boot snapshot — capture once during app.whenReady so post-mortem
 * inspection of `desktop-diagnostics.log` always shows the launch
 * context (bundle path, packaged-or-not, argv, platform, versions).
 */
export function logBootSnapshot(extra: DiagnosticPayload = {}): void {
  recordEvent('boot', 'snapshot', {
    appPath: app.getAppPath(),
    exePath: safeAppPath('exe'),
    userData: safeAppPath('userData'),
    logsDir: safeAppPath('logs'),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron ?? null,
    chromeVersion: process.versions.chrome ?? null,
    nodeVersion: process.versions.node ?? null,
    argv: sanitizeArgv(process.argv),
    ...extra,
  });
}

function safeAppPath(name: 'exe' | 'userData' | 'logs'): string | null {
  try {
    return app.getPath(name);
  } catch {
    return null;
  }
}
