import { describe, expect, it, vi } from "vitest";
import { ManageSeasonOperationsUseCase, SeasonOperationsValidationError } from "./manage-season-operations.js";

const actor = { userId: "11111111-1111-4111-8111-111111111111", role: "authenticated" as const };
const leagueId = "22222222-2222-4222-8222-222222222222";

describe("ManageSeasonOperationsUseCase", () => {
  it("validates league scope before calling the repository", async () => {
    const repository = {
      findPlayerCardOveralls: vi.fn(), findTeamStandings: vi.fn(), previewReprocess: vi.fn(), executeReprocess: vi.fn(),
    };
    const useCase = new ManageSeasonOperationsUseCase(repository);
    expect(() => useCase.getTeamStandings(actor, "invalid")).toThrow(SeasonOperationsValidationError);
    expect(repository.findTeamStandings).not.toHaveBeenCalled();
  });

  it("delegates all operations with the authenticated actor", async () => {
    const repository = {
      findPlayerCardOveralls: vi.fn().mockResolvedValue({}),
      findTeamStandings: vi.fn().mockResolvedValue([]),
      previewReprocess: vi.fn().mockResolvedValue({ can_reprocess: true }),
      executeReprocess: vi.fn().mockResolvedValue({ success: true }),
    };
    const useCase = new ManageSeasonOperationsUseCase(repository);
    await useCase.getPlayerCardOveralls(actor, leagueId);
    await useCase.getTeamStandings(actor, leagueId);
    await useCase.previewReprocessSeason(actor, leagueId);
    await useCase.executeReprocessSeason(actor, leagueId);
    for (const method of Object.values(repository)) expect(method).toHaveBeenCalledWith(actor, leagueId);
  });
});
