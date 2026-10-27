import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), selectedLeague: vi.fn(), rosterApi: vi.fn(), getRounds: vi.fn(), save: vi.fn(),
  visibility: vi.fn(), summaries: vi.fn(), revalidatePath: vi.fn(), activeSeason: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("./seasons", () => ({ getActiveSeason: mocks.activeSeason }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import { getMyFitnessRounds, getPlayerFitnessSummaries, saveMyFitness, setFitnessVisibility } from "./fitness";

const playerId = "00000000-0000-4000-8000-000000000001";
const leagueId = "00000000-0000-4000-8000-000000000002";
const roundId = "00000000-0000-4000-8000-000000000003";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ user: { id: "user-1" }, profile: { player_id: playerId }, client: {} });
  mocks.selectedLeague.mockResolvedValue({ id: leagueId });
  mocks.rosterApi.mockResolvedValue({
    getMyFitnessRounds: mocks.getRounds,
    saveMyFitness: mocks.save,
    setFitnessVisibility: mocks.visibility,
    getPlayerFitnessSummaries: mocks.summaries,
  });
});

describe("fitness actions through the roster API", () => {
  it("loads owner rounds and visible summaries in the selected league", async () => {
    mocks.getRounds.mockResolvedValue([{ roundId, number: 1, date: "2026-10-20", roundType: "official", fitness: null }]);
    mocks.summaries.mockResolvedValue({ official: { entries: 1 }, friendly: { entries: 0 } });
    await expect(getMyFitnessRounds(playerId)).resolves.toHaveLength(1);
    await expect(getPlayerFitnessSummaries(playerId)).resolves.toMatchObject({ official: { entries: 1 } });
    expect(mocks.getRounds).toHaveBeenCalledWith(playerId, leagueId);
    expect(mocks.summaries).toHaveBeenCalledWith(playerId, leagueId);
  });

  it("saves measurements and privacy then revalidates dependent screens", async () => {
    mocks.save.mockResolvedValue(playerId);
    mocks.visibility.mockResolvedValue(playerId);
    await expect(saveMyFitness(roundId, 5.5, 100)).resolves.toEqual({ success: true });
    await expect(setFitnessVisibility(true)).resolves.toEqual({ success: true });
    expect(mocks.save).toHaveBeenCalledWith(roundId, 5.5, 100);
    expect(mocks.visibility).toHaveBeenCalledWith(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/jogadores/${playerId}`);
  });

  it("rejects another player's owner panel and contains backend failures", async () => {
    await expect(getMyFitnessRounds("00000000-0000-4000-8000-000000000009")).resolves.toEqual([]);
    expect(mocks.getRounds).not.toHaveBeenCalled();
    mocks.save.mockRejectedValue(new Error("Rodada não autorizada"));
    await expect(saveMyFitness(roundId, 5, 10)).resolves.toEqual({ success: false, error: "Rodada não autorizada" });
  });
});
