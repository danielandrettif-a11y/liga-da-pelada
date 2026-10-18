import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  activeLeague: vi.fn(),
  activeSeason: vi.fn(),
  readFantasySeasonId: vi.fn(),
  cleanupPreview: vi.fn(),
  dismissBronzePack: vi.fn(),
  resetTestClaims: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("./rounds", () => ({ getActiveLeague: mocks.activeLeague }));
vi.mock("./seasons", () => ({ getActiveSeason: mocks.activeSeason }));
vi.mock("@/modules/cosmetics/infrastructure/supabase-admin-cleanup-gateway", () => ({
  readFantasySeasonId: mocks.readFantasySeasonId,
  supabaseAdminCosmeticsCleanupGateway: () => ({
    cleanupPreview: mocks.cleanupPreview,
    dismissBronzePack: mocks.dismissBronzePack,
    resetTestClaims: mocks.resetTestClaims,
  }),
}));

import {
  cleanupMyLegacyCosmeticsPreview,
  dismissMyUnopenedBronzePassPack,
  resetMyTestPassRewardClaims,
} from "./cosmetics";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ user: { id: "user-a" }, isAdmin: true, client: {} });
  mocks.activeLeague.mockResolvedValue({ id: "league-a" });
  mocks.activeSeason.mockResolvedValue({ id: "season-a" });
  mocks.readFantasySeasonId.mockResolvedValue("fantasy-a");
  mocks.cleanupPreview.mockResolvedValue({ count: 2, error: null });
  mocks.dismissBronzePack.mockResolvedValue({ count: 1, error: null });
  mocks.resetTestClaims.mockResolvedValue({ count: 3, error: null });
});

describe("Actions de limpeza administrativa dos cosméticos", () => {
  it("nega conta sem sessão ou sem papel ADM antes de consultar a temporada", async () => {
    mocks.account.mockResolvedValueOnce({ user: null, isAdmin: false, client: {} });
    expect(await cleanupMyLegacyCosmeticsPreview()).toEqual({
      success: false, error: "A prévia é exclusiva para administradores.",
    });
    mocks.account.mockResolvedValueOnce({ user: { id: "user-a" }, isAdmin: false, client: {} });
    expect(await dismissMyUnopenedBronzePassPack()).toEqual({
      success: false, error: "A limpeza é exclusiva para administradores.",
    });
    expect(mocks.activeLeague).not.toHaveBeenCalled();
    expect(mocks.readFantasySeasonId).not.toHaveBeenCalled();
    expect(mocks.cleanupPreview).not.toHaveBeenCalled();
    expect(mocks.dismissBronzePack).not.toHaveBeenCalled();
  });

  it("revalida cada tela apenas depois da RPC confirmada", async () => {
    expect(await cleanupMyLegacyCosmeticsPreview()).toEqual({ success: true, removed: 2 });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/meu-perfil"], ["/jogadores"], ["/ranking"],
    ]);
    mocks.revalidatePath.mockClear();
    expect(await dismissMyUnopenedBronzePassPack()).toEqual({ success: true, dismissed: 1 });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/cartola"], ["/meu-perfil"]]);
    mocks.revalidatePath.mockClear();
    expect(await resetMyTestPassRewardClaims("fantasy-a")).toEqual({ success: true, removed: 3 });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/meu-perfil"], ["/jogadores"], ["/passe"],
    ]);
    expect(mocks.readFantasySeasonId).toHaveBeenCalledWith({}, "league-a", "season-a");
  });

  it("não revalida nem executa RPC quando a temporada enviada é de outra pelada", async () => {
    expect(await resetMyTestPassRewardClaims("fantasy-b")).toEqual({
      success: false, error: "Passe não pertence à pelada selecionada.",
    });
    expect(mocks.resetTestClaims).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("não revalida após erro da RPC", async () => {
    mocks.cleanupPreview.mockResolvedValueOnce({ count: 0, error: "negado" });
    expect(await cleanupMyLegacyCosmeticsPreview()).toEqual({ success: false, error: "negado" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
