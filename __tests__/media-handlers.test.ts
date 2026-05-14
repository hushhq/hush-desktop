/**
 * Regression tests for `registerMediaHandlers`.
 *
 * The MVP version of this module proactively triggered the macOS TCC
 * prompt for microphone and camera at app startup. That produced an
 * immediate OS dialog before the user had done anything that needed
 * mic/camera, which is bad UX for a chat app. These tests freeze the
 * new contract: status MAY be read, OS prompts MUST NOT fire.
 *
 * Permission request/check handlers still need to grant trusted origins
 * and reject everything else, so we also exercise the callbacks that
 * `registerMediaHandlers` installs on the supplied `Session`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tempLogsDir: string;
let tempAppPath: string;

const askForMediaAccess = vi.fn();
const getMediaAccessStatus = vi.fn();

vi.mock('electron', () => ({
  app: {
    getAppPath: () => tempAppPath,
    isPackaged: true,
    getPath: (name: string) => {
      if (name === 'logs') return tempLogsDir;
      if (name === 'exe') return join(tempAppPath, 'Hush');
      if (name === 'userData') return join(tempLogsDir, 'userData');
      throw new Error(`unexpected app.getPath name: ${name}`);
    },
  },
  systemPreferences: {
    askForMediaAccess: (...args: unknown[]) => askForMediaAccess(...args),
    getMediaAccessStatus: (...args: unknown[]) => getMediaAccessStatus(...args),
  },
  desktopCapturer: {
    getSources: vi.fn(async () => []),
  },
}));

import { registerMediaHandlers } from '../src/main/media-handlers';

type AnyFn = (...args: unknown[]) => unknown;

interface SessionStub {
  permissionRequestHandler: AnyFn | null;
  permissionCheckHandler: AnyFn | null;
  displayMediaRequestHandler: AnyFn | null;
  setPermissionRequestHandler(fn: AnyFn): void;
  setPermissionCheckHandler(fn: AnyFn): void;
  setDisplayMediaRequestHandler(fn: AnyFn): void;
}

function buildSessionStub(): SessionStub {
  const stub: SessionStub = {
    permissionRequestHandler: null,
    permissionCheckHandler: null,
    displayMediaRequestHandler: null,
    setPermissionRequestHandler(fn) {
      stub.permissionRequestHandler = fn;
    },
    setPermissionCheckHandler(fn) {
      stub.permissionCheckHandler = fn;
    },
    setDisplayMediaRequestHandler(fn) {
      stub.displayMediaRequestHandler = fn;
    },
  };
  return stub;
}

beforeEach(() => {
  tempLogsDir = mkdtempSync(join(tmpdir(), 'hush-mh-logs-'));
  tempAppPath = mkdtempSync(join(tmpdir(), 'hush-mh-app-'));
  askForMediaAccess.mockReset();
  getMediaAccessStatus.mockReset();
  getMediaAccessStatus.mockReturnValue('not-determined');
});

afterEach(() => {
  rmSync(tempLogsDir, { recursive: true, force: true });
  rmSync(tempAppPath, { recursive: true, force: true });
});

function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    return fn();
  } finally {
    if (originalDescriptor) Object.defineProperty(process, 'platform', originalDescriptor);
  }
}

describe('registerMediaHandlers — no startup TCC prompt', () => {
  it('RegisterOnDarwinWithNotDetermined_DoesNotCallAskForMediaAccess', () => {
    withPlatform('darwin', () => {
      const session = buildSessionStub();
      registerMediaHandlers(session as never, { devRendererUrl: undefined });
    });
    expect(askForMediaAccess).not.toHaveBeenCalled();
  });

  it('RegisterOnDarwinWithDeniedStatus_DoesNotCallAskForMediaAccess', () => {
    getMediaAccessStatus.mockReturnValue('denied');
    withPlatform('darwin', () => {
      const session = buildSessionStub();
      registerMediaHandlers(session as never, { devRendererUrl: undefined });
    });
    expect(askForMediaAccess).not.toHaveBeenCalled();
  });

  it('RegisterOnDarwin_ReadsMicAndCameraStatusForDiagnostics', () => {
    withPlatform('darwin', () => {
      const session = buildSessionStub();
      registerMediaHandlers(session as never, { devRendererUrl: undefined });
    });
    expect(getMediaAccessStatus).toHaveBeenCalledWith('microphone');
    expect(getMediaAccessStatus).toHaveBeenCalledWith('camera');
  });

  it('RegisterOnNonDarwin_TouchesNeitherStatusNorPrompt', () => {
    withPlatform('linux', () => {
      const session = buildSessionStub();
      registerMediaHandlers(session as never, { devRendererUrl: undefined });
    });
    expect(getMediaAccessStatus).not.toHaveBeenCalled();
    expect(askForMediaAccess).not.toHaveBeenCalled();
  });
});

describe('registerMediaHandlers — trust boundary still enforced', () => {
  it('PermissionRequest_TrustedOrigin_Granted', () => {
    const session = withPlatform('linux', () => {
      const s = buildSessionStub();
      registerMediaHandlers(s as never, { devRendererUrl: undefined });
      return s;
    });
    const granted = vi.fn();
    session.permissionRequestHandler!(
      undefined,
      'media',
      granted,
      { requestingUrl: 'app://localhost/' },
    );
    expect(granted).toHaveBeenCalledWith(true);
  });

  it('PermissionRequest_UntrustedOrigin_Denied', () => {
    const session = withPlatform('linux', () => {
      const s = buildSessionStub();
      registerMediaHandlers(s as never, { devRendererUrl: undefined });
      return s;
    });
    const granted = vi.fn();
    session.permissionRequestHandler!(
      undefined,
      'media',
      granted,
      { requestingUrl: 'https://evil.example.com/' },
    );
    expect(granted).toHaveBeenCalledWith(false);
  });

  it('PermissionRequest_UnsupportedPermission_Denied', () => {
    const session = withPlatform('linux', () => {
      const s = buildSessionStub();
      registerMediaHandlers(s as never, { devRendererUrl: undefined });
      return s;
    });
    const granted = vi.fn();
    session.permissionRequestHandler!(
      undefined,
      'usb',
      granted,
      { requestingUrl: 'app://localhost/' },
    );
    expect(granted).toHaveBeenCalledWith(false);
  });

  it('PermissionCheck_TrustedRequestingOrigin_ReturnsTrue', () => {
    const session = withPlatform('linux', () => {
      const s = buildSessionStub();
      registerMediaHandlers(s as never, { devRendererUrl: undefined });
      return s;
    });
    const result = session.permissionCheckHandler!(
      undefined,
      'media',
      'app://localhost',
      { requestingUrl: 'app://localhost/' },
    );
    expect(result).toBe(true);
  });

  it('PermissionCheck_UntrustedOrigin_ReturnsFalse', () => {
    const session = withPlatform('linux', () => {
      const s = buildSessionStub();
      registerMediaHandlers(s as never, { devRendererUrl: undefined });
      return s;
    });
    const result = session.permissionCheckHandler!(
      undefined,
      'media',
      'https://evil.example.com',
      { requestingUrl: 'https://evil.example.com/' },
    );
    expect(result).toBe(false);
  });

  it('DisplayMediaRequest_UntrustedFrame_CallsBackWithEmptySelection', async () => {
    const session = withPlatform('linux', () => {
      const s = buildSessionStub();
      registerMediaHandlers(s as never, { devRendererUrl: undefined });
      return s;
    });
    const callback = vi.fn();
    await session.displayMediaRequestHandler!(
      {
        frame: { url: 'https://evil.example.com/' },
        securityOrigin: 'https://evil.example.com',
      },
      callback,
    );
    expect(callback).toHaveBeenCalledWith({});
  });
});
