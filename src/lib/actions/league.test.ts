import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectedLeague: vi.fn(), account: vi.fn(), leagueApi: vi.fn(), setVisibility: vi.fn(),
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

import { updateLeagueVisibility } from "./league";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.selectedLeague.mockResolvedValue({ id: "league-1", role: "admin" });
  mocks.account.mockResolvedValue({ user: { id: "admin-1" }, client: {} });
  mocks.leagueApi.mockResolvedValue({ setVisibility: mocks.setVisibility });
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
