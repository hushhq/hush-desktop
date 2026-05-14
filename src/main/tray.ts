import { app, Menu, nativeImage, Tray } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { recordEvent } from './diagnostics';

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
 * Runtime context the candidate resolver needs. Carved out so the resolver
 * stays pure and can be unit-tested without booting Electron.
 *
 * `appPath` mirrors `app.getAppPath()` — the location of the running app
 * code. In dev that is the repo root; in packaged builds it points inside
 * `Resources/app.asar` (or `Resources/app` for asar-less builds), which is
 * NOT where `extraResources` lands.
 *
 * `resourcesPath` mirrors `process.resourcesPath` — the directory that
 * receives anything listed under `extraResources` in
 * `electron-builder.config.js`. The packaged tray icon lives there.
 */
export interface TrayIconCandidateContext {
  readonly isPackaged: boolean;
  readonly appPath: string;
  readonly resourcesPath: string;
}

/**
 * Pure ordered list of paths to probe for the tray icon. Packaged builds
 * must resolve from `process.resourcesPath/build/icon.png` because
 * `app.getAppPath()` points at the asar-embedded code, which never contains
 * `build/`. Dev builds keep their existing fallback chain so `npm run dev`
 * works without a prior `dist:*` run.
 */
export function buildTrayIconCandidates(ctx: TrayIconCandidateContext): string[] {
  if (ctx.isPackaged) {
    return [join(ctx.resourcesPath, 'build', 'icon.png')];
  }
  return [
    join(ctx.appPath, 'build', 'icon.png'),
    join(ctx.appPath, 'assets', 'hush.icon', 'Assets', 'icon.png'),
  ];
}

/**
 * Pure resolver: returns the first candidate that exists, or `null`.
 * The filesystem probe is injected so tests can drive the function without
 * touching disk.
 */
export function resolveTrayIconPathFrom(
  ctx: TrayIconCandidateContext,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const candidates = buildTrayIconCandidates(ctx);
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Production-side wrapper that fills the context from the live Electron
 * `app` and `process` objects. Kept thin so unit tests target the pure
 * resolver above instead of stubbing Electron globals.
 */
export function resolveTrayIconPath(): string | null {
  return resolveTrayIconPathFrom({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  });
}

/**
 * Instantiates the OS tray (system tray on Windows / Linux, menu-bar
 * extra on macOS) and wires the Show / Quit menu. Returns `null` if no
 * candidate icon exists on disk or the bundled image fails to decode so
 * the boot path stays linear instead of throwing.
 *
 * Tray creation outcomes are logged via the desktop diagnostics surface
 * so a packaged build that silently skips the menu-bar item (icon asset
 * missing, stripped extraResources, decode failure) leaves a trail.
 */
export function createAppTray(hooks: TrayHooks): Tray | null {
  const iconPath = resolveTrayIconPath();
  if (!iconPath) {
    recordEvent('tray', 'skipped:no-icon-candidate', {
      isPackaged: app.isPackaged,
    });
    return null;
  }

  const baseImage = nativeImage.createFromPath(iconPath);
  if (baseImage.isEmpty()) {
    recordEvent('tray', 'skipped:empty-image', { isPackaged: app.isPackaged });
    return null;
  }
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

  recordEvent('tray', 'created', { isPackaged: app.isPackaged });
  return tray;
}
