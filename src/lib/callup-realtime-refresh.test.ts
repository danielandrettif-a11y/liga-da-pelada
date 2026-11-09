import { afterEach, describe, expect, it, vi } from "vitest";
import { createCallupRealtimeRefresh } from "./callup-realtime-refresh";

afterEach(() => vi.useRealTimers());

describe("atualização da convocação em tempo real", () => {
  it("agrupa eventos, limita recargas e cancela ao sair", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = createCallupRealtimeRefresh({
      refresh, isVisible: () => true, now: Date.now,
      schedule: setTimeout, cancel: clearTimeout, delayMs: 500, minimumIntervalMs: 5000,
    });
    scheduler.request();
    scheduler.request();
    vi.advanceTimersByTime(500);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.request();
    scheduler.request();
    vi.advanceTimersByTime(4999);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    scheduler.request();
    scheduler.dispose();
    vi.advanceTimersByTime(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("não atualiza uma página oculta", () => {
    vi.useFakeTimers();
    let visible = true;
    const refresh = vi.fn();
    const scheduler = createCallupRealtimeRefresh({
      refresh, isVisible: () => visible, now: Date.now,
      schedule: setTimeout, cancel: clearTimeout, delayMs: 500, minimumIntervalMs: 5000,
    });
    scheduler.request();
    visible = false;
    vi.advanceTimersByTime(500);
    expect(refresh).not.toHaveBeenCalled();
    visible = true;
    scheduler.request();
    vi.advanceTimersByTime(500);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
