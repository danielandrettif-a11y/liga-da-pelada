import { describe, expect, it, vi } from "vitest";
import {
  getMyFitnessRounds,
  getPlayerFitnessSummaries,
  saveMyFitness,
  setMyFitnessVisibility,
  type FitnessRepository,
} from "./manage-fitness.js";

const playerId = "00000000-0000-4000-8000-000000000001";
const leagueId = "00000000-0000-4000-8000-000000000002";
const roundId = "00000000-0000-4000-8000-000000000003";
const actor = { userId: "verified-user" };

function repository(): FitnessRepository {
  return {
    listMyRounds: vi.fn().mockResolvedValue([]),
    saveMyFitness: vi.fn().mockResolvedValue(playerId),
    setMyVisibility: vi.fn().mockResolvedValue(playerId),
    listSummaryMeasurements: vi.fn().mockResolvedValue([
      { roundType: "official", distanceKm: 5, averageSpeedKmh: 12 },
    ]),
  };
}

describe("manage fitness", () => {
  it("uses normalized identifiers and values for owner commands", async () => {
    const target = repository();
    await getMyFitnessRounds(playerId, leagueId, actor, target);
    await expect(saveMyFitness(roundId, 5.678, 100, actor, target)).resolves.toBe(playerId);
    await expect(setMyFitnessVisibility(true, actor, target)).resolves.toBe(playerId);
    expect(target.listMyRounds).toHaveBeenCalledWith(playerId, leagueId, actor);
    expect(target.saveMyFitness).toHaveBeenCalledWith(roundId, 5.68, 6, actor);
    expect(target.setMyVisibility).toHaveBeenCalledWith(true, actor);
  });

  it("summarizes visible measurements and preserves hidden results", async () => {
    const target = repository();
    await expect(getPlayerFitnessSummaries(playerId, leagueId, actor, target)).resolves.toMatchObject({
      official: { distanceKm: 5, averageSpeedKmh: 12, entries: 1 }, friendly: { entries: 0 },
    });
    vi.mocked(target.listSummaryMeasurements).mockResolvedValueOnce(null);
    await expect(getPlayerFitnessSummaries(playerId, leagueId, actor, target)).resolves.toBeNull();
  });
});
