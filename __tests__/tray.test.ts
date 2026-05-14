import { describe, it, expect, vi } from 'vitest';
import { buildTrayMenuTemplate } from '../src/main/tray';

describe('buildTrayMenuTemplate', () => {
  it('lists Show Hush, a separator, and Quit Hush in that order', () => {
    const template = buildTrayMenuTemplate({
      onShow: () => {},
      onQuit: () => {},
    });

    expect(template).toHaveLength(3);
    expect(template[0]).toMatchObject({ label: 'Show Hush' });
    expect(template[1]).toMatchObject({ type: 'separator' });
    expect(template[2]).toMatchObject({ label: 'Quit Hush' });
  });

  it('wires the Show Hush click directly to the onShow hook', () => {
    const onShow = vi.fn();
    const onQuit = vi.fn();
    const template = buildTrayMenuTemplate({ onShow, onQuit });
    template[0].click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(onShow).toHaveBeenCalledOnce();
    expect(onQuit).not.toHaveBeenCalled();
  });

  it('wires the Quit Hush click directly to the onQuit hook', () => {
    const onShow = vi.fn();
    const onQuit = vi.fn();
    const template = buildTrayMenuTemplate({ onShow, onQuit });
    template[2].click?.(
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(onQuit).toHaveBeenCalledOnce();
    expect(onShow).not.toHaveBeenCalled();
  });
});
