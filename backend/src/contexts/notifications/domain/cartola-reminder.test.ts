import { describe, expect, it } from "vitest";
import {
  buildCartolaReminderJobs,
  createCartolaUnsubscribeToken,
  roundStartIso,
  verifyCartolaUnsubscribeToken,
} from "./cartola-reminder.js";

describe("Cartola reminder domain", () => {
  it("computes ISO round start time in Brazil time zone", () => {
    const iso = roundStartIso("2026-11-01", "08:30");
    expect(iso).toBe("2026-11-01T11:30:00.000Z");
  });

  it("builds 24h and 2h reminder milestones for future rounds", () => {
    const roundDate = "2026-11-05";
    const startTime = "10:00";
    const nowMs = new Date("2026-11-01T12:00:00.000Z").getTime();

    const jobs = buildCartolaReminderJobs({
      roundId: "round-1",
      date: roundDate,
      startTime,
      nowMs,
    });

    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.milestone)).toEqual(["24h", "2h"]);
  });

  it("filters out past milestones", () => {
    const roundDate = "2026-11-05";
    const startTime = "10:00";
    // 3 horas antes do início da partida: o marco de 24h já passou, sobra apenas o de 2h
    const startMs = new Date("2026-11-05T13:00:00.000Z").getTime();
    const nowMs = startMs - 3 * 60 * 60 * 1000;

    const jobs = buildCartolaReminderJobs({
      roundId: "round-1",
      date: roundDate,
      startTime,
      nowMs,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.milestone).toBe("2h");
  });

  it("generates and verifies HMAC unsubscribe token securely", () => {
    const secret = "test-unsubscribe-secret";
    const token = createCartolaUnsubscribeToken("user-123", secret);

    expect(verifyCartolaUnsubscribeToken("user-123", token, secret)).toBe(true);
    expect(verifyCartolaUnsubscribeToken("user-456", token, secret)).toBe(false);
    expect(verifyCartolaUnsubscribeToken("user-123", "tampered-token", secret)).toBe(false);
    expect(verifyCartolaUnsubscribeToken("user-123", token, "")).toBe(false);
  });
});

