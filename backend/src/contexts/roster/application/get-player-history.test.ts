import { describe, expect, it, vi } from "vitest";
import {
  getPlayerAwardSeasons, getPlayerRoundHistory, type PlayerHistoryRepository,
} from "./get-player-history.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const repository = (): PlayerHistoryRepository => ({
  listRoundHistory: vi.fn().mockResolvedValue([]),
  readAwardHistory: vi.fn().mockResolvedValue({ rounds: [], stats: [] }),
});

describe("get player history", () => {
  it("scopes round history and seasonal awards to the selected league", async () => {
    const target = repository();
    await expect(getPlayerRoundHistory(leagueId, playerId, "official", actor, target)).resolves.toEqual([]);
    await expect(getPlayerAwardSeasons(leagueId, playerId, actor, target)).resolves.toEqual([]);
    expect(target.listRoundHistory).toHaveBeenCalledWith(leagueId, playerId, "official", actor);
    expect(target.readAwardHistory).toHaveBeenCalledWith(leagueId, actor);
  });

  it("rejects invalid round types before persistence", async () => {
    const target = repository();
    await expect(getPlayerRoundHistory(leagueId, playerId, "training", actor, target))
      .rejects.toThrow("Tipo de rodada inválido");
    expect(target.listRoundHistory).not.toHaveBeenCalled();
  });
});
