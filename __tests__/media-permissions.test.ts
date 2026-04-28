import { describe, expect, it } from 'vitest';
import {
  chooseDisplayMediaSource,
  isTrustedMediaRequest,
  isTrustedRendererPermission,
  isTrustedMediaOrigin,
  resolveDevRendererOrigin,
  type DesktopMediaSource,
} from '../src/main/media-permissions';

describe('resolveDevRendererOrigin', () => {
  it('falls back to the Vite default when env is undefined', () => {
    expect(resolveDevRendererOrigin(undefined)).toBe('http://localhost:5173');
  });

  it('falls back to the Vite default when env is the empty string', () => {
    expect(resolveDevRendererOrigin('')).toBe('http://localhost:5173');
  });

  it('normalises a full URL to its origin', () => {
    expect(resolveDevRendererOrigin('http://localhost:4321/some/path?x=1')).toBe(
      'http://localhost:4321',
    );
  });

  it('falls back to the Vite default when the env value is not a URL', () => {
    expect(resolveDevRendererOrigin('not a url')).toBe('http://localhost:5173');
  });
});

describe('isTrustedMediaOrigin', () => {
  const dev = 'http://localhost:5173';

  it('trusts the production app:// renderer origin', () => {
    expect(isTrustedMediaOrigin('app://localhost/', dev)).toBe(true);
    expect(isTrustedMediaOrigin('app://localhost/auth/login', dev)).toBe(true);
  });

  it('trusts the configured dev renderer origin', () => {
    expect(isTrustedMediaOrigin('http://localhost:5173/', dev)).toBe(true);
    expect(isTrustedMediaOrigin('http://localhost:5173/voice/123', dev)).toBe(true);
  });

  it('rejects unrelated http origins', () => {
    expect(isTrustedMediaOrigin('https://evil.example.com/', dev)).toBe(false);
    expect(isTrustedMediaOrigin('http://localhost:5174/', dev)).toBe(false);
  });

  it('rejects empty / undefined / malformed urls', () => {
    expect(isTrustedMediaOrigin('', dev)).toBe(false);
    expect(isTrustedMediaOrigin(undefined, dev)).toBe(false);
    expect(isTrustedMediaOrigin('not-a-url', dev)).toBe(false);
  });

  it('rejects file:// and chrome:// schemes', () => {
    expect(isTrustedMediaOrigin('file:///tmp/index.html', dev)).toBe(false);
    expect(isTrustedMediaOrigin('chrome://settings', dev)).toBe(false);
  });

  it('honours an alternate dev origin', () => {
    expect(isTrustedMediaOrigin('http://localhost:4321/', 'http://localhost:4321')).toBe(true);
    expect(isTrustedMediaOrigin('http://localhost:5173/', 'http://localhost:4321')).toBe(false);
  });
});

describe('isTrustedMediaRequest', () => {
  const dev = 'http://localhost:5173';

  it('trusts media requests by securityOrigin when requestingUrl is absent', () => {
    expect(isTrustedMediaRequest({
      requestingUrl: '',
      securityOrigin: 'app://localhost',
    }, dev)).toBe(true);
  });

  it('trusts media checks by requestingOrigin', () => {
    expect(isTrustedMediaRequest({
      requestingOrigin: 'http://localhost:5173',
    }, dev)).toBe(true);
  });

  it('trusts display-media requests by frameUrl fallback', () => {
    expect(isTrustedMediaRequest({
      frameUrl: 'app://localhost/room/general',
    }, dev)).toBe(true);
  });

  it('rejects requests when all supplied origins are untrusted', () => {
    expect(isTrustedMediaRequest({
      requestingUrl: 'https://evil.example.com',
      securityOrigin: 'https://evil.example.com',
      frameUrl: 'file:///tmp/index.html',
    }, dev)).toBe(false);
  });
});

describe('isTrustedRendererPermission', () => {
  it('allows browser affordances the renderer actually uses', () => {
    expect(isTrustedRendererPermission('media')).toBe(true);
    expect(isTrustedRendererPermission('display-capture')).toBe(true);
    expect(isTrustedRendererPermission('clipboard-sanitized-write')).toBe(true);
    expect(isTrustedRendererPermission('fullscreen')).toBe(true);
    expect(isTrustedRendererPermission('notifications')).toBe(true);
  });

  it('denies sensitive permissions that Hush does not use', () => {
    expect(isTrustedRendererPermission('clipboard-read')).toBe(false);
    expect(isTrustedRendererPermission('fileSystem')).toBe(false);
    expect(isTrustedRendererPermission('openExternal')).toBe(false);
    expect(isTrustedRendererPermission('usb')).toBe(false);
    expect(isTrustedRendererPermission('hid')).toBe(false);
  });
});

describe('chooseDisplayMediaSource', () => {
  function source(id: string, name: string): DesktopMediaSource {
    return { id, name };
  }

  it('returns null when sources is undefined', () => {
    expect(chooseDisplayMediaSource(undefined)).toBeNull();
  });

  it('returns null when sources is empty', () => {
    expect(chooseDisplayMediaSource([])).toBeNull();
  });

  it('prefers the first screen source over windows', () => {
    const sources = [
      source('window:1234:0', 'Slack'),
      source('screen:0:0', 'Built-in display'),
      source('screen:1:0', 'External display'),
    ];
    const chosen = chooseDisplayMediaSource(sources);
    expect(chosen?.id).toBe('screen:0:0');
  });

  it('falls back to the first source when no screen is offered', () => {
    const sources = [
      source('window:1234:0', 'Slack'),
      source('window:5678:0', 'Chrome'),
    ];
    const chosen = chooseDisplayMediaSource(sources);
    expect(chosen?.id).toBe('window:1234:0');
  });

  it('returns the only source when one is available', () => {
    const sources = [source('screen:0:0', 'Built-in display')];
    expect(chooseDisplayMediaSource(sources)?.id).toBe('screen:0:0');
  });
});
