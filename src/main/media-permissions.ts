/**
 * Pure helpers for the desktop media permission/capture pipeline.
 *
 * Kept free of Electron imports so they can be unit-tested without an
 * Electron runtime. The wiring layer in `media-handlers.ts` is what
 * actually attaches these helpers to a `session` object.
 */

const PROD_RENDERER_ORIGIN = 'app://localhost';
const DEFAULT_DEV_RENDERER_URL = 'http://localhost:5173';
const TRUSTED_RENDERER_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'clipboard-sanitized-write',
  'fullscreen',
  'notifications',
]);

/**
 * Subset of the Electron `DesktopCapturerSource` shape that we actually
 * care about for source selection. Re-declared locally so this module
 * has no compile-time dependency on `electron`.
 */
export interface DesktopMediaSource {
  id: string;
  name: string;
  display_id?: string;
}

/**
 * Returns a canonical origin string ("scheme://host[:port]") for the
 * supplied URL, or `null` when the input cannot be parsed.
 *
 * We do not use the WHATWG `url.origin` accessor because Node's URL
 * implementation reports `'null'` for non-special schemes such as
 * `app://`, while Chromium (where `setSchemesAsPrivileged({ standard: true })`
 * is honoured) reports `app://localhost`. Building the origin from
 * `protocol` + `host` agrees with Chromium for our trusted schemes
 * and keeps tests runnable under plain Node.
 */
function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    if (!url.host && url.protocol !== 'file:') return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Resolves the dev-renderer origin from a (possibly absent / malformed)
 * `HUSH_WEB_URL` value. Falls back to the Vite default. Always returns
 * a normalised origin string ("scheme://host[:port]").
 */
export function resolveDevRendererOrigin(envUrl: string | undefined): string {
  const candidate = (envUrl && envUrl.trim()) || DEFAULT_DEV_RENDERER_URL;
  return originOf(candidate) ?? originOf(DEFAULT_DEV_RENDERER_URL)!;
}

/**
 * Returns true when the supplied URL belongs to a renderer origin we
 * trust to issue media (microphone / camera / display) requests.
 *
 * Trust is intentionally narrow:
 *   - the packaged renderer is always served from `app://localhost`
 *   - the dev renderer is the configured `HUSH_WEB_URL` (or the Vite
 *     default when unset)
 * Anything else — embedded `<iframe>` content, third-party redirects,
 * `chrome://` surfaces — is rejected.
 *
 * The `requestingUrl` argument can be a full URL, an origin, an empty
 * string, or `undefined` (Electron passes `''` for top-level requests
 * before navigation completes). Any non-parseable value is treated as
 * untrusted.
 */
export function isTrustedMediaOrigin(
  requestingUrl: string | undefined,
  devOrigin: string,
): boolean {
  if (!requestingUrl) return false;
  const origin = originOf(requestingUrl);
  if (!origin) return false;
  return origin === PROD_RENDERER_ORIGIN || origin === devOrigin;
}

export interface MediaRequestOriginParts {
  requestingOrigin?: string;
  requestingUrl?: string;
  securityOrigin?: string;
  frameUrl?: string;
}

/**
 * Electron exposes slightly different origin fields for permission
 * request, permission check, and display-media request paths. Trust
 * the request if any canonical origin field matches our renderer
 * allow-list. This keeps the policy strict while avoiding false
 * denies when one Electron callback leaves `requestingUrl` empty but
 * does provide `securityOrigin`.
 */
export function isTrustedMediaRequest(
  parts: MediaRequestOriginParts,
  devOrigin: string,
): boolean {
  return [
    parts.securityOrigin,
    parts.requestingOrigin,
    parts.requestingUrl,
    parts.frameUrl,
  ].some((value) => isTrustedMediaOrigin(value, devOrigin));
}

/**
 * Electron permission handlers replace Chromium/Electron's default
 * behaviour. Returning `false` for every permission we do not
 * explicitly know about is intentional, but the renderer still needs a
 * small set of browser permissions that are normal web-app affordances:
 * sanitized clipboard writes, fullscreen, notifications, and media.
 */
export function isTrustedRendererPermission(permission: string): boolean {
  return TRUSTED_RENDERER_PERMISSIONS.has(permission);
}

/**
 * Picks a single desktop-capturer source for the MVP screen-share
 * flow. Order of preference:
 *   1. The first source whose `id` starts with `screen:` (a whole
 *      monitor — the most common user intent for "share my screen").
 *   2. The first available source of any kind, so a single-window
 *      desktop still produces a valid stream.
 *   3. `null` when no sources exist (caller must surface a friendly
 *      error to the renderer).
 *
 * MVP tradeoff: we do not show an in-app picker. A picker UI is the
 * right long-term answer, but it is also a real chunk of UI work and
 * gates desktop shipping. Auto-selecting the primary screen matches
 * what most users mean when they click "share screen", and the choice
 * is fully reversible — they end the share and start a new one. When
 * we add a picker, this helper becomes the fallback for the
 * "skip picker" path, not the only path.
 */
export function chooseDisplayMediaSource(
  sources: ReadonlyArray<DesktopMediaSource> | undefined,
): DesktopMediaSource | null {
  if (!sources || sources.length === 0) return null;
  const screen = sources.find((source) => source.id.startsWith('screen:'));
  if (screen) return screen;
  return sources[0] ?? null;
}

export const _internals = {
  PROD_RENDERER_ORIGIN,
  DEFAULT_DEV_RENDERER_URL,
  TRUSTED_RENDERER_PERMISSIONS,
};
