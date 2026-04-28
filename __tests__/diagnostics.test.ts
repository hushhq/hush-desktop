import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Stub the `electron` module before importing the unit under test.
// `recordEvent` and `logBootSnapshot` reach into `app.getPath('logs')` and
// `app.getAppPath()`; we point them at a temp directory so the tests
// neither pollute the real user-data tree nor require an Electron
// runtime.
let tempLogsDir: string;
let tempAppPath: string;

vi.mock('electron', () => ({
  app: {
    getAppPath: () => tempAppPath,
    isPackaged: true,
    getPath: (name: string) => {
      if (name === 'logs') return tempLogsDir;
      if (name === 'exe') return join(tempAppPath, 'Contents/MacOS/Hush');
      if (name === 'userData') return join(tempLogsDir, 'userData');
      throw new Error(`unexpected app.getPath name: ${name}`);
    },
  },
}));

import { logBootSnapshot, recordEvent, sanitizeArgv } from '../src/main/diagnostics';

const DIAG_FILE = 'desktop-diagnostics.log';

beforeEach(() => {
  tempLogsDir = mkdtempSync(join(tmpdir(), 'hush-diag-logs-'));
  tempAppPath = mkdtempSync(join(tmpdir(), 'hush-diag-app-'));
});

afterEach(() => {
  rmSync(tempLogsDir, { recursive: true, force: true });
  rmSync(tempAppPath, { recursive: true, force: true });
});

describe('recordEvent', () => {
  it('appends one JSON line per event to the diagnostics log file', () => {
    recordEvent('test', 'first', { value: 1 });
    recordEvent('test', 'second', { value: 2 });

    const path = join(tempLogsDir, DIAG_FILE);
    expect(existsSync(path)).toBe(true);

    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]);
    expect(first.category).toBe('test');
    expect(first.event).toBe('first');
    expect(first.value).toBe(1);
    expect(typeof first.ts).toBe('string');

    const second = JSON.parse(lines[1]);
    expect(second.event).toBe('second');
    expect(second.value).toBe(2);
  });
});

describe('logBootSnapshot', () => {
  it('captures bundle path, exe path, isPackaged, platform, argv', () => {
    logBootSnapshot({ devRendererUrl: 'http://localhost:5173' });

    const lines = readFileSync(join(tempLogsDir, DIAG_FILE), 'utf8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);

    expect(entry.category).toBe('boot');
    expect(entry.event).toBe('snapshot');
    expect(entry.appPath).toBe(tempAppPath);
    expect(entry.exePath).toBe(join(tempAppPath, 'Contents/MacOS/Hush'));
    expect(entry.isPackaged).toBe(true);
    expect(entry.platform).toBe(process.platform);
    expect(Array.isArray(entry.argv)).toBe(true);
    expect(entry.devRendererUrl).toBe('http://localhost:5173');
  });

  it('records null devRendererUrl without crashing', () => {
    logBootSnapshot({ devRendererUrl: null });

    const entry = JSON.parse(
      readFileSync(join(tempLogsDir, DIAG_FILE), 'utf8').trim(),
    );
    expect(entry.devRendererUrl).toBeNull();
  });
});

describe('sanitizeArgv', () => {
  const exe = '/Applications/Hush.app/Contents/MacOS/Hush';
  const main = '/Applications/Hush.app/Contents/Resources/app.asar/out/main/index.js';

  it('keeps the executable and main script paths verbatim', () => {
    const out = sanitizeArgv([exe, main]);
    expect(out).toEqual([exe, main]);
  });

  it('keeps allow-listed switch values (e.g. --remote-debugging-port)', () => {
    const out = sanitizeArgv([exe, main, '--remote-debugging-port=9233']);
    expect(out).toEqual([exe, main, '--remote-debugging-port=9233']);
  });

  it('keeps allow-listed bare switches', () => {
    const out = sanitizeArgv([exe, main, '--enable-logging']);
    expect(out).toEqual([exe, main, '--enable-logging']);
  });

  it('redacts values for unknown --key=value switches but keeps the key name', () => {
    const out = sanitizeArgv([
      exe,
      main,
      '--something-private=secret-token-123',
      '--auth=Bearer eyJ...',
    ]);
    expect(out).toEqual([
      exe,
      main,
      '--something-private=<redacted>',
      '--auth=<redacted>',
    ]);
  });

  it('keeps the bare name of unknown switches with no value', () => {
    const out = sanitizeArgv([exe, main, '--unknown-flag']);
    expect(out).toEqual([exe, main, '--unknown-flag']);
  });

  it('redacts positional args that are not switches', () => {
    const out = sanitizeArgv([
      exe,
      main,
      'local-positional-path',
      'arbitrary-token',
    ]);
    expect(out).toEqual([
      exe,
      main,
      '<redacted-positional>',
      '<redacted-positional>',
    ]);
  });
});
