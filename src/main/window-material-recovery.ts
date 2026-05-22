import type { BrowserWindow } from 'electron';

const MACOS_DEFAULT_VIBRANCY = 'menu';
const WIN32_DEFAULT_MATERIAL = 'mica';
const RECOVERY_EVENTS = [
  'maximize',
  'unmaximize',
  'restore',
  'leave-full-screen',
  'resized',
  'show',
  'focus',
] as const;

export interface RecoverableMaterialWindow {
  on(event: (typeof RECOVERY_EVENTS)[number], listener: () => void): unknown;
  setVibrancy?: (type: typeof MACOS_DEFAULT_VIBRANCY) => void;
  setBackgroundMaterial?: (material: typeof WIN32_DEFAULT_MATERIAL) => void;
  isDestroyed(): boolean;
}

/**
 * Re-applies the platform native material after window state transitions.
 *
 * Windows can drop Mica when returning from maximized/fullscreen states in
 * frameless windows. Re-applying the material is idempotent and restores both
 * backdrop and DWM corner rounding on affected hosts. macOS gets the same
 * recovery hook for symmetry, though its vibrancy path is usually stable.
 */
export function recoverNativeMaterial(
  win: RecoverableMaterialWindow,
  platform: NodeJS.Platform = process.platform,
): void {
  if (win.isDestroyed()) return;
  if (platform === 'darwin' && typeof win.setVibrancy === 'function') {
    win.setVibrancy(MACOS_DEFAULT_VIBRANCY);
    return;
  }
  if (platform === 'win32' && typeof win.setBackgroundMaterial === 'function') {
    win.setBackgroundMaterial(WIN32_DEFAULT_MATERIAL);
  }
}

export function attachNativeMaterialRecovery(
  win: BrowserWindow,
  platform: NodeJS.Platform = process.platform,
): void {
  const target = win as unknown as RecoverableMaterialWindow;
  for (const event of RECOVERY_EVENTS) {
    target.on(event, () => recoverNativeMaterial(target, platform));
  }
}
