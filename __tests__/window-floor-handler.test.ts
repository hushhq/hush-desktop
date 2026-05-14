import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildWindowFloorHandler, ResizableWindow, WINDOW_FLOOR } from '../src/main/ipc/handlers';

function fakeWindow(initialSize: [number, number] = [1280, 900]): ResizableWindow & {
  setMinimumSize: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
} {
  let size: [number, number] = initialSize;
  return {
    setMinimumSize: vi.fn(),
    getSize: () => size,
    setSize: vi.fn((width: number, height: number) => {
      size = [width, height];
    }),
  };
}

describe('buildWindowFloorHandler', () => {
  let handler: ReturnType<typeof buildWindowFloorHandler>;

  beforeEach(() => {
    handler = buildWindowFloorHandler();
  });

  it('applies the auth floor (900 x 860) for the pre-login profile', () => {
    const win = fakeWindow();
    handler.setMinFloor(win, 'auth');
    expect(win.setMinimumSize).toHaveBeenCalledWith(
      WINDOW_FLOOR.auth.width,
      WINDOW_FLOOR.auth.height,
    );
    expect(win.setMinimumSize).toHaveBeenCalledWith(900, 860);
  });

  it('applies the operative-app floor (940 x 500) for the post-login profile', () => {
    const win = fakeWindow();
    handler.setMinFloor(win, 'app');
    expect(win.setMinimumSize).toHaveBeenCalledWith(
      WINDOW_FLOOR.app.width,
      WINDOW_FLOOR.app.height,
    );
    expect(win.setMinimumSize).toHaveBeenCalledWith(940, 500);
  });

  it('does not resize a window that already exceeds the new floor', () => {
    const win = fakeWindow([1400, 1000]);
    handler.setMinFloor(win, 'app');
    expect(win.setSize).not.toHaveBeenCalled();
  });

  it('grows the window to the new floor when it is currently smaller', () => {
    // Compact app size, switching to the taller auth floor must push the
    // window up to the new minimum so the renderer is never painted below it.
    const win = fakeWindow([940, 500]);
    handler.setMinFloor(win, 'auth');
    expect(win.setSize).toHaveBeenCalledWith(940, 860);
  });

  it('throws on an unknown profile string', () => {
    const win = fakeWindow();
    expect(() => handler.setMinFloor(win, 'huge')).toThrow(/invalid profile/);
    expect(win.setMinimumSize).not.toHaveBeenCalled();
  });

  it('throws when profile is not a string', () => {
    const win = fakeWindow();
    expect(() => handler.setMinFloor(win, 42)).toThrow(/invalid profile/);
  });

  it('is a no-op when the BrowserWindow lookup returns null', () => {
    // Mirrors `BrowserWindow.fromWebContents` returning null after the
    // window was destroyed between IPC send and handle.
    expect(() => handler.setMinFloor(null, 'app')).not.toThrow();
  });
});
