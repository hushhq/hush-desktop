import { describe, it, expect, vi } from 'vitest';
import {
  buildCloseHandler,
  createLifecycleState,
  type HideableWindow,
} from '../src/main/lifecycle';

function fakeWindow(initial: Partial<HideableWindow> = {}): HideableWindow {
  return {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    on: vi.fn(),
    ...initial,
  } as HideableWindow;
}

describe('buildCloseHandler', () => {
  it('hides the window and cancels the close event while not quitting', () => {
    const hideWindow = vi.fn();
    const handler = buildCloseHandler({
      isQuitting: () => false,
      hideWindow,
    });
    const event = { preventDefault: vi.fn() };

    handler(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(hideWindow).toHaveBeenCalledOnce();
  });

  it('lets the close event propagate once the lifecycle is quitting', () => {
    const hideWindow = vi.fn();
    const handler = buildCloseHandler({
      isQuitting: () => true,
      hideWindow,
    });
    const event = { preventDefault: vi.fn() };

    handler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(hideWindow).not.toHaveBeenCalled();
  });

  it('re-reads the quitting flag each call so a mid-session quit flips behaviour', () => {
    let quitting = false;
    const hideWindow = vi.fn();
    const handler = buildCloseHandler({
      isQuitting: () => quitting,
      hideWindow,
    });

    handler({ preventDefault: vi.fn() });
    expect(hideWindow).toHaveBeenCalledTimes(1);

    quitting = true;
    const event = { preventDefault: vi.fn() };
    handler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(hideWindow).toHaveBeenCalledTimes(1); // still 1 — second call was a real quit
  });
});

describe('createLifecycleState', () => {
  it('starts not-quitting and flips to quitting only via markQuitting', () => {
    const lifecycle = createLifecycleState();
    expect(lifecycle.isQuitting()).toBe(false);
    lifecycle.markQuitting();
    expect(lifecycle.isQuitting()).toBe(true);
  });

  it('attaches a close handler that hides the window while not quitting', () => {
    const lifecycle = createLifecycleState();
    const win = fakeWindow();
    lifecycle.attachCloseInterceptor(win);

    const onMock = win.on as unknown as ReturnType<typeof vi.fn>;
    expect(onMock).toHaveBeenCalledOnce();
    const [eventName, handler] = onMock.mock.calls[0];
    expect(eventName).toBe('close');

    const event = { preventDefault: vi.fn() };
    handler(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(win.hide).toHaveBeenCalledOnce();
  });

  it('lets the close handler short-circuit after markQuitting fires', () => {
    const lifecycle = createLifecycleState();
    const win = fakeWindow();
    lifecycle.attachCloseInterceptor(win);

    lifecycle.markQuitting();
    const [, handler] = (win.on as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const event = { preventDefault: vi.fn() };
    handler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it('does not call hide on a destroyed window when the OS races the close handler', () => {
    const lifecycle = createLifecycleState();
    const win = fakeWindow({ isDestroyed: vi.fn(() => true) });
    lifecycle.attachCloseInterceptor(win);
    const [, handler] = (win.on as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const event = { preventDefault: vi.fn() };
    handler(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(win.hide).not.toHaveBeenCalled();
  });

  describe('revealWindow', () => {
    it('shows and focuses a hidden window', () => {
      const lifecycle = createLifecycleState();
      const win = fakeWindow({
        isVisible: vi.fn(() => false),
        isMinimized: vi.fn(() => false),
      });
      lifecycle.revealWindow(win);
      expect(win.show).toHaveBeenCalledOnce();
      expect(win.focus).toHaveBeenCalledOnce();
      expect(win.restore).not.toHaveBeenCalled();
    });

    it('restores a minimized window before focusing it', () => {
      const lifecycle = createLifecycleState();
      const win = fakeWindow({
        isMinimized: vi.fn(() => true),
        isVisible: vi.fn(() => true),
      });
      lifecycle.revealWindow(win);
      expect(win.restore).toHaveBeenCalledOnce();
      expect(win.focus).toHaveBeenCalledOnce();
    });

    it('focuses an already-visible window without redundant show()', () => {
      const lifecycle = createLifecycleState();
      const win = fakeWindow({ isVisible: vi.fn(() => true) });
      lifecycle.revealWindow(win);
      expect(win.show).not.toHaveBeenCalled();
      expect(win.focus).toHaveBeenCalledOnce();
    });

    it('is a no-op for null / destroyed windows', () => {
      const lifecycle = createLifecycleState();
      expect(() => lifecycle.revealWindow(null)).not.toThrow();
      expect(() => lifecycle.revealWindow(undefined)).not.toThrow();
      const destroyed = fakeWindow({ isDestroyed: vi.fn(() => true) });
      lifecycle.revealWindow(destroyed);
      expect(destroyed.show).not.toHaveBeenCalled();
      expect(destroyed.focus).not.toHaveBeenCalled();
    });
  });
});
