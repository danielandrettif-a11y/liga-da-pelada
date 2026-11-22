import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), selectedLeague: vi.fn(), leagueApi: vi.fn(),
  upgrade: vi.fn(), deleteLeague: vi.fn(), rpc: vi.fn(),
  redirect: vi.fn(), revalidatePath: vi.fn(), revalidateTag: vi.fn(), cookieDelete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: mocks.cookieDelete }) }));
vi.mock("@/lib/auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("@/lib/league-context", () => ({
  ACTIVE_LEAGUE_COOKIE: "active_league_id", getSelectedLeague: mocks.selectedLeague,
}));
vi.mock("@/modules/leagues/infrastructure/league-api-session", () => ({ leagueApiFor: mocks.leagueApi }));

import { deleteCurrentLeague, upgradeCurrentLeague } from "./league-mode-actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`redirect:${url}`); });
  mocks.account.mockResolvedValue({
    user: { id: "admin-1" }, isAdmin: true, client: { rpc: mocks.rpc },
  });
  mocks.selectedLeague.mockResolvedValue({
    id: "league-1", name: "Pelada BQ", role: "admin", featureTier: "basic",
  });
  mocks.leagueApi.mockResolvedValue({ upgrade: mocks.upgrade, deleteLeague: mocks.deleteLeague });
});

describe("league lifecycle actions", () => {
  it("upgrades the selected basic league through the modular API", async () => {
    const data = new FormData();
    data.set("confirm", "upgrade");
    await expect(upgradeCurrentLeague(data)).rejects.toThrow("redirect:/mais?upgraded=1");
    expect(mocks.upgrade).toHaveBeenCalledWith("league-1");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("league", "max");
  });

  it("deletes only after exact confirmation and clears the selected league", async () => {
    await expect(deleteCurrentLeague("Pelada BQ")).rejects.toThrow("redirect:/lobby?deleted=1");
    expect(mocks.deleteLeague).toHaveBeenCalledWith("league-1", "Pelada BQ");
    expect(mocks.cookieDelete).toHaveBeenCalledWith("active_league_id");
  });

  it("rejects an inexact delete confirmation before calling the backend", async () => {
    await expect(deleteCurrentLeague("pelada bq")).resolves.toMatchObject({ success: false });
    expect(mocks.deleteLeague).not.toHaveBeenCalled();
  });
});
