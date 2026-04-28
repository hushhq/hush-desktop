import { describe, it, expect } from 'vitest';
import {
  AUTH_MIN_WINDOW_HEIGHT,
  AUTH_MIN_WINDOW_WIDTH,
  buildWindowOptions,
} from '../src/main/window-config';

describe('buildWindowOptions', () => {
  const opts = buildWindowOptions('/fake/preload.js');

  it('sets nodeIntegration to false', () => {
    expect(opts.webPreferences?.nodeIntegration).toBe(false);
  });

  it('keeps the window resizable', () => {
    expect(opts.resizable).toBe(true);
  });

  it('uses hiddenInset traffic lights on macOS', () => {
    const macOpts = buildWindowOptions('/fake/preload.js', 'darwin');
    expect(macOpts.titleBarStyle).toBe('hiddenInset');
    expect(macOpts.titleBarOverlay).toBeUndefined();
  });

  it('uses titleBarOverlay so Win11 Snap Layouts work on Windows', () => {
    const winOpts = buildWindowOptions('/fake/preload.js', 'win32');
    expect(winOpts.titleBarStyle).toBe('hidden');
    expect(winOpts.titleBarOverlay).toEqual({
      color: '#09090b',
      symbolColor: '#EEEEF0',
      height: 40,
    });
  });

  it('keeps the native frame on Linux', () => {
    const linuxOpts = buildWindowOptions('/fake/preload.js', 'linux');
    expect(linuxOpts.titleBarStyle).toBeUndefined();
    expect(linuxOpts.titleBarOverlay).toBeUndefined();
  });

  it('sets contextIsolation to true', () => {
    expect(opts.webPreferences?.contextIsolation).toBe(true);
  });

  it('sets sandbox to true', () => {
    expect(opts.webPreferences?.sandbox).toBe(true);
  });

  it('sets webSecurity to true', () => {
    expect(opts.webPreferences?.webSecurity).toBe(true);
  });

  it('disallows insecure content', () => {
    expect(opts.webPreferences?.allowRunningInsecureContent).toBe(false);
  });

  it('sets the provided preload path', () => {
    expect(opts.webPreferences?.preload).toBe('/fake/preload.js');
  });

  it('enforces a minimum window floor that fits the auth/login card stack', () => {
    expect(opts.minWidth).toBe(AUTH_MIN_WINDOW_WIDTH);
    expect(opts.minHeight).toBe(AUTH_MIN_WINDOW_HEIGHT);
  });

  it('keeps the auth-flow minimum floor at-or-above the LinkDevice content height', () => {
    // The LinkDevice "Waiting for approval" card is the tallest auth surface.
    // Floor must be tall enough that the flex-centered .home-page wrapper
    // does not clip the card's bottom controls below the viewport.
    expect(AUTH_MIN_WINDOW_HEIGHT).toBeGreaterThanOrEqual(860);
    expect(AUTH_MIN_WINDOW_WIDTH).toBeGreaterThanOrEqual(900);
  });

  it('does not start narrower or shorter than its own minimum floor', () => {
    expect(opts.width as number).toBeGreaterThanOrEqual(opts.minWidth as number);
    expect(opts.height as number).toBeGreaterThanOrEqual(opts.minHeight as number);
  });

  it('hides window until ready-to-show fires', () => {
    expect(opts.show).toBe(false);
  });
});
