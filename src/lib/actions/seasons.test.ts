import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectedLeague: vi.fn(), account: vi.fn(), createClient: vi.fn(), leagueApi: vi.fn(),
  getActiveSeason: vi.fn(), getActiveSeasonRoundIds: vi.fn(), getLatestFinishedSeason: vi.fn(), finishSeason: vi.fn(),
  revalidatePath: vi.fn(), revalidateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: mocks.revalidateTag }));
vi.mock("../supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/leagues/infrastructure/league-api-session", () => ({ leagueApiFor: mocks.leagueApi }));

import {
  finishSeason,
  getActiveSeason,
  getActiveSeasonRoundIds,
  getLatestFinishedSeason,
} from "./seasons";

const league = { id: "league-1", role: "admin", name: "Pelada BQ" };
const client = {};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.selectedLeague.mockResolvedValue(league);
  mocks.createClient.mockResolvedValue(client);
  mocks.account.mockResolvedValue({ user: { id: "admin-1" }, isAdmin: true, client });
  mocks.leagueApi.mockResolvedValue({
    getActiveSeason: mocks.getActiveSeason,
    getActiveSeasonRoundIds: mocks.getActiveSeasonRoundIds,
    getLatestFinishedSeason: mocks.getLatestFinishedSeason,
    finishSeason: mocks.finishSeason,
  });
});

describe("season actions through the modular API", () => {
  it("reads only the selected league projections", async () => {
    const season = { id: "season-1", league_id: "league-1", status: "active", number: 1 };
    mocks.getActiveSeason.mockResolvedValue(season);
    mocks.getActiveSeasonRoundIds.mockResolvedValue(["round-1"]);
    mocks.getLatestFinishedSeason.mockResolvedValue({ seasonId: "season-0" });
    await expect(getActiveSeason()).resolves.toEqual(season);
    await expect(getActiveSeasonRoundIds(undefined, "friendly")).resolves.toEqual(["round-1"]);
    await expect(getLatestFinishedSeason()).resolves.toEqual({ seasonId: "season-0" });
    expect(mocks.getActiveSeason).toHaveBeenCalledWith("league-1");
    expect(mocks.getActiveSeasonRoundIds).toHaveBeenCalledWith("league-1", "friendly");
    expect(mocks.getLatestFinishedSeason).toHaveBeenCalledWith("league-1");
  });

  it("finishes through the backend and revalidates every dependent view", async () => {
    mocks.finishSeason.mockResolvedValue({ summary: { seasonId: "season-1" }, newSeasonNumber: 2 });
    await expect(finishSeason("Terminar")).resolves.toMatchObject({ success: true, newSeasonNumber: 2 });
    expect(mocks.finishSeason).toHaveBeenCalledWith("league-1", "Terminar");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ranking");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("season", "max");
  });

  it("rejects confirmation and non-admin sessions before calling the backend", async () => {
    await expect(finishSeason("terminar")).resolves.toMatchObject({ success: false });
    mocks.account.mockResolvedValue({ user: { id: "player-1" }, isAdmin: false, client });
    await expect(finishSeason("Terminar")).resolves.toMatchObject({ success: false });
    expect(mocks.finishSeason).not.toHaveBeenCalled();
  });
});
