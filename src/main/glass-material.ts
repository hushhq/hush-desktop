import type { BrowserWindow } from 'electron';
import type { GlassMaterial } from '../shared/desktop-api';

/**
 * Per-platform whitelist of native window materials Hush is willing to
 * apply at runtime. Each entry comes from the Electron 34 documentation:
 *
 * - macOS (`BrowserWindow.setVibrancy`): a conservative subset of
 *   `NSVisualEffectView` materials that read as "subtle, neutral chrome"
 *   rather than fully transparent panels.
 * - Windows 11 (`BrowserWindow.setBackgroundMaterial`): only the two
 *   materials that match Hush's intended look. `tabbed` is omitted
 *   because the renderer does not draw a tab strip.
 *
 * `auto` is the sentinel that means "leave the platform default in
 * place". The handler resolves it to a no-op so the conservative pick
 * from `window-config.ts` stays in effect.
 */
const MACOS_MATERIALS: ReadonlySet<GlassMaterial> = new Set([
  'sidebar',
  'under-window',
  'menu',
  'headerView',
]);
const WIN32_MATERIALS: ReadonlySet<GlassMaterial> = new Set(['mica', 'acrylic']);

/** Defaults used when the user picks `"auto"` on each platform. */
const MACOS_DEFAULT_VIBRANCY = 'sidebar';
const WIN32_DEFAULT_MATERIAL = 'mica';

/**
 * Narrow contract `applyGlassMaterial` consumes from the focused window.
 * Carved out so the handler is unit-testable without spinning up Electron
 * or a real `BrowserWindow`.
 */
export interface MaterialApplyTarget {
  setVibrancy?: (
    type:
      | 'sidebar'
      | 'under-window'
      | 'menu'
      | 'headerView'
      | null,
  ) => void;
  setBackgroundMaterial?: (material: 'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed') => void;
}

export class GlassMaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlassMaterialError';
  }
}

function isGlassMaterial(value: unknown): value is GlassMaterial {
  return (
    value === 'auto' ||
    MACOS_MATERIALS.has(value as GlassMaterial) ||
    WIN32_MATERIALS.has(value as GlassMaterial)
  );
}

/**
 * Validates the input and applies the requested material to the window
 * if the host platform supports it. Returns silently on Linux and on
 * supported platforms when the renderer asks for a material the host
 * cannot honour — those combinations are explicit in the UI, so the
 * handler does not need to surface them as errors.
 */
export function applyGlassMaterial(
  win: MaterialApplyTarget | null,
  material: unknown,
  platform: NodeJS.Platform = process.platform,
): void {
  if (!win) return;
  if (!isGlassMaterial(material)) {
    throw new GlassMaterialError(
      `window:set-glass-material: invalid material ${JSON.stringify(material)}`,
    );
  }
  if (platform === 'darwin') {
    if (typeof win.setVibrancy !== 'function') return;
    const resolved = material === 'auto' ? MACOS_DEFAULT_VIBRANCY : material;
    if (!MACOS_MATERIALS.has(resolved as GlassMaterial)) return;
    win.setVibrancy(
      resolved as 'sidebar' | 'under-window' | 'menu' | 'headerView',
    );
    return;
  }
  if (platform === 'win32') {
    if (typeof win.setBackgroundMaterial !== 'function') return;
    const resolved = material === 'auto' ? WIN32_DEFAULT_MATERIAL : material;
    if (!WIN32_MATERIALS.has(resolved as GlassMaterial)) return;
    win.setBackgroundMaterial(resolved as 'mica' | 'acrylic');
    return;
  }
  // Linux and unknown platforms: native material not supported. The UI
  // already gates the picker so this branch is a safety net.
}

/**
 * Adapter that lets `registerIpcHandlers` call the pure helper against a
 * real Electron `BrowserWindow`. Keeps the IPC handler thin.
 */
export function applyGlassMaterialToBrowserWindow(
  win: BrowserWindow | null,
  material: unknown,
): void {
  applyGlassMaterial(win as MaterialApplyTarget | null, material);
}
