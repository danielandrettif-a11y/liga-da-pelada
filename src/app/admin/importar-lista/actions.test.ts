import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), selectedLeague: vi.fn(), rosterApi: vi.fn(), importGuests: vi.fn(),
  redirect: vi.fn(), revalidatePath: vi.fn(), rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("@/lib/league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import { importGuestRoster } from "./actions";

const leagueId = "00000000-0000-4000-8000-000000000010";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
  mocks.account.mockResolvedValue({ isAdmin: true, client: { rpc: mocks.rpc } });
  mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "admin" });
  mocks.rosterApi.mockResolvedValue({ importGuestRoster: mocks.importGuests });
});

describe("guest roster import action", () => {
  it("imports normalized names through the roster API and preserves redirects", async () => {
    mocks.importGuests.mockResolvedValue([
      { createdName: "Ana BQ", playerId: "player-1", addedToCallup: true },
      { createdName: "Bruno", playerId: "player-2", addedToCallup: false },
    ]);
    const form = new FormData();
    form.set("names", "  Ana   BQ\nBruno\n x ");
    await expect(importGuestRoster(form)).rejects.toThrow("REDIRECT:/admin/importar-lista?created=2");
    expect(mocks.importGuests).toHaveBeenCalledWith(leagueId, ["Ana BQ", "Bruno"]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/jogadores");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps the Supabase fallback while the roster API is disabled", async () => {
    mocks.rosterApi.mockResolvedValue(null);
    mocks.rpc.mockResolvedValue({ data: [{ player_id: "player-1" }], error: null });
    const form = new FormData();
    form.set("names", "Ana");
    await expect(importGuestRoster(form)).rejects.toThrow("REDIRECT:/admin/importar-lista?created=1");
    expect(mocks.rpc).toHaveBeenCalledWith("import_league_guest_roster", {
      p_league_id: leagueId, p_names: ["Ana"],
    });
  });

  it("redirects API failures without falling back to a second write path", async () => {
    mocks.importGuests.mockRejectedValue(new Error("indisponível"));
    const form = new FormData();
    form.set("names", "Ana");
    await expect(importGuestRoster(form)).rejects.toThrow("REDIRECT:/admin/importar-lista?error=save");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
