import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectedLeague: vi.fn(), account: vi.fn(), leagueApi: vi.fn(), setVisibility: vi.fn(),
  getConfig: vi.fn(), updateName: vi.fn(), updateSettings: vi.fn(), setPreseason: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("../auth", () => ({ getAdminClient: vi.fn(), getCurrentAccount: mocks.account }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/leagues/infrastructure/league-api-session", () => ({
  leagueApiFor: mocks.leagueApi,
}));

import {
  getLeagueConfig,
  updateLeagueConfig,
  updateLeagueName,
  updateLeagueVisibility,
  updatePreSeasonEnabled,
} from "./league";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.selectedLeague.mockResolvedValue({ id: "league-1", role: "admin" });
  mocks.account.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true, client: {} });
  mocks.leagueApi.mockResolvedValue({
    getConfig: mocks.getConfig,
    updateName: mocks.updateName,
    updateSettings: mocks.updateSettings,
    setPreseason: mocks.setPreseason,
    setVisibility: mocks.setVisibility,
  });
});

describe("league configuration bridge", () => {
  it("reads configuration from the modular API", async () => {
    mocks.getConfig.mockResolvedValue({ id: "league-1", name: "Pelada BQ", can_manage: true });
    await expect(getLeagueConfig()).resolves.toMatchObject({ id: "league-1", name: "Pelada BQ" });
    expect(mocks.getConfig).toHaveBeenCalledWith("league-1");
  });

  it("updates name, settings and preseason through the modular API", async () => {
    mocks.updateName.mockResolvedValue({ name: "Novo nome" });
    await expect(updateLeagueName("league-1", "  Novo   nome ")).resolves.toEqual({
      success: true, name: "Novo nome",
    });
    await expect(updateLeagueConfig(
      "league-1", 8, 6, 3, " Arena ", "https://maps.example/arena", 150,
    )).resolves.toEqual({ success: true });
    await expect(updatePreSeasonEnabled("league-1", true)).resolves.toEqual({ success: true });

    expect(mocks.updateName).toHaveBeenCalledWith("league-1", "Novo nome");
    expect(mocks.updateSettings).toHaveBeenCalledWith("league-1", {
      match_duration: 8,
      players_per_team: 6,
      teams_per_round: 3,
      stadium_name: "Arena",
      stadium_map_url: "https://maps.example/arena",
      event_duration_minutes: 150,
    });
    expect(mocks.setPreseason).toHaveBeenCalledWith("league-1", true);
  });
});

describe("updateLeagueVisibility", () => {
  it("uses the modular API for the selected league and revalidates affected screens", async () => {
    await expect(updateLeagueVisibility("league-1", "open")).resolves.toEqual({ success: true });
    expect(mocks.setVisibility).toHaveBeenCalledWith("league-1", "open");
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/liga");
    expect(mocks.revalidate).toHaveBeenCalledWith("/peladas");
    expect(mocks.revalidate).toHaveBeenCalledWith("/lobby");
  });

  it("keeps authorization at the Server Action boundary", async () => {
    mocks.selectedLeague.mockResolvedValue({ id: "league-1", role: "player" });
    await expect(updateLeagueVisibility("league-1", "private")).resolves.toMatchObject({ success: false });
    expect(mocks.leagueApi).not.toHaveBeenCalled();
  });

  it("returns a controlled error when the backend rejects the command", async () => {
    mocks.setVisibility.mockRejectedValue(new Error("offline"));
    await expect(updateLeagueVisibility("league-1", "private")).resolves.toEqual({
      success: false, error: "Não foi possível alterar a visibilidade.",
    });
  });
});
