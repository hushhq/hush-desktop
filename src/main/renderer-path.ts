import { resolve, join, sep, extname } from 'path';

/**
 * Resolves a renderer-relative URL path to an absolute filesystem path,
 * guarding against path traversal. Returns null if the resolved path
 * escapes the renderer root.
 *
 * Traversal check runs on the raw decoded path BEFORE the SPA fallback so that
 * malformed paths (e.g. /../../../etc/passwd, which has no extension) cannot
 * masquerade as SPA routes to bypass the guard.
 */
export function resolveRendererPath(rendererRoot: string, urlPath: string): string | null {
  const withoutQuery = urlPath.split('?')[0];
  const decoded = decodeURIComponent(withoutQuery);

  const rootWithSep = rendererRoot.endsWith(sep) ? rendererRoot : rendererRoot + sep;

  // Step 1: Reject any path that resolves outside the renderer root.
  const rawResolved = resolve(join(rendererRoot, decoded));
  if (!rawResolved.startsWith(rootWithSep) && rawResolved !== rendererRoot) {
    return null;
  }

  // Step 2: SPA fallback — any path without a file extension serves index.html.
  const fsPath = extname(decoded) ? decoded : '/index.html';
  return resolve(join(rendererRoot, fsPath));
}
