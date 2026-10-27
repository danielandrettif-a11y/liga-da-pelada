import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), selectedLeague: vi.fn(), rosterApi: vi.fn(), draw: vi.fn(),
  getRatings: vi.fn(), setRating: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import { drawTeamsBySpeedOnServer, getPlayerSpeedRatings, setPlayerSpeedRating } from "./speed-draw";

const leagueId = "00000000-0000-4000-8000-000000000010";
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ isAdmin: true, client: {} });
  mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "admin" });
  mocks.rosterApi.mockResolvedValue({
    drawTeamsBySpeed: mocks.draw,
    getPlayerSpeedRatings: mocks.getRatings,
    setPlayerSpeedRating: mocks.setRating,
  });
});

describe("speed draw actions through the roster API", () => {
  it("draws using only selected league identifiers and server session transport", async () => {
    mocks.draw.mockResolvedValue({
      teams: [[first], [second]], teamSummaries: [], unratedCount: 0, attendanceOrder: [],
    });
    const command = { playerIds: [first, second], teamCount: 2, playersPerTeam: 1 };
    await expect(drawTeamsBySpeedOnServer(command)).resolves.toMatchObject({
      success: true, teams: [[first], [second]],
    });
    expect(mocks.draw).toHaveBeenCalledWith(leagueId, command);
  });

  it("loads and changes league-scoped ratings then revalidates player screens", async () => {
    mocks.getRatings.mockResolvedValue({ [first]: 3 });
    await expect(getPlayerSpeedRatings()).resolves.toEqual({ [first]: 3 });
    await expect(setPlayerSpeedRating(first, 2)).resolves.toEqual({ success: true });
    expect(mocks.getRatings).toHaveBeenCalledWith(leagueId);
    expect(mocks.setRating).toHaveBeenCalledWith(leagueId, first, 2);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/jogadores/${first}`);
  });

  it("contains backend failures and preserves the server-action contract", async () => {
    mocks.draw.mockRejectedValue(new Error("Jogador fora da pelada"));
    await expect(drawTeamsBySpeedOnServer({
      playerIds: [first, second], teamCount: 2, playersPerTeam: 1,
    })).resolves.toEqual({ success: false, error: "Jogador fora da pelada" });
    mocks.setRating.mockRejectedValue(new Error("Sem permissão"));
    await expect(setPlayerSpeedRating(first, 1)).resolves.toEqual({ success: false, error: "Sem permissão" });
  });
});
