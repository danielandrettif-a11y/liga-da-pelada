import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), selectedLeague: vi.fn(), activeSeason: vi.fn(), rosterApi: vi.fn(),
  monthly: vi.fn(), belts: vi.fn(), winners: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account, getAdminClient: vi.fn() }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("./seasons", () => ({ getActiveSeason: mocks.activeSeason, getActiveSeasonRoundIds: vi.fn() }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import { getPlayerAchievementBelts, getPlayerMonthlyAwards, getPreviousMonthAwardWinners } from "./players";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ user: { id: "user-1" }, client: {} });
  mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "player" });
  mocks.activeSeason.mockResolvedValue({ id: "season-1", league_id: leagueId });
  mocks.rosterApi.mockResolvedValue({
    getPlayerMonthlyAwards: mocks.monthly,
    getPlayerAchievementBelts: mocks.belts,
    getMonthlyAwardWinners: mocks.winners,
  });
});

describe("player award actions", () => {
  it("reads all award projections through the selected league API", async () => {
    mocks.monthly.mockResolvedValue([]); mocks.belts.mockResolvedValue([]); mocks.winners.mockResolvedValue([]);
    await expect(getPlayerMonthlyAwards(playerId)).resolves.toEqual([]);
    await expect(getPlayerAchievementBelts(playerId)).resolves.toEqual([]);
    await expect(getPreviousMonthAwardWinners()).resolves.toMatchObject({ winners: [] });
    expect(mocks.monthly).toHaveBeenCalledWith(leagueId, playerId);
    expect(mocks.belts).toHaveBeenCalledWith(leagueId, playerId);
    expect(mocks.winners).toHaveBeenCalledWith(leagueId, expect.stringMatching(/^\d{4}-\d{2}-01$/));
  });

  it("contains backend failures using the existing empty projections", async () => {
    mocks.monthly.mockRejectedValue(new Error("unavailable"));
    mocks.belts.mockRejectedValue(new Error("unavailable"));
    mocks.winners.mockRejectedValue(new Error("unavailable"));
    await expect(getPlayerMonthlyAwards(playerId)).resolves.toEqual([]);
    await expect(getPlayerAchievementBelts(playerId)).resolves.toEqual([]);
    await expect(getPreviousMonthAwardWinners()).resolves.toMatchObject({ winners: [] });
  });
});
