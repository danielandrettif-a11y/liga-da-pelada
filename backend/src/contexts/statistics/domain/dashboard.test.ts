import { describe, expect, it } from "vitest";
import { buildDashboardData } from "./dashboard";

describe("Statistics Domain: buildDashboardData", () => {
  it("builds empty dashboard data when given defaults", () => {
    const data = buildDashboardData({});
    expect(data.matchDuration).toBe(7);
    expect(data.eventDurationMinutes).toBe(120);
    expect(data.preseasonEnabled).toBe(false);
    expect(data.nextRound).toBeNull();
    expect(data.nextFriendly).toBeNull();
    expect(data.liveMatch).toBeNull();
    expect(data.activeCallup).toBeNull();
    expect(data.activeCallups).toEqual([]);
    expect(data.venue).toEqual({ name: null, mapUrl: null });
  });

  it("maps next round, friendly and active callups correctly", () => {
    const data = buildDashboardData({
      league: {
        matchDuration: 10,
        eventDurationMinutes: 90,
        preseasonEnabled: true,
        stadiumName: "Arena Central",
        stadiumMapUrl: "https://maps.google.com/test",
      },
      nextRound: {
        id: "round-1",
        number: 1,
        date: "2026-11-01",
        status: "active",
        round_players: [{ count: 14 }],
      },
      nextFriendly: {
        id: "round-2",
        number: 2,
        date: "2026-11-02",
        status: "draft",
        confirmedPlayers: 12,
      },
      activeCallups: [
        {
          id: "callup-1",
          date: "2026-11-01",
          start_time: "09:00",
          capacity: 16,
          waitlist_capacity: 4,
          entries: [
            { playerId: "p1", status: "confirmed", position: "ATA" },
            { playerId: "p2", status: "confirmed", position: "DEF" },
            { playerId: "p3", status: "waitlist", position: "MEI" },
          ],
        },
      ],
      liveMatch: {
        id: "match-1",
        score_a: 2,
        score_b: 1,
        status: "live",
        round: { id: "round-1", number: 1, season_id: "season-1" },
        team_a: { id: "team-a", name: "Amarelo" },
        team_b: { id: "team-b", name: "Azul" },
      },
    });

    expect(data.matchDuration).toBe(10);
    expect(data.eventDurationMinutes).toBe(90);
    expect(data.preseasonEnabled).toBe(true);
    expect(data.venue.name).toBe("Arena Central");
    expect(data.nextRound?.confirmedPlayers).toBe(14);
    expect(data.nextFriendly?.confirmedPlayers).toBe(12);
    expect(data.liveMatch?.scoreA).toBe(2);
    expect(data.liveMatch?.scoreB).toBe(1);
    expect(data.activeCallups).toHaveLength(1);
    expect(data.activeCallups[0].confirmed).toBe(2);
    expect(data.activeCallups[0].waiting).toBe(1);
    expect(data.activeCallup?.id).toBe("callup-1");
  });
});
