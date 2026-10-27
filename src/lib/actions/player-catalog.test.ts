import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), selectedLeague: vi.fn(), rosterApi: vi.fn(), getPlayers: vi.fn(), getPlayer: vi.fn(),
  createPlayer: vi.fn(), updatePlayer: vi.fn(), swapPlayerAvatars: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account, getAdminClient: vi.fn() }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import {
  createPlayer, getPlayer, getPlayers, getSelectableLeaguePlayers, swapPlayerAvatars, updatePlayer,
} from "./players";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const player = { id: playerId, name: "Jogador" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ user: { id: "user-1" }, client: {}, isAdmin: true, profile: { player_id: playerId } });
  mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "admin" });
  mocks.rosterApi.mockResolvedValue({
    getPlayers: mocks.getPlayers, getPlayer: mocks.getPlayer, createPlayer: mocks.createPlayer,
    updatePlayer: mocks.updatePlayer, swapPlayerAvatars: mocks.swapPlayerAvatars,
  });
});

describe("player catalog actions through the roster API", () => {
  it("loads the complete and selectable catalogs through one league-scoped gateway", async () => {
    mocks.getPlayers.mockResolvedValue([player]);
    await expect(getPlayers()).resolves.toEqual([player]);
    await expect(getSelectableLeaguePlayers(leagueId)).resolves.toEqual([player]);
    expect(mocks.getPlayers).toHaveBeenNthCalledWith(1, leagueId, false);
    expect(mocks.getPlayers).toHaveBeenNthCalledWith(2, leagueId, true);
  });

  it("loads detail only from the selected league", async () => {
    mocks.getPlayer.mockResolvedValue(player);
    await expect(getPlayer(playerId)).resolves.toEqual(player);
    expect(mocks.getPlayer).toHaveBeenCalledWith(leagueId, playerId);
    await expect(getSelectableLeaguePlayers("00000000-0000-4000-8000-000000000099")).resolves.toEqual([]);
  });

  it("contains backend failures without changing the existing action contracts", async () => {
    mocks.getPlayers.mockRejectedValue(new Error("unavailable"));
    mocks.getPlayer.mockRejectedValue(new Error("unavailable"));
    await expect(getPlayers()).resolves.toEqual([]);
    await expect(getPlayer(playerId)).resolves.toBeNull();
  });

  it("retains the direct Supabase fallback while the migration flag is disabled", async () => {
    const query = {
      select: vi.fn(), eq: vi.fn(),
      then: (resolve: (value: unknown) => void) => resolve({
        data: [{
          player_profile: "offensive", initial_player_profile: "offensive",
          overall_traits: ["offensive"], overall_seed_mode: "observed",
          players: {
            id: playerId, name: "Jogador", avatar_url: null, player_profile: "offensive",
            overall_traits: ["offensive"], overall_seed_mode: "observed", member_category: "player",
            is_selectable: true,
          },
        }],
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.account.mockResolvedValue({ user: { id: "user-1" }, client: { from: vi.fn().mockReturnValue(query) } });
    mocks.rosterApi.mockResolvedValue(null);
    await expect(getPlayers()).resolves.toMatchObject([{ id: playerId, name: "Jogador" }]);
  });

  it("creates, updates and swaps player avatars through the roster gateway", async () => {
    mocks.createPlayer.mockResolvedValue(player);
    mocks.updatePlayer.mockResolvedValue({ ...player, nickname: "BQ" });
    mocks.swapPlayerAvatars.mockResolvedValue(undefined);
    await expect(createPlayer({ name: "Jogador", member_category: "guest" }))
      .resolves.toMatchObject({ success: true, data: player });
    await expect(updatePlayer(playerId, { nickname: "BQ" }))
      .resolves.toMatchObject({ success: true, data: { nickname: "BQ" } });
    await expect(swapPlayerAvatars(playerId)).resolves.toEqual({ success: true });
    expect(mocks.createPlayer).toHaveBeenCalledWith(leagueId, { name: "Jogador", member_category: "guest" });
    expect(mocks.updatePlayer).toHaveBeenCalledWith(leagueId, playerId, { nickname: "BQ" });
    expect(mocks.swapPlayerAvatars).toHaveBeenCalledWith(leagueId, playerId);
  });

  it("preserves controlled roster API failures for player commands", async () => {
    mocks.createPlayer.mockRejectedValue(new Error("Nome já cadastrado"));
    mocks.updatePlayer.mockRejectedValue(new Error("Jogador não encontrado"));
    mocks.swapPlayerAvatars.mockRejectedValue(new Error("Adicione uma foto extra"));
    await expect(createPlayer({ name: "Jogador", member_category: "guest" }))
      .resolves.toEqual({ success: false, error: "Nome já cadastrado" });
    await expect(updatePlayer(playerId, { nickname: "BQ" }))
      .resolves.toEqual({ success: false, error: "Jogador não encontrado" });
    await expect(swapPlayerAvatars(playerId))
      .resolves.toEqual({ success: false, error: "Adicione uma foto extra" });
  });
});
