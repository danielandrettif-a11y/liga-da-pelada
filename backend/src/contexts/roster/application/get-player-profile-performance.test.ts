import { describe, expect, it, vi } from "vitest";
import {
  getPlayerGoalsByClub,
  getPlayerPlaytime,
  type PlayerProfilePerformanceRepository,
} from "./get-player-profile-performance.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

function repository(): PlayerProfilePerformanceRepository {
  return {
    listParticipations: vi.fn().mockResolvedValue([]),
    listGoalEvents: vi.fn().mockResolvedValue([]),
  };
}

describe("get player profile performance", () => {
  it("scopes playtime to normalized league and player identifiers", async () => {
    const target = repository();
    await expect(getPlayerPlaytime(leagueId, playerId, actor, target)).resolves
      .toEqual({ totalSeconds: 0, officialSeconds: 0, friendlySeconds: 0 });
    expect(target.listParticipations).toHaveBeenCalledWith(leagueId, playerId, actor);
  });

  it("scopes club goals to the same player profile", async () => {
    const target = repository();
    await expect(getPlayerGoalsByClub(leagueId, playerId, actor, target)).resolves.toEqual([]);
    expect(target.listGoalEvents).toHaveBeenCalledWith(leagueId, playerId, actor);
  });
});
