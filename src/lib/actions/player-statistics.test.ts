import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), selectedLeague: vi.fn(), rosterApi: vi.fn(),
  getPlayersWithStats: vi.fn(), getRosterGroups: vi.fn(), createServerClient: vi.fn(),
  getActiveSeason: vi.fn(), getActiveSeasonRoundIds: vi.fn(), getLatestOveralls: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (operation: unknown) => operation }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account, getAdminClient: vi.fn() }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("../supabase/server", () => ({ createClient: mocks.createServerClient }));
vi.mock("./seasons", () => ({
  getActiveSeason: mocks.getActiveSeason,
  getActiveSeasonRoundIds: mocks.getActiveSeasonRoundIds,
}));
vi.mock("./stats", () => ({ getLatestPlayerCardOverallMap: mocks.getLatestOveralls }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import { getPlayersWithStats, getRosterGroups } from "./players";

const leagueId = "00000000-0000-4000-8000-000000000010";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "admin" });
  mocks.account.mockResolvedValue({ user: { id: "user-1" }, client: {} });
  mocks.rosterApi.mockResolvedValue({
    getPlayersWithStats: mocks.getPlayersWithStats,
    getRosterGroups: mocks.getRosterGroups,
  });
});

describe("player statistics actions through the roster API", () => {
  it("loads statistics and grouped rosters through league-scoped routes", async () => {
    const statistics = [{ id: "player-1", points: 9.5 }];
    const groups = { officialPlayers: statistics, activeGuests: [], wags: [], supporters: [] };
    mocks.getPlayersWithStats.mockResolvedValue(statistics);
    mocks.getRosterGroups.mockResolvedValue(groups);
    await expect(getPlayersWithStats("official", true)).resolves.toEqual(statistics);
    await expect(getRosterGroups("official")).resolves.toEqual(groups);
    expect(mocks.getPlayersWithStats).toHaveBeenCalledWith(leagueId, "official", true);
    expect(mocks.getRosterGroups).toHaveBeenCalledWith(leagueId, "official");
  });

  it("contains backend failures using the existing safe read contracts", async () => {
    mocks.getPlayersWithStats.mockRejectedValue(new Error("unavailable"));
    mocks.getRosterGroups.mockRejectedValue(new Error("unavailable"));
    await expect(getPlayersWithStats()).resolves.toEqual([]);
    await expect(getRosterGroups()).resolves.toEqual({
      officialPlayers: [], activeGuests: [], wags: [], supporters: [],
    });
  });

  it("retains the direct Supabase fallback while the roster API flag is disabled", async () => {
    const playerId = "00000000-0000-4000-8000-000000000001";
    const query = {
      select: vi.fn(), eq: vi.fn(),
      then: (resolve: (value: unknown) => void) => resolve({
        data: [{
          player_profile: "offensive", initial_player_profile: "offensive",
          overall_traits: ["offensive"], overall_seed_mode: "observed",
          players: {
            id: playerId, name: "Jogador", nickname: null, avatar_url: null,
            player_profile: "offensive", initial_player_profile: "offensive",
            overall_traits: ["offensive"], overall_seed_mode: "observed",
            member_category: "player", is_selectable: true,
          },
        }], error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const client = { from: vi.fn().mockReturnValue(query) };
    mocks.account.mockResolvedValue({ user: { id: "user-1" }, client });
    mocks.rosterApi.mockResolvedValue(null);
    mocks.getActiveSeason.mockResolvedValue(null);
    mocks.getActiveSeasonRoundIds.mockResolvedValue([]);
    mocks.createServerClient.mockResolvedValue(client);
    await expect(getPlayersWithStats("friendly")).resolves.toMatchObject([{
      id: playerId, rounds: 0, games: 0, points: 0, legacyPoints: 0,
    }]);
  });
});
