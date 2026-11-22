import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectedLeague: vi.fn(), account: vi.fn(), createClient: vi.fn(), leagueApi: vi.fn(),
  getStadiums: vi.fn(), saveStadium: vi.fn(), deleteStadium: vi.fn(), reorderStadiums: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("../supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/leagues/infrastructure/league-api-session", () => ({ leagueApiFor: mocks.leagueApi }));

import { deleteStadium, getStadiums, reorderStadiums, saveStadium } from "./stadiums";

const client = {};
const league = { id: "league-1", role: "admin" };
const stadium = {
  id: "stadium-1", league_id: "league-1", name: "Arena BQ", address: null,
  google_maps_url: "https://maps.example/arena", latitude: null, longitude: null,
  display_order: 1, is_active: true, created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.selectedLeague.mockResolvedValue(league);
  mocks.account.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true, client });
  mocks.createClient.mockResolvedValue(client);
  mocks.leagueApi.mockResolvedValue({
    getStadiums: mocks.getStadiums,
    saveStadium: mocks.saveStadium,
    deleteStadium: mocks.deleteStadium,
    reorderStadiums: mocks.reorderStadiums,
  });
});

describe("stadium actions through the modular API", () => {
  it("loads stadiums only from the selected league", async () => {
    mocks.getStadiums.mockResolvedValue([stadium]);
    await expect(getStadiums()).resolves.toEqual([stadium]);
    expect(mocks.getStadiums).toHaveBeenCalledWith("league-1");
  });

  it("normalizes and saves stadium data through the backend", async () => {
    mocks.saveStadium.mockResolvedValue(stadium);
    const formData = new FormData();
    formData.set("name", " Arena BQ ");
    formData.set("google_maps_url", "maps.example/arena");
    const result = await saveStadium(formData);
    expect(result).toEqual({ success: true, stadium });
    expect(mocks.saveStadium).toHaveBeenCalledWith("league-1", {
      id: null, name: "Arena BQ", address: null, google_maps_url: "https://maps.example/arena",
      latitude: null, longitude: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mais/estadios");
  });

  it("deletes and atomically reorders through the backend", async () => {
    await expect(deleteStadium("stadium-1")).resolves.toEqual({ success: true });
    await expect(reorderStadiums(["stadium-1", "stadium-2"])).resolves.toEqual({ success: true });
    expect(mocks.deleteStadium).toHaveBeenCalledWith("league-1", "stadium-1");
    expect(mocks.reorderStadiums).toHaveBeenCalledWith("league-1", ["stadium-1", "stadium-2"]);
  });

  it("rejects invalid coordinates and non-admin sessions before transport", async () => {
    const formData = new FormData();
    formData.set("name", "Arena BQ");
    formData.set("google_maps_url", "maps.example/arena");
    formData.set("latitude", "-21");
    await expect(saveStadium(formData)).resolves.toMatchObject({ success: false });

    mocks.account.mockResolvedValue({ user: { id: "player-1" }, isAdmin: false, client });
    await expect(deleteStadium("stadium-1")).resolves.toMatchObject({ success: false });
    expect(mocks.saveStadium).not.toHaveBeenCalled();
    expect(mocks.deleteStadium).not.toHaveBeenCalled();
  });
});
