import { describe, expect, it, vi } from 'vitest';
import { buildAppMenuTemplate } from '../src/main/appMenu';

describe('buildAppMenuTemplate', () => {
  it('MacOS_PutsCheckForUpdatesInApplicationMenuAfterAbout', () => {
    const onCheckForUpdates = vi.fn();
    const template = buildAppMenuTemplate(
      { onCheckForUpdates },
      { appName: 'Hush', platform: 'darwin' },
    );

    expect(template[0]?.label).toBe('Hush');
    const submenu = template[0]?.submenu;
    expect(Array.isArray(submenu)).toBe(true);
    if (!Array.isArray(submenu)) throw new Error('expected submenu array');
    expect(submenu[0]).toMatchObject({ role: 'about' });
    expect(submenu[1]).toMatchObject({ label: 'Check for Updates...' });
    submenu[1].click?.(undefined as never, undefined as never, undefined as never);
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
  });

  it('WindowsLinux_PutsCheckForUpdatesInHelpMenu', () => {
    const onCheckForUpdates = vi.fn();
    const template = buildAppMenuTemplate(
      { onCheckForUpdates },
      { appName: 'Hush', platform: 'win32' },
    );

    const help = template.find((item) => item.label === 'Help');
    expect(help).toBeTruthy();
    const submenu = help?.submenu;
    expect(Array.isArray(submenu)).toBe(true);
    if (!Array.isArray(submenu)) throw new Error('expected submenu array');
    expect(submenu[0]).toMatchObject({ label: 'Check for Updates...' });
    submenu[0].click?.(undefined as never, undefined as never, undefined as never);
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
  });
});
