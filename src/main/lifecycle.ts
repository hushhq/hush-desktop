/**
 * Minimal contract the close-interceptor needs from a window. Carved out
 * so the handler can be unit-tested without instantiating Electron.
 */
export interface HideableWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  hide(): void;
  show(): void;
  focus(): void;
  restore(): void;
  on(event: 'close', handler: (event: { preventDefault(): void }) => void): unknown;
}

export interface LifecycleState {
  /** True once the user has explicitly chosen to quit (tray menu / Cmd-Q). */
  isQuitting(): boolean;
  /** Flip the flag so the next close event short-circuits the hide interceptor. */
  markQuitting(): void;
  /** Wire the hide-on-close interceptor onto a freshly-created BrowserWindow. */
  attachCloseInterceptor(win: HideableWindow): void;
  /** Idempotent show/focus for the dock / tray / single-instance handlers. */
  revealWindow(win: HideableWindow | null | undefined): void;
}

/**
 * Pure close handler.
 *
 * Behaviour:
 *   - When the lifecycle is in the *quitting* phase the close event is
 *     allowed to propagate so the window can really be destroyed.
 *   - Otherwise the event is cancelled and the window is hidden. The
 *     renderer process is *not* torn down, so volatile state (joined
 *     voice room, draft messages, focus, scroll position) survives a
 *     window close.
 */
export function buildCloseHandler(deps: {
  isQuitting: () => boolean;
  hideWindow: () => void;
}) {
  return function handleClose(event: { preventDefault(): void }): void {
    if (deps.isQuitting()) return;
    event.preventDefault();
    deps.hideWindow();
  };
}

export function createLifecycleState(): LifecycleState {
  let quitting = false;

  function reveal(win: HideableWindow | null | undefined): void {
    if (!win) return;
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  }

  return {
    isQuitting: () => quitting,
    markQuitting: () => {
      quitting = true;
    },
    attachCloseInterceptor(win) {
      const handler = buildCloseHandler({
        isQuitting: () => quitting,
        hideWindow: () => {
          if (!win.isDestroyed()) win.hide();
        },
      });
      win.on('close', handler);
    },
    revealWindow: reveal,
  };
}
