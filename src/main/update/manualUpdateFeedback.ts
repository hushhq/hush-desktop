import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron';
import type { DesktopUpdateState } from '../../shared/desktop-update';

export interface ManualUpdateFeedbackDialog {
  showMessageBox(
    browserWindow: BrowserWindow,
    options: MessageBoxOptions,
  ): Promise<unknown>;
  showMessageBox(options: MessageBoxOptions): Promise<unknown>;
}

export interface ManualUpdateFeedbackOptions {
  readonly appName: string;
  readonly window: BrowserWindow | null;
  readonly dialogApi?: ManualUpdateFeedbackDialog;
}

export function buildManualUpdateFeedbackOptions(
  state: DesktopUpdateState,
  appName: string,
): MessageBoxOptions | null {
  if (state.phase === 'skipped' && state.error === 'no-update') {
    return {
      type: 'info',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      title: appName,
      message: `You're using the latest version of ${appName}.`,
      detail: `Current version: ${state.currentVersion}`,
      noLink: true,
    };
  }

  if (state.phase === 'skipped' || state.phase === 'error') {
    return {
      type: 'warning',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      title: appName,
      message: 'Could not check for updates.',
      detail: 'Check your connection and try again.',
      noLink: true,
    };
  }

  return null;
}

export async function showManualUpdateFeedback(
  state: DesktopUpdateState,
  opts: ManualUpdateFeedbackOptions,
): Promise<void> {
  const dialogOptions = buildManualUpdateFeedbackOptions(state, opts.appName);
  if (!dialogOptions) return;

  const dialogApi = opts.dialogApi ?? dialog;
  if (opts.window && !opts.window.isDestroyed()) {
    await dialogApi.showMessageBox(opts.window, dialogOptions);
    return;
  }
  await dialogApi.showMessageBox(dialogOptions);
}
