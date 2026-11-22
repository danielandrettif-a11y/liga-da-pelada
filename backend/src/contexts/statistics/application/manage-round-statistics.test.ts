import { describe, expect, it, vi } from "vitest";
import { ManageRoundStatisticsUseCase, RoundStatisticsValidationError, type RoundStatisticsRepository } from "./manage-round-statistics.js";

const actor = { userId: "11111111-1111-4111-8111-111111111111" };
const leagueId = "22222222-2222-4222-8222-222222222222";
const roundId = "33333333-3333-4333-8333-333333333333";

function repository(): RoundStatisticsRepository {
  return {
    recalculateRoundStats: vi.fn(async () => undefined),
    findRoundStatistics: vi.fn(async () => null),
    findFriendlyStats: vi.fn(async () => []),
  };
}

describe("ManageRoundStatisticsUseCase", () => {
  it("delegates the transactional recalculation with authenticated scope", async () => {
    const repo = repository();
    await expect(new ManageRoundStatisticsUseCase(repo).calculateRoundStats(actor, leagueId, roundId))
      .resolves.toEqual({ success: true });
    expect(repo.recalculateRoundStats).toHaveBeenCalledWith(actor, leagueId, roundId);
  });

  it("rejects malformed league and round identifiers before persistence", async () => {
    const repo = repository();
    await expect(new ManageRoundStatisticsUseCase(repo).calculateRoundStats(actor, "bad", roundId))
      .rejects.toBeInstanceOf(RoundStatisticsValidationError);
    expect(repo.recalculateRoundStats).not.toHaveBeenCalled();
  });
});
