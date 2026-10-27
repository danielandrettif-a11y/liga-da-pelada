import { describe, expect, it, vi } from "vitest";
import {
  getMonthlyAwardWinners, getPlayerAchievementBelts, getPlayerMonthlyAwards,
  type PlayerAwardsRepository,
} from "./get-player-awards.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const repository = (): PlayerAwardsRepository => ({
  listMonthlyAwards: vi.fn().mockResolvedValue([]), listAchievementBelts: vi.fn().mockResolvedValue([]),
  listMonthlyAwardWinners: vi.fn().mockResolvedValue([]),
});

describe("get player awards", () => {
  it("scopes each player projection to the selected league", async () => {
    const target = repository();
    await expect(getPlayerMonthlyAwards(leagueId, playerId, actor, target)).resolves.toEqual([]);
    await expect(getPlayerAchievementBelts(leagueId, playerId, actor, target)).resolves.toEqual([]);
    expect(target.listMonthlyAwards).toHaveBeenCalledWith(leagueId, playerId, actor);
    expect(target.listAchievementBelts).toHaveBeenCalledWith(leagueId, playerId, actor);
  });

  it("validates the winner month before persistence", async () => {
    const target = repository();
    await expect(getMonthlyAwardWinners(leagueId, "2026-09-01", actor, target)).resolves.toEqual([]);
    await expect(getMonthlyAwardWinners(leagueId, "2026-09-02", actor, target)).rejects.toThrow("Período mensal inválido");
    expect(target.listMonthlyAwardWinners).toHaveBeenCalledTimes(1);
  });
});
