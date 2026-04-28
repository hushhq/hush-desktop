import {
  desktopCapturer,
  systemPreferences,
  type Session,
} from 'electron';
import {
  chooseDisplayMediaSource,
  isTrustedMediaRequest,
  isTrustedRendererPermission,
  resolveDevRendererOrigin,
} from './media-permissions';
import { recordEvent } from './diagnostics';

/**
 * Wires Electron's media permission + display-capture handlers onto the
 * supplied session. Must run after `app.whenReady()` because it touches
 * `session` and `systemPreferences`.
 *
 * Three pieces of wiring:
 *
 *   1. `setPermissionRequestHandler` — accepts `media` requests from
 *      trusted origins (production `app://localhost` and dev
 *      `HUSH_WEB_URL`) and rejects everything else. Without this,
 *      Chromium's default policy in Electron rejects mic/camera even
 *      after the macOS TCC prompt has been accepted, surfacing as the
 *      "permitted in System Settings but the app can't see it"
 *      symptom.
 *
 *   2. `setPermissionCheckHandler` — mirror of (1) for the synchronous
 *      `permissions.query` style checks. Same trust boundary.
 *
 *   3. `setDisplayMediaRequestHandler` — implements `getDisplayMedia`
 *      for trusted renderers by calling `desktopCapturer.getSources`
 *      and selecting a source via `chooseDisplayMediaSource`. Without
 *      this handler, `navigator.mediaDevices.getDisplayMedia(...)`
 *      throws `NotSupportedError: Not supported` (the Electron
 *      default has no fallback like Chromium's Web UI picker). The
 *      MVP picks a default source automatically; see
 *      `chooseDisplayMediaSource` for the tradeoff comment.
 *
 * On macOS the handlers also run a one-shot pre-prompt for mic/camera
 * via `systemPreferences.askForMediaAccess`, so the OS TCC dialog
 * surfaces before LiveKit's `getUserMedia` rather than during the
 * first publish. Failures are logged and not fatal: the renderer
 * fallback still works.
 */
export function registerMediaHandlers(
  session: Session,
  options: { devRendererUrl: string | undefined } = { devRendererUrl: undefined },
): void {
  const devOrigin = resolveDevRendererOrigin(options.devRendererUrl);

  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (!isTrustedRendererPermission(permission)) {
      recordEvent('permission', 'request:denied:unsupported', { permission });
      callback(false);
      return;
    }
    const requestingUrl = details?.requestingUrl ?? '';
    const securityOrigin = 'securityOrigin' in details ? details.securityOrigin : undefined;
    const trusted = isTrustedMediaRequest({ requestingUrl, securityOrigin }, devOrigin);
    if (!trusted) {
      recordEvent('permission', 'request:denied:untrusted-origin', {
        permission,
        requestingUrl,
        securityOrigin,
      });
      callback(false);
      return;
    }
    recordEvent('permission', 'request:granted', {
      permission,
      requestingUrl,
      securityOrigin,
      mediaTypes: 'mediaTypes' in details ? details.mediaTypes : undefined,
    });
    callback(true);
  });

  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    if (!isTrustedRendererPermission(permission)) {
      recordEvent('permission', 'check:denied:unsupported', { permission, requestingOrigin });
      return false;
    }
    const granted = isTrustedMediaRequest({
      requestingOrigin,
      requestingUrl: details?.requestingUrl,
      securityOrigin: details?.securityOrigin,
    }, devOrigin);
    recordEvent('permission', granted ? 'check:granted' : 'check:denied:untrusted-origin', {
      permission,
      requestingOrigin,
      requestingUrl: details?.requestingUrl,
      securityOrigin: details?.securityOrigin,
    });
    return granted;
  });

  const useSystemPicker = shouldUseSystemDisplayMediaPicker();
  recordEvent('media', 'display-media:wired', { useSystemPicker });
  session.setDisplayMediaRequestHandler(async (request, callback) => {
    const frameUrl = request?.frame?.url ?? '';
    const securityOrigin = request?.securityOrigin ?? '';
    if (!isTrustedMediaRequest({ frameUrl, securityOrigin }, devOrigin)) {
      recordEvent('permission', 'display-media:denied:untrusted-origin', {
        frameUrl,
        securityOrigin,
      });
      // Empty selection short-circuits getDisplayMedia with
      // NotAllowedError on the renderer, which is what we want.
      callback({});
      return;
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        fetchWindowIcons: false,
      });
      const chosen = chooseDisplayMediaSource(sources);
      if (!chosen) {
        recordEvent('media', 'display-media:no-sources', { frameUrl });
        callback({});
        return;
      }
      // Source `name` is intentionally omitted: window names can carry
      // document titles or other private app names. The opaque `id`
      // (e.g. `screen:0:0`, `window:1234:0`) is enough to diagnose
      // which kind of source was selected without leaking content.
      recordEvent('permission', 'display-media:granted', {
        frameUrl,
        sourceId: chosen.id,
      });
      // System audio capture is platform-gated (macOS does not allow
      // loopback audio capture without a third-party kext; Windows
      // supports it on a per-source basis; Linux PipeWire support
      // varies). Returning audio: 'loopback' on macOS would silently
      // drop the audio track and confuse callers. The safer default
      // is video-only; the renderer's getUserMedia path picks up the
      // user's microphone separately and LiveKit publishes both.
      callback({ video: chosen });
    } catch (err) {
      recordEvent('media', 'display-media:capturer-error', {
        message: err instanceof Error ? err.message : String(err),
      });
      callback({});
    }
  }, { useSystemPicker });

  if (process.platform === 'darwin') {
    primeMacMediaAccess('microphone');
    primeMacMediaAccess('camera');
  }
}

function shouldUseSystemDisplayMediaPicker(): boolean {
  if (process.platform !== 'darwin') return false;
  const pickerProbe = (desktopCapturer as unknown as {
    isDisplayMediaSystemPickerAvailable?: () => boolean;
  }).isDisplayMediaSystemPickerAvailable;
  return typeof pickerProbe === 'function' && pickerProbe.call(desktopCapturer);
}

/**
 * Triggers the macOS TCC prompt for the named media type up-front so
 * the OS dialog surfaces predictably during app launch instead of
 * mid-call. Logs the resolved authorisation status. Never throws:
 * `askForMediaAccess` returns `false` when permission is denied
 * (already-denied surface needs the user to flip System Settings).
 */
function primeMacMediaAccess(kind: 'microphone' | 'camera'): void {
  try {
    const status = systemPreferences.getMediaAccessStatus(kind);
    recordEvent('tcc', 'access-status', { kind, status });
    if (status === 'not-determined') {
      systemPreferences
        .askForMediaAccess(kind)
        .then((granted) => {
          recordEvent('tcc', 'ask-result', { kind, granted });
        })
        .catch((err) => {
          recordEvent('tcc', 'ask-threw', {
            kind,
            message: err instanceof Error ? err.message : String(err),
          });
        });
    }
  } catch (err) {
    // Old Electron / non-macOS builds may not expose the call at all.
    // The handlers above still work; we just lose the proactive prompt.
    recordEvent('tcc', 'priming-failed', {
      kind,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
