import {
  buildIdleDesktopUpdateState,
  type DesktopUpdateState,
} from '../../shared/desktop-update';
import type { DesktopUpdaterController } from './desktopUpdater';

/**
 * Single-slot registry for the active {@link DesktopUpdaterController}.
 *
 * Why a registry rather than a parameter:
 *   - `registerIpcHandlers()` runs before any window exists, so the IPC
 *     handler cannot capture the controller at registration time.
 *   - We still want exactly one controller per main-process boot.
 *
 * Tests can swap controllers in/out via {@link setActiveDesktopUpdater}.
 */
let activeController: DesktopUpdaterController | null = null;

export function setActiveDesktopUpdater(controller: DesktopUpdaterController | null): void {
  activeController = controller;
}

export function getActiveDesktopUpdater(): DesktopUpdaterController | null {
  return activeController;
}

/**
 * Snapshot used by the renderer's `getDesktopUpdateState` IPC call when no
 * controller has been wired yet (e.g. dev mode, or the timeout fired before
 * the renderer subscribed). The default `currentVersion` mirrors the value
 * shipped in `package.json`; callers in production paths must override it.
 */
export function getDesktopUpdateStateSnapshot(currentVersion: string): DesktopUpdateState {
  const controller = getActiveDesktopUpdater();
  if (controller) return controller.getState();
  return buildIdleDesktopUpdateState(currentVersion);
}

/**
 * User-initiated update check entry point shared by IPC, native menus, and the
 * tray menu. Dev builds or older boot paths without an active controller fail
 * open to the current idle snapshot.
 */
export function requestDesktopUpdateCheck(currentVersion: string): Promise<DesktopUpdateState> {
  const controller = getActiveDesktopUpdater();
  if (!controller) return Promise.resolve(buildIdleDesktopUpdateState(currentVersion));
  return controller.requestManualCheck();
}

/**
 * User-confirmed install entry point for a downloaded background/manual update.
 */
export function installDesktopUpdate(currentVersion: string): DesktopUpdateState {
  const controller = getActiveDesktopUpdater();
  if (!controller) return buildIdleDesktopUpdateState(currentVersion);
  return controller.installDownloadedUpdate();
}
