import { describe, expect, it, vi } from 'vitest';
import {
  buildManualUpdateFeedbackOptions,
  showManualUpdateFeedback,
} from '../src/main/update/manualUpdateFeedback';
import type { DesktopUpdateState } from '../src/shared/desktop-update';

function state(overrides: Partial<DesktopUpdateState>): DesktopUpdateState {
  return {
    phase: 'idle',
    currentVersion: '0.1.3-mvp',
    targetVersion: null,
    progress: null,
    error: null,
    ...overrides,
  };
}

describe('buildManualUpdateFeedbackOptions', () => {
  it('NoUpdate_ReturnsLatestVersionDialog', () => {
    const options = buildManualUpdateFeedbackOptions(
      state({ phase: 'skipped', error: 'no-update' }),
      'Hush',
    );

    expect(options).toMatchObject({
      type: 'info',
      title: 'Hush',
      message: "You're using the latest version of Hush.",
      detail: 'Current version: 0.1.3-mvp',
      buttons: ['OK'],
    });
  });

  it('NetworkFailure_ReturnsWarningDialog', () => {
    const options = buildManualUpdateFeedbackOptions(
      state({ phase: 'skipped', error: 'timeout' }),
      'Hush',
    );

    expect(options).toMatchObject({
      type: 'warning',
      message: 'Could not check for updates.',
    });
  });

  it('UpdateFound_ReturnsNullBecauseTheUpdateGateOwnsFeedback', () => {
    expect(
      buildManualUpdateFeedbackOptions(
        state({ phase: 'downloading', targetVersion: '0.1.4-mvp' }),
        'Hush',
      ),
    ).toBeNull();
  });
});

describe('showManualUpdateFeedback', () => {
  it('UsesAttachedWindowWhenAvailable', async () => {
    const showMessageBox = vi.fn().mockResolvedValue({});
    const window = { isDestroyed: () => false };

    await showManualUpdateFeedback(
      state({ phase: 'skipped', error: 'no-update' }),
      {
        appName: 'Hush',
        window: window as never,
        dialogApi: { showMessageBox } as never,
      },
    );

    expect(showMessageBox).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ message: "You're using the latest version of Hush." }),
    );
  });
});
