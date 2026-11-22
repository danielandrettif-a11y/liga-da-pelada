import { afterEach, describe, expect, it, vi } from "vitest";
import { qstashMatchTimerScheduler } from "./qstash-match-timer-scheduler.js";

describe("qstashMatchTimerScheduler", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("schedules all three timer thresholds with the protected webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: vi.fn() });
    vi.stubGlobal("fetch", fetchMock);
    const scheduler = qstashMatchTimerScheduler({
      appPublicUrl: "https://app.example.com/",
      qstashUrl: "https://qstash.example.com/",
      token: "token",
      webhookSecret: "secret",
    });

    await scheduler.schedule({
      matchId: "match-1", durationSeconds: 420, accumulatedSeconds: 0,
      startedAt: new Date().toISOString(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://qstash.example.com/v2/publish/https://app.example.com/api/internal/match-timer-alert",
      expect.objectContaining({ headers: expect.objectContaining({ "Upstash-Forward-Authorization": "Bearer secret" }) }),
    );
  });

  it("fails before changing timer state when configuration is missing", async () => {
    const scheduler = qstashMatchTimerScheduler({ appPublicUrl: "https://app.example.com" });
    await expect(scheduler.schedule({
      matchId: "match-1", durationSeconds: 420, accumulatedSeconds: 0,
      startedAt: new Date().toISOString(),
    })).rejects.toThrow("não está configurado");
  });
});
