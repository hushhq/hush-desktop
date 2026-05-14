import { app, Menu, nativeImage, Tray } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { recordEvent } from './diagnostics';

const TRAY_TOOLTIP = 'Hush';

/**
 * Non-macOS tray icon target dimension. macOS uses pre-rendered template
 * assets (`trayIconTemplate.png` + `trayIconTemplate@2x.png`) so the OS can
 * render sharp light/dark menu-bar masks without runtime resizing.
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
  /** User-initiated update check. */
  onCheckForUpdates: () => void;
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
    { label: 'Check for Updates...', click: hooks.onCheckForUpdates },
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
  readonly platform: NodeJS.Platform;
}

/**
 * Pure ordered list of paths to probe for the tray icon. Packaged builds must
 * resolve from `process.resourcesPath` because `app.getAppPath()` points at
 * the asar-embedded code, which never contains `build/`. macOS uses dedicated
 * template-mask assets; other platforms keep the full-color brand PNG. Dev
 * builds keep their existing fallback chain so `npm run dev` works without a
 * prior `dist:*` run.
 */
export function buildTrayIconCandidates(ctx: TrayIconCandidateContext): string[] {
  if (ctx.platform === 'darwin') {
    if (ctx.isPackaged) {
      return [join(ctx.resourcesPath, 'build', 'trayIconTemplate.png')];
    }
    return [
      join(ctx.appPath, 'build', 'trayIconTemplate.png'),
      join(ctx.appPath, 'assets', 'hush.icon', 'Assets', 'trayIconTemplate.png'),
    ];
  }

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
    platform: process.platform,
  });
}

interface TrayImageLike<TSelf> {
  resize(options: { width: number; height: number }): TSelf;
  setTemplateImage(isTemplate: boolean): void;
}

/**
 * Applies platform-specific tray image treatment. macOS template images must
 * remain at their authored 16px/32px sizes so the menu bar can pick the @2x
 * sibling and recolor the alpha mask. Other platforms keep the existing
 * runtime resize path for the full-color brand icon.
 */
export function prepareTrayImageForPlatform<T extends TrayImageLike<T>>(
  image: T,
  platform: NodeJS.Platform,
): T {
  if (platform === 'darwin') {
    image.setTemplateImage(true);
    return image;
  }
  return image.resize({
    width: TRAY_ICON_SIZE,
    height: TRAY_ICON_SIZE,
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
  const trayImage = prepareTrayImageForPlatform(baseImage, process.platform);

  const tray = new Tray(trayImage);
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
