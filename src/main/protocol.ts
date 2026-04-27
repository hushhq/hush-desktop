import { protocol, net, app } from 'electron';
import { join, extname } from 'path';
import { resolveRendererPath } from './renderer-path';

const WASM_MIME = 'application/wasm';

const SECURITY_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * Must be called before app.whenReady() so Electron treats 'app' as a
 * privileged, secure scheme (enabling fetch, service workers, and CORS).
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        allowServiceWorkers: true,
        corsEnabled: true,
      },
    },
  ]);
}

/**
 * Registers the 'app://' file handler. Must be called after app is ready.
 * Serves bundled renderer assets with headers required for cross-origin isolation
 * (COOP + COEP), which WASM and SharedArrayBuffer depend on.
 */
export function registerAppProtocol(): void {
  // Packaged: extraResources land one level above app.getAppPath() (Contents/Resources/).
  // Unpackaged (local dev build): renderer/ is inside the project root.
  const rendererRoot = app.isPackaged
    ? join(app.getAppPath(), '..', 'renderer')
    : join(app.getAppPath(), 'renderer');

  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const resolvedPath = resolveRendererPath(rendererRoot, url.pathname);

    if (!resolvedPath) {
      return new Response('Forbidden', { status: 403 });
    }

    let response: Response;
    try {
      response = await net.fetch(`file://${resolvedPath}`);
    } catch {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }

    if (extname(resolvedPath) === '.wasm') {
      headers.set('Content-Type', WASM_MIME);
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  });
}
