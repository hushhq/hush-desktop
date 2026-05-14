import { createRequire } from 'module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.js');
const { prepareDistDirectory } = require('../scripts/mark-dist-private.cjs');
const afterAllArtifactBuild = require('../scripts/after-all-artifact-build.cjs');

describe('local dist Spotlight guard', () => {
  it('marks dist private and removes stale unpacked mac apps', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'hush-dist-'));
    mkdirSync(join(rootDir, 'dist', 'mac'), { recursive: true });
    mkdirSync(join(rootDir, 'dist', 'mac-arm64'), { recursive: true });

    const distDir = prepareDistDirectory(rootDir);

    expect(distDir).toBe(join(rootDir, 'dist'));
    expect(readFileSync(join(distDir, '.metadata_never_index'), 'utf8')).toContain(
      'not indexed by Spotlight',
    );
    expect(existsSync(join(distDir, 'mac'))).toBe(false);
    expect(existsSync(join(distDir, 'mac-arm64'))).toBe(false);
  });

  it('runs after electron-builder recreates release artifacts', () => {
    expect(config.afterAllArtifactBuild).toBe('scripts/after-all-artifact-build.cjs');
  });

  it('AfterAllArtifactBuild_ToleratesMissingPackagerContext', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'hush-after-all-'));
    const originalCwd = process.cwd();
    process.chdir(rootDir);
    try {
      await expect(afterAllArtifactBuild.default({})).resolves.toEqual([]);
    } finally {
      process.chdir(originalCwd);
    }
    expect(existsSync(join(rootDir, 'dist', '.metadata_never_index'))).toBe(true);
  });
});
