import { describe, expect, it } from "vitest";
import { normalizeSeenThrough, unreadPlayersFromEvents } from "./roster-activity.js";

describe("roster activity domain", () => {
  it("deduplicates players while preserving the last event cursor", () => {
    expect(unreadPlayersFromEvents([
      { playerId: "player-a", createdAt: "2026-10-20T10:00:00.000Z" },
      { playerId: "player-a", createdAt: "2026-10-20T10:01:00.000Z" },
      { playerId: "player-b", createdAt: "2026-10-20T10:02:00.000Z" },
    ])).toEqual({
      playerIds: ["player-a", "player-b"], seenThrough: "2026-10-20T10:02:00.000Z",
    });
  });

  it("clamps future read cursors and rejects invalid dates", () => {
    const now = new Date("2026-10-20T12:00:00.000Z");
    expect(normalizeSeenThrough("2026-10-21T12:00:00.000Z", now)).toBe(now.toISOString());
    expect(() => normalizeSeenThrough("not-a-date", now)).toThrow("Data de leitura inválida");
  });
});
