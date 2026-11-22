import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), selectedLeague: vi.fn(), rosterApi: vi.fn(), playtime: vi.fn(), clubGoals: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account, getAdminClient: vi.fn() }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import { getPlayerGoalsByClub, getPlayerPlaytime } from "./players";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ user: { id: "user-1" }, client: {} });
  mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "player" });
  mocks.rosterApi.mockResolvedValue({
    getPlayerPlaytime: mocks.playtime,
    getPlayerGoalsByClub: mocks.clubGoals,
  });
});

describe("player profile performance actions", () => {
  it("loads playtime and club goals from the selected league API", async () => {
    const playtime = { totalSeconds: 120, officialSeconds: 90, friendlySeconds: 30 };
    const clubs = [{ key: "club", name: "Clube", color: "#fff", crestUrl: null,
      officialGoals: 2, friendlyGoals: 1, totalGoals: 3 }];
    mocks.playtime.mockResolvedValue(playtime);
    mocks.clubGoals.mockResolvedValue(clubs);
    await expect(getPlayerPlaytime(playerId)).resolves.toEqual(playtime);
    await expect(getPlayerGoalsByClub(playerId)).resolves.toEqual(clubs);
    expect(mocks.playtime).toHaveBeenCalledWith(leagueId, playerId);
    expect(mocks.clubGoals).toHaveBeenCalledWith(leagueId, playerId);
  });

  it("contains backend failures using the existing empty projections", async () => {
    mocks.playtime.mockRejectedValue(new Error("unavailable"));
    mocks.clubGoals.mockRejectedValue(new Error("unavailable"));
    await expect(getPlayerPlaytime(playerId)).resolves
      .toEqual({ totalSeconds: 0, officialSeconds: 0, friendlySeconds: 0 });
    await expect(getPlayerGoalsByClub(playerId)).resolves.toEqual([]);
  });
});
