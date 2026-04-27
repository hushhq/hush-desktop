import { describe, it, expect } from 'vitest';
import { buildWindowOptions } from '../src/main/window-config';

describe('buildWindowOptions', () => {
  const opts = buildWindowOptions('/fake/preload.js');

  it('sets nodeIntegration to false', () => {
    expect(opts.webPreferences?.nodeIntegration).toBe(false);
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

  it('enforces minimum window dimensions', () => {
    expect(opts.minWidth).toBeGreaterThanOrEqual(800);
    expect(opts.minHeight).toBeGreaterThanOrEqual(600);
  });

  it('hides window until ready-to-show fires', () => {
    expect(opts.show).toBe(false);
  });
});
