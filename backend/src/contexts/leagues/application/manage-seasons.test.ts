import { describe, expect, it, vi } from "vitest";
import {
  finishSeason,
  getActiveSeason,
  getActiveSeasonRoundIds,
  getLatestFinishedSeason,
} from "./manage-seasons.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("season use cases", () => {
  it("passes validated scope and actor to the repository", async () => {
    const repository = {
      getActive: vi.fn().mockResolvedValue(null),
      getActiveRoundIds: vi.fn().mockResolvedValue(["round-1"]),
      getLatestFinishedSummary: vi.fn().mockResolvedValue(null),
      finish: vi.fn().mockResolvedValue({ summary: {}, newSeasonNumber: 2 }),
    };
    await getActiveSeason(leagueId, actor, repository);
    await getActiveSeasonRoundIds(leagueId, "friendly", actor, repository);
    await getLatestFinishedSeason(leagueId, actor, repository);
    await finishSeason(leagueId, "Terminar", actor, repository, () => new Date("2026-10-26T12:00:00.000Z"));
    expect(repository.getActive).toHaveBeenCalledWith(leagueId, actor);
    expect(repository.getActiveRoundIds).toHaveBeenCalledWith(leagueId, "friendly", actor);
    expect(repository.getLatestFinishedSummary).toHaveBeenCalledWith(leagueId, actor);
    expect(repository.finish).toHaveBeenCalledWith(leagueId, actor, "2026-10-26T12:00:00.000Z");
  });

  it("rejects invalid identifiers, types and confirmation before persistence", async () => {
    const repository = {
      getActive: vi.fn(), getActiveRoundIds: vi.fn(), getLatestFinishedSummary: vi.fn(), finish: vi.fn(),
    };
    await expect(getActiveSeason("invalid", actor, repository)).rejects.toThrow();
    await expect(getActiveSeasonRoundIds(leagueId, "all", actor, repository)).rejects.toThrow();
    await expect(finishSeason(leagueId, "terminar", actor, repository)).rejects.toThrow("Terminar");
    expect(repository.finish).not.toHaveBeenCalled();
  });
});
