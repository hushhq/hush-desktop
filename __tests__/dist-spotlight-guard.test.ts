import { createRequire } from 'module';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.js');
const { markDistPrivate } = require('../scripts/mark-dist-private.cjs');

describe('local dist Spotlight guard', () => {
  it('marks the dist directory as private to Spotlight', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'hush-dist-'));

    const distDir = markDistPrivate(rootDir);

    expect(distDir).toBe(join(rootDir, 'dist'));
    expect(readFileSync(join(distDir, '.metadata_never_index'), 'utf8')).toContain(
      'not indexed by Spotlight',
    );
  });

  it('runs after electron-builder recreates release artifacts', () => {
    expect(config.afterAllArtifactBuild).toBe('scripts/after-all-artifact-build.cjs');
  });
});
