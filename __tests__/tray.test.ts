import { describe, it, expect, vi } from 'vitest';
import { buildTrayMenuTemplate, prepareTrayImageForPlatform } from '../src/main/tray';

describe('buildTrayMenuTemplate', () => {
  it('lists Show Hush, a separator, and Quit Hush in that order', () => {
    const template = buildTrayMenuTemplate({
      onShow: () => {},
      onCheckForUpdates: () => {},
      onQuit: () => {},
    });

    expect(template).toHaveLength(4);
    expect(template[0]).toMatchObject({ label: 'Show Hush' });
    expect(template[1]).toMatchObject({ label: 'Check for Updates...' });
    expect(template[2]).toMatchObject({ type: 'separator' });
    expect(template[3]).toMatchObject({ label: 'Quit Hush' });
  });

  it('wires the Show Hush click directly to the onShow hook', () => {
    const onShow = vi.fn();
    const onCheckForUpdates = vi.fn();
    const onQuit = vi.fn();
    const template = buildTrayMenuTemplate({ onShow, onCheckForUpdates, onQuit });
    template[0].click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(onShow).toHaveBeenCalledOnce();
    expect(onCheckForUpdates).not.toHaveBeenCalled();
    expect(onQuit).not.toHaveBeenCalled();
  });

  it('wires the Check for Updates click directly to the update hook', () => {
    const onShow = vi.fn();
    const onCheckForUpdates = vi.fn();
    const onQuit = vi.fn();
    const template = buildTrayMenuTemplate({ onShow, onCheckForUpdates, onQuit });
    template[1].click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
    expect(onShow).not.toHaveBeenCalled();
    expect(onQuit).not.toHaveBeenCalled();
  });

  it('wires the Quit Hush click directly to the onQuit hook', () => {
    const onShow = vi.fn();
    const onCheckForUpdates = vi.fn();
    const onQuit = vi.fn();
    const template = buildTrayMenuTemplate({ onShow, onCheckForUpdates, onQuit });
    template[3].click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(onQuit).toHaveBeenCalledOnce();
    expect(onShow).not.toHaveBeenCalled();
  });
});

describe('prepareTrayImageForPlatform', () => {
  it('MacOS_UsesTemplateImageWithoutRuntimeResize', () => {
    const image = {
      resize: vi.fn(() => image),
      setTemplateImage: vi.fn(),
    };

    const result = prepareTrayImageForPlatform(image, 'darwin');

    expect(result).toBe(image);
    expect(image.setTemplateImage).toHaveBeenCalledWith(true);
    expect(image.resize).not.toHaveBeenCalled();
  });

  it('NonMac_ResizesFullColorTrayIcon', () => {
    const resized = {
      resize: vi.fn(() => resized),
      setTemplateImage: vi.fn(),
    };
    const image = {
      resize: vi.fn(() => resized),
      setTemplateImage: vi.fn(),
    };

    const result = prepareTrayImageForPlatform(image, 'linux');

    expect(result).toBe(resized);
    expect(image.resize).toHaveBeenCalledWith({ width: 18, height: 18 });
    expect(image.setTemplateImage).not.toHaveBeenCalled();
  });
});
