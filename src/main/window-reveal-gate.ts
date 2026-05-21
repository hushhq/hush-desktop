/**
 * Gates the moment the cold-launch `BrowserWindow` becomes visible.
 *
 * Electron's `ready-to-show` event fires after the first paint, but the
 * Hush renderer needs a beat after that to:
 *   - apply the `data-desktop` marker on `<html>` (used by glass /
 *     vibrancy CSS), and
 *   - mount the authenticated shell with theme / glass-intensity vars.
 *
 * Showing the window on `ready-to-show` alone produces a brief flash of
 * the half-styled shell. The gate waits for both signals before calling
 * `win.show()`:
 *
 *   1. Electron emits `ready-to-show` (renderer at least painted).
 *   2. Renderer sends the renderer-ready IPC (`app:renderer-ready`)
 *      from the desktop shell hook.
 *
 * A conservative fallback timeout reveals the window even if the
 * renderer never signals — a broken renderer must not leave the app
 * invisible forever. The fallback is intentionally generous (longer
 * than any realistic shell mount) so it only fires in pathological
 * cases.
 *
 * The gate exposes its lifecycle as plain methods so the unit tests can
 * drive it without spinning up Electron.
 */

export interface RevealableWindow {
  /**
   * Reveals the window. Must be safe to call once. The gate guarantees
   * exactly one `show()` per gate instance.
   */
  show(): void
  /**
   * Optional native opacity bridge. Electron exposes this on macOS and
   * Windows. When available, the gate can warm up native window material
   * while the window is technically shown but still invisible to the user.
   */
  setOpacity?(opacity: number): void
  /**
   * Whether the underlying BrowserWindow is gone. Real
   * `BrowserWindow#isDestroyed` is consulted so a late renderer-ready
   * IPC arriving after a close cannot re-show or crash main.
   */
  isDestroyed(): boolean
}

export interface WindowRevealGateOptions {
  /**
   * Hard cap on how long the gate waits for the renderer-ready signal
   * after `ready-to-show`. If the renderer never signals, the window
   * is shown anyway so the app cannot get stuck invisible.
   */
  fallbackTimeoutMs?: number
  /**
   * Optional setTimeout / clearTimeout injection. Production wires
   * Node's globals; tests inject a fake scheduler so they can assert
   * the fallback timer is armed and cleared.
   */
  setTimeoutImpl?: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeoutImpl?: (id: ReturnType<typeof setTimeout>) => void
  /**
   * Delay between showing an opacity-0 window and making it visible.
   * This gives macOS NSVisualEffectView / Windows background material a
   * compositor turn before the user can see the window.
   */
  materialWarmupMs?: number
  /**
   * Fired once the window has completed its cold reveal. The renderer
   * uses this to transition chrome surfaces from their solid startup
   * colour to the native-material glass colour.
   */
  onRevealed?: () => void
}

export const DEFAULT_REVEAL_FALLBACK_MS = 5000
export const DEFAULT_MATERIAL_WARMUP_MS = 120

/**
 * Pure reveal coordinator. The Electron-specific wiring (subscribing to
 * `ready-to-show` + the IPC channel) lives in the caller; the gate just
 * tracks state.
 */
export class WindowRevealGate {
  private readonly window: RevealableWindow
  private readonly fallbackMs: number
  private readonly materialWarmupMs: number
  private readonly onRevealed: () => void
  private readonly setTimeoutImpl: NonNullable<WindowRevealGateOptions['setTimeoutImpl']>
  private readonly clearTimeoutImpl: NonNullable<WindowRevealGateOptions['clearTimeoutImpl']>
  private electronReady = false
  private rendererReady = false
  private revealed = false
  private destroyed = false
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null

  constructor(window: RevealableWindow, options: WindowRevealGateOptions = {}) {
    this.window = window
    this.fallbackMs = options.fallbackTimeoutMs ?? DEFAULT_REVEAL_FALLBACK_MS
    this.materialWarmupMs = options.materialWarmupMs ?? DEFAULT_MATERIAL_WARMUP_MS
    this.onRevealed = options.onRevealed ?? (() => {})
    this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout
  }

  /** Called from the `ready-to-show` listener. */
  notifyElectronReady(): void {
    if (this.electronReady) return
    this.electronReady = true
    if (this.rendererReady) {
      this.reveal()
      return
    }
    this.armFallback()
  }

  /**
   * Called from the renderer-ready IPC handler. Idempotent and safe
   * after a window destroy — the IPC channel stays subscribed for the
   * process lifetime and a late message must not throw.
   */
  notifyRendererReady(): void {
    if (this.rendererReady) return
    this.rendererReady = true
    if (this.electronReady) this.reveal()
  }

  /** Called from the window's `closed` event. Cancels any pending timer. */
  notifyWindowDestroyed(): void {
    this.destroyed = true
    this.cancelFallback()
  }

  /** Test helper. Production code does not need to read internal state. */
  get state(): { electronReady: boolean; rendererReady: boolean; revealed: boolean } {
    return {
      electronReady: this.electronReady,
      rendererReady: this.rendererReady,
      revealed: this.revealed,
    }
  }

  private armFallback(): void {
    if (this.fallbackTimer !== null) return
    this.fallbackTimer = this.setTimeoutImpl(() => {
      this.fallbackTimer = null
      this.reveal()
    }, this.fallbackMs)
  }

  private cancelFallback(): void {
    if (this.fallbackTimer === null) return
    this.clearTimeoutImpl(this.fallbackTimer)
    this.fallbackTimer = null
  }

  private reveal(): void {
    if (this.revealed) return
    this.cancelFallback()
    if (this.destroyed || this.window.isDestroyed()) return
    this.revealed = true
    this.window.setOpacity?.(0)
    this.window.show()
    if (typeof this.window.setOpacity !== 'function') {
      this.onRevealed()
      return
    }
    this.setTimeoutImpl(() => {
      if (this.destroyed || this.window.isDestroyed()) return
      this.window.setOpacity?.(1)
      this.onRevealed()
    }, this.materialWarmupMs)
  }
}
