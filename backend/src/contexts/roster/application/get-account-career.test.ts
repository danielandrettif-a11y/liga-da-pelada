import { describe, expect, it, vi } from "vitest";
import { getAccountCareer, type AccountCareerRepository } from "./get-account-career.js";

describe("getAccountCareer", () => {
  it("loads the verified account projection and builds its totals", async () => {
    const repository: AccountCareerRepository = {
      listForAccount: vi.fn().mockResolvedValue([{
        league_id: "league-1", league_name: "Pelada BQ", round_type: "official",
        rounds_count: 2, games: 3, goals: 4, assists: 1, wins: 2, draws: 0, losses: 1,
        points: 6, goalkeeper_games: 0, goals_conceded: 0, clean_sheets: 0, play_seconds: 900,
      }]),
    };
    const actor = { userId: "verified-user" };
    await expect(getAccountCareer(actor, repository)).resolves.toMatchObject({
      overall: { goals: 4, play_seconds: 900 }, official: { games: 3 }, friendly: { games: 0 },
    });
    expect(repository.listForAccount).toHaveBeenCalledWith(actor);
  });
});
