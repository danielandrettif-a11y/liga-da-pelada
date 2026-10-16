import { describe, expect, it } from "vitest";
import { buildCartolaReminderJobs, roundStartIso } from "./cartola-reminder-scheduler";

describe("roundStartIso", () => {
  it("converte o horário da pelada em São Paulo para UTC", () => {
    expect(roundStartIso("2026-08-29", "20:30")).toBe("2026-08-29T23:30:00.000Z");
  });

  it("aceita horário do banco com segundos", () => {
    expect(roundStartIso("2026-08-29", "08:00:00")).toBe("2026-08-29T11:00:00.000Z");
  });
});

describe("buildCartolaReminderJobs", () => {
  it("agenda somente os avisos de 24 horas e 2 horas", () => {
    const jobs = buildCartolaReminderJobs({
      roundId: "round-1",
      date: "2026-08-29",
      startTime: "20:30",
      nowMs: new Date("2026-08-27T00:00:00.000Z").getTime(),
    });

    expect(jobs.map((job) => job.milestone)).toEqual(["24h", "2h"]);
    expect(jobs.map((job) => job.targetAt)).toEqual([
      "2026-08-28T23:30:00.000Z",
      "2026-08-29T21:30:00.000Z",
    ]);
  });

  it("descarta apenas o marco que já passou", () => {
    const jobs = buildCartolaReminderJobs({
      roundId: "round-1",
      date: "2026-08-29",
      startTime: "20:30",
      nowMs: new Date("2026-08-29T00:00:00.000Z").getTime(),
    });

    expect(jobs.map((job) => job.milestone)).toEqual(["2h"]);
  });
});
