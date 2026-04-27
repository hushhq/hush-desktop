import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { resolveRendererPath } from '../src/main/renderer-path';

const ROOT = '/app/renderer';

describe('resolveRendererPath', () => {
  it('resolves a valid HTML path', () => {
    expect(resolveRendererPath(ROOT, '/index.html')).toBe(join(ROOT, 'index.html'));
  });

  it('resolves a nested asset path', () => {
    expect(resolveRendererPath(ROOT, '/assets/main.js')).toBe(join(ROOT, 'assets/main.js'));
  });

  it('resolves a wasm asset path', () => {
    expect(resolveRendererPath(ROOT, '/assets/hush_crypto_bg.wasm')).toBe(
      join(ROOT, 'assets/hush_crypto_bg.wasm'),
    );
  });

  it('falls back to index.html for SPA routes (no extension)', () => {
    expect(resolveRendererPath(ROOT, '/channels/123')).toBe(join(ROOT, 'index.html'));
  });

  it('rejects path traversal with ..',  () => {
    expect(resolveRendererPath(ROOT, '/../../../etc/passwd')).toBeNull();
  });

  it('rejects encoded path traversal', () => {
    expect(resolveRendererPath(ROOT, '/%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toBeNull();
  });

  it('strips query string before resolving', () => {
    expect(resolveRendererPath(ROOT, '/assets/main.js?v=abc123')).toBe(
      join(ROOT, 'assets/main.js'),
    );
  });
});
