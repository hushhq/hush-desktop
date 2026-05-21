import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_REVEAL_FALLBACK_MS,
  WindowRevealGate,
  type RevealableWindow,
} from '../src/main/window-reveal-gate';

interface FakeTimer {
  id: number;
  handler: () => void;
  ms: number;
  cleared: boolean;
}

function buildScheduler() {
  let nextId = 1;
  const timers = new Map<number, FakeTimer>();
  const setTimeoutImpl = (handler: () => void, ms: number) => {
    const id = nextId++;
    timers.set(id, { id, handler, ms, cleared: false });
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  const clearTimeoutImpl = (id: ReturnType<typeof setTimeout>) => {
    const timer = timers.get(id as unknown as number);
    if (!timer) return;
    timer.cleared = true;
    timers.delete(id as unknown as number);
  };
  return {
    setTimeoutImpl,
    clearTimeoutImpl,
    runOnly(id: ReturnType<typeof setTimeout>) {
      const timer = timers.get(id as unknown as number);
      if (!timer) throw new Error(`fake timer ${String(id)} not armed`);
      timers.delete(id as unknown as number);
      timer.handler();
    },
    runAll() {
      // copy to avoid mutating while iterating
      for (const timer of Array.from(timers.values())) {
        timers.delete(timer.id);
        timer.handler();
      }
    },
    get armed(): number {
      return timers.size;
    },
    firstTimer(): FakeTimer | undefined {
      return Array.from(timers.values())[0];
    },
  };
}

function buildWindow(): RevealableWindow & {
  showCalls: number;
  opacityCalls: number[];
  destroyed: boolean;
} {
  return {
    showCalls: 0,
    opacityCalls: [],
    destroyed: false,
    show() {
      this.showCalls += 1;
    },
    setOpacity(opacity: number) {
      this.opacityCalls.push(opacity);
    },
    isDestroyed() {
      return this.destroyed;
    },
  };
}

describe('WindowRevealGate', () => {
  it('reveals only after both Electron and renderer are ready', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    gate.notifyElectronReady();
    expect(win.showCalls).toBe(0);
    expect(scheduler.armed).toBe(1);

    gate.notifyRendererReady();
    expect(win.showCalls).toBe(1);
    expect(win.opacityCalls).toEqual([0]);
    expect(scheduler.armed).toBe(1);
  });

  it('warms up native material invisibly before restoring opacity', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const onRevealed = vi.fn();
    const gate = new WindowRevealGate(win, {
      materialWarmupMs: 80,
      onRevealed,
      ...scheduler,
    });

    gate.notifyRendererReady();
    gate.notifyElectronReady();

    expect(win.showCalls).toBe(1);
    expect(win.opacityCalls).toEqual([0]);
    expect(scheduler.firstTimer()?.ms).toBe(80);
    expect(onRevealed).not.toHaveBeenCalled();

    scheduler.runAll();

    expect(win.opacityCalls).toEqual([0, 1]);
    expect(onRevealed).toHaveBeenCalledTimes(1);
  });

  it('does not restore opacity after the window is destroyed during material warmup', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    gate.notifyRendererReady();
    gate.notifyElectronReady();
    win.destroyed = true;
    gate.notifyWindowDestroyed();
    scheduler.runAll();

    expect(win.opacityCalls).toEqual([0]);
  });

  it('fires revealed immediately when opacity control is unavailable', () => {
    const scheduler = buildScheduler();
    const onRevealed = vi.fn();
    const win: RevealableWindow & { showCalls: number; destroyed: boolean } = {
      showCalls: 0,
      destroyed: false,
      show() {
        this.showCalls += 1;
      },
      isDestroyed() {
        return this.destroyed;
      },
    };
    const gate = new WindowRevealGate(win, { onRevealed, ...scheduler });

    gate.notifyRendererReady();
    gate.notifyElectronReady();

    expect(win.showCalls).toBe(1);
    expect(onRevealed).toHaveBeenCalledTimes(1);
    expect(scheduler.armed).toBe(0);
  });

  it('reveals when the renderer-ready signal arrives before Electron', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    gate.notifyRendererReady();
    expect(win.showCalls).toBe(0);

    gate.notifyElectronReady();
    expect(win.showCalls).toBe(1);
    // No fallback is armed when both conditions are already met; the
    // remaining timer is only the material warmup opacity restore.
    expect(scheduler.armed).toBe(1);
  });

  it('falls back to revealing the window if renderer-ready never arrives', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    gate.notifyElectronReady();
    const timer = scheduler.firstTimer();
    expect(timer?.ms).toBe(DEFAULT_REVEAL_FALLBACK_MS);
    scheduler.runAll();

    expect(win.showCalls).toBe(1);
    expect(scheduler.armed).toBe(1);
  });

  it('honours a custom fallback timeout', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, {
      fallbackTimeoutMs: 250,
      ...scheduler,
    });

    gate.notifyElectronReady();
    expect(scheduler.firstTimer()?.ms).toBe(250);
  });

  it('shows at most once even when both signals fire repeatedly', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    gate.notifyElectronReady();
    gate.notifyRendererReady();
    gate.notifyRendererReady();
    gate.notifyElectronReady();

    expect(win.showCalls).toBe(1);
  });

  it('cancels the fallback when renderer-ready arrives before the timer fires', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    gate.notifyElectronReady();
    expect(scheduler.armed).toBe(1);
    gate.notifyRendererReady();
    expect(scheduler.armed).toBe(1);
    expect(win.showCalls).toBe(1);
  });

  it('ignores renderer-ready and never calls show after the window is destroyed', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    win.destroyed = true;
    gate.notifyWindowDestroyed();
    gate.notifyElectronReady();
    gate.notifyRendererReady();

    expect(win.showCalls).toBe(0);
    expect(scheduler.armed).toBe(0);
  });

  it('drops the fallback timer when the window is destroyed before it fires', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    gate.notifyElectronReady();
    expect(scheduler.armed).toBe(1);
    gate.notifyWindowDestroyed();
    expect(scheduler.armed).toBe(0);
  });

  it('still respects window.isDestroyed at reveal time', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    gate.notifyElectronReady();
    win.destroyed = true; // closed between ready-to-show and renderer-ready
    gate.notifyRendererReady();
    expect(win.showCalls).toBe(0);
  });

  it('reports state via the public getter for diagnostics', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    expect(gate.state).toEqual({
      electronReady: false,
      rendererReady: false,
      revealed: false,
    });

    gate.notifyElectronReady();
    expect(gate.state).toMatchObject({ electronReady: true, revealed: false });

    gate.notifyRendererReady();
    expect(gate.state).toMatchObject({ rendererReady: true, revealed: true });
  });

  it('show() is never invoked while waiting for the renderer signal', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);

    // Simulate ready-to-show without renderer signal yet.
    gate.notifyElectronReady();
    expect(win.showCalls).toBe(0);

    // Even another bogus electron-ready does not show.
    gate.notifyElectronReady();
    expect(win.showCalls).toBe(0);
  });

  it('ignores late renderer-ready after a fallback reveal', () => {
    const scheduler = buildScheduler();
    const win = buildWindow();
    const gate = new WindowRevealGate(win, scheduler);
    gate.notifyElectronReady();
    scheduler.runAll();
    expect(win.showCalls).toBe(1);

    gate.notifyRendererReady();
    expect(win.showCalls).toBe(1);
  });

  it('uses Node setTimeout/clearTimeout by default', () => {
    const realSetTimeout = vi.spyOn(globalThis, 'setTimeout');
    const win = buildWindow();
    const gate = new WindowRevealGate(win);
    gate.notifyElectronReady();
    expect(realSetTimeout).toHaveBeenCalledWith(expect.any(Function), DEFAULT_REVEAL_FALLBACK_MS);
    gate.notifyRendererReady();
    realSetTimeout.mockRestore();
  });
});
