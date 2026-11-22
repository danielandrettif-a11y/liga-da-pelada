import { describe, expect, it, vi } from "vitest";
import {
  getRosterUnreadState,
  getUnreadRosterPlayers,
  markRosterActivitySeen,
  markRosterActivitySeenThrough,
  type RosterActivityRepository,
} from "./manage-roster-activity.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const actor = { userId: "verified-user" };

function repository(): RosterActivityRepository {
  return {
    getUnreadState: vi.fn().mockResolvedValue({ count: 2, lastSeenAt: "2026-10-20T10:00:00.000Z" }),
    listUnreadEvents: vi.fn().mockResolvedValue([
      { playerId: "player-a", createdAt: "2026-10-20T10:01:00.000Z" },
      { playerId: "player-a", createdAt: "2026-10-20T10:02:00.000Z" },
    ]),
    markSeenThrough: vi.fn().mockResolvedValue(undefined),
    markSeen: vi.fn().mockResolvedValue(undefined),
  };
}

describe("manage roster activity", () => {
  it("returns league-scoped unread projections", async () => {
    const target = repository();
    await expect(getRosterUnreadState(leagueId, actor, target)).resolves.toMatchObject({ count: 2 });
    await expect(getUnreadRosterPlayers(leagueId, actor, target)).resolves.toEqual({
      playerIds: ["player-a"], seenThrough: "2026-10-20T10:02:00.000Z",
    });
    expect(target.getUnreadState).toHaveBeenCalledWith(leagueId, actor);
  });

  it("normalizes read cursors before persistence", async () => {
    const target = repository();
    await markRosterActivitySeenThrough(
      leagueId, "2026-10-21T12:00:00.000Z", actor, target, new Date("2026-10-20T12:00:00.000Z"),
    );
    expect(target.markSeenThrough).toHaveBeenCalledWith(
      leagueId, "2026-10-20T12:00:00.000Z", actor,
    );
    await markRosterActivitySeen(leagueId, actor, target);
    expect(target.markSeen).toHaveBeenCalledWith(leagueId, actor);
  });
});
