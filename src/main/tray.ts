import { app, Menu, nativeImage, Tray } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';

const TRAY_TOOLTIP = 'Hush';

/**
 * Tray icon target dimension. Most desktop trays render best at ~18px on
 * standard density; Electron will upscale for retina automatically.
 */
const TRAY_ICON_SIZE = 18;

/**
 * Hooks injected from `main/index.ts` so the tray module stays free of
 * direct app/BrowserWindow access — this makes the menu builder testable
 * in isolation.
 */
export interface TrayHooks {
  /** Show & focus the existing window. Must not reload the renderer. */
  onShow: () => void;
  /** Real quit. The caller is responsible for flipping the lifecycle flag. */
  onQuit: () => void;
}

/**
 * Pure builder for the tray's context menu template.
 *
 * Kept side-effect free so unit tests can verify the structure (item
 * count, labels, separator placement, click wiring) without spinning up
 * the Electron `Menu` runtime.
 */
export function buildTrayMenuTemplate(hooks: TrayHooks): MenuItemConstructorOptions[] {
  return [
    { label: 'Show Hush', click: hooks.onShow },
    { type: 'separator' },
    { label: 'Quit Hush', click: hooks.onQuit },
  ];
}

/**
 * Resolves the best tray-icon source bundled with the app. Order:
 *   1. `build/icon.png` — produced by `scripts/copy-icons.cjs` from the
 *      canonical Hush brand mark.
 *   2. `assets/hush.icon/Assets/icon.png` — uncompiled brand source.
 *
 * Returns `null` when nothing is available; callers should skip tray
 * creation rather than crash.
 */
export function resolveTrayIconPath(): string | null {
  const candidates = [
    join(app.getAppPath(), 'build', 'icon.png'),
    join(app.getAppPath(), 'assets', 'hush.icon', 'Assets', 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Instantiates the OS tray (system tray on Windows / Linux, menu-bar
 * extra on macOS) and wires the Show / Quit menu. Returns `null` if the
 * tray icon source is missing so the boot path stays linear instead of
 * throwing.
 */
export function createAppTray(hooks: TrayHooks): Tray | null {
  const iconPath = resolveTrayIconPath();
  if (!iconPath) return null;

  const baseImage = nativeImage.createFromPath(iconPath);
  if (baseImage.isEmpty()) return null;
  const sizedImage = baseImage.resize({
    width: TRAY_ICON_SIZE,
    height: TRAY_ICON_SIZE,
  });

  const tray = new Tray(sizedImage);
  tray.setToolTip(TRAY_TOOLTIP);
  const menu = Menu.buildFromTemplate(buildTrayMenuTemplate(hooks));
  tray.setContextMenu(menu);
  // Left-click on Win / Linux opens the window directly. macOS surfaces
  // the context menu on left-click by default, but we still wire the
  // `click` handler so trays that opt out (or KDE's behaviour switch)
  // get the same affordance.
  tray.on('click', hooks.onShow);

  return tray;
}
