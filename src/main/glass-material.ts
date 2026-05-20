import type { BrowserWindow } from 'electron';
import type { GlassMaterial } from '../shared/desktop-api';
import type { GlassCapabilities } from './glass-capabilities';

/**
 * Per-platform default applied when the renderer selects the `auto`
 * sentinel. Selecting `auto` after a manual pick must revert the window
 * to this default, so the implementation is intentionally *not* a no-op.
 *
 * macOS uses the `menu` NSVisualEffectView material. It matches the
 * native menu/popover chrome shading and is the only macOS vibrancy
 * we currently expose to users, so `auto` and any explicit selection
 * collapse onto the same value while the picker remains hidden.
 */
const MACOS_DEFAULT_VIBRANCY = 'menu' as const;
const WIN32_DEFAULT_MATERIAL = 'mica' as const;

/**
 * Narrow contract `applyGlassMaterial` consumes from the focused window.
 * Carved out so the handler is unit-testable without spinning up Electron
 * or a real `BrowserWindow`.
 */
export interface MaterialApplyTarget {
  setVibrancy?: (
    type: 'sidebar' | 'under-window' | 'menu' | 'headerView' | null,
  ) => void;
  setBackgroundMaterial?: (
    material: 'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed',
  ) => void;
}

export class GlassMaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlassMaterialError';
  }
}

/**
 * Validates the input against the host capability set and applies the
 * requested material to the window when the platform supports it.
 *
 * Contract:
 *   - `auto` resets the window to the platform default (sidebar on
 *     macOS, mica on Win11 22H2+). It is not a no-op.
 *   - Any non-`auto` value must appear in `capabilities.materials`. Stale
 *     cross-platform values (e.g. a Windows-shaped `mica` arriving on
 *     macOS) are rejected with {@link GlassMaterialError} so the
 *     renderer's normalization is the single source of truth.
 *   - When the host reports `materialSwitchingSupported: false`
 *     (Linux, Win10/early-Win11), the call resolves without throwing
 *     and without touching the window — the renderer never offers a
 *     picker in that case but the IPC layer stays robust against
 *     race conditions.
 */
export function applyGlassMaterial(
  win: MaterialApplyTarget | null,
  material: unknown,
  capabilities: GlassCapabilities,
): void {
  if (!win) return;
  if (typeof material !== 'string') {
    throw new GlassMaterialError(
      `window:set-glass-material: invalid material ${JSON.stringify(material)}`,
    );
  }
  if (!capabilities.materialSwitchingSupported) return;
  const allowed = new Set(capabilities.materials);
  if (!allowed.has(material as GlassMaterial)) {
    throw new GlassMaterialError(
      `window:set-glass-material: material ${JSON.stringify(material)} is not in the host capability set`,
    );
  }
  if (capabilities.platform === 'darwin') {
    if (typeof win.setVibrancy !== 'function') return;
    const resolved = material === 'auto' ? MACOS_DEFAULT_VIBRANCY : material;
    win.setVibrancy(
      resolved as 'sidebar' | 'under-window' | 'menu' | 'headerView',
    );
    return;
  }
  if (capabilities.platform === 'win32') {
    if (typeof win.setBackgroundMaterial !== 'function') return;
    const resolved = material === 'auto' ? WIN32_DEFAULT_MATERIAL : material;
    win.setBackgroundMaterial(resolved as 'mica' | 'acrylic');
  }
}

/**
 * Adapter that lets `registerIpcHandlers` call the pure helper against a
 * real Electron `BrowserWindow`. Keeps the IPC handler thin.
 */
export function applyGlassMaterialToBrowserWindow(
  win: BrowserWindow | null,
  material: unknown,
  capabilities: GlassCapabilities,
): void {
  applyGlassMaterial(win as MaterialApplyTarget | null, material, capabilities);
}
