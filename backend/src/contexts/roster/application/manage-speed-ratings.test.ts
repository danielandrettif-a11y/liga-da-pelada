import { describe, expect, it, vi } from "vitest";
import {
  drawLeagueTeamsBySpeed,
  getPlayerSpeedRatings,
  setPlayerSpeedRating,
  type SpeedRatingRepository,
} from "./manage-speed-ratings.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const actor = { userId: "verified-user" };

function repository(): SpeedRatingRepository {
  return {
    listRatings: vi.fn().mockResolvedValue({ [first]: 3 }),
    listEligiblePlayers: vi.fn().mockResolvedValue([
      { id: first, speedRating: 3 }, { id: second, speedRating: 1 },
    ]),
    setRating: vi.fn().mockResolvedValue(undefined),
  };
}

describe("manage speed ratings", () => {
  it("scopes reads and writes to normalized league and player identifiers", async () => {
    const target = repository();
    await expect(getPlayerSpeedRatings(leagueId.toUpperCase(), actor, target)).resolves.toEqual({ [first]: 3 });
    await setPlayerSpeedRating(leagueId, first, 2, actor, target);
    expect(target.listRatings).toHaveBeenCalledWith(leagueId, actor);
    expect(target.setRating).toHaveBeenCalledWith(leagueId, first, 2, actor);
  });

  it("draws only eligible players returned by persistence", async () => {
    const target = repository();
    const result = await drawLeagueTeamsBySpeed(
      leagueId, { playerIds: [first, second], teamCount: 2, playersPerTeam: 1 }, actor, target,
    );
    expect(result.teams.flat().sort()).toEqual([first, second]);
    vi.mocked(target.listEligiblePlayers).mockResolvedValueOnce([{ id: first, speedRating: 3 }]);
    await expect(drawLeagueTeamsBySpeed(
      leagueId, { playerIds: [first, second], teamCount: 2, playersPerTeam: 1 }, actor, target,
    )).rejects.toThrow("não está elegível nesta liga");
  });

  it("rejects invalid configurations before persistence", async () => {
    const target = repository();
    await expect(drawLeagueTeamsBySpeed(
      leagueId, { playerIds: [first], teamCount: 5, playersPerTeam: 1 }, actor, target,
    )).rejects.toThrow("Configuração de times inválida");
    expect(target.listEligiblePlayers).not.toHaveBeenCalled();
  });
});
