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
