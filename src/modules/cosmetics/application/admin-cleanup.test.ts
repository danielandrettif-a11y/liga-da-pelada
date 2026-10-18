import { describe, expect, it, vi } from "vitest";
import {
  cleanupLegacyCosmeticsPreview,
  dismissUnopenedBronzePassPack,
  resetTestPassRewardClaims,
  type AdminCosmeticsCleanupGateway,
} from "./admin-cleanup";

function setup() {
  return {
    cleanupPreview: vi.fn().mockResolvedValue({ count: 2, error: null }),
    dismissBronzePack: vi.fn().mockResolvedValue({ count: 1, error: null }),
    resetTestClaims: vi.fn().mockResolvedValue({ count: 3, error: null }),
  } satisfies AdminCosmeticsCleanupGateway;
}

describe("limpeza administrativa do Passe", () => {
  it("não executa limpeza nem descarte sem temporada selecionada", async () => {
    const gateway = setup();
    expect(await cleanupLegacyCosmeticsPreview(null, gateway))
      .toEqual({ success: false, error: "Passe da pelada selecionada não encontrado." });
    expect(await dismissUnopenedBronzePassPack(null, gateway))
      .toEqual({ success: false, error: "Passe da pelada selecionada não encontrado." });
    expect(gateway.cleanupPreview).not.toHaveBeenCalled();
    expect(gateway.dismissBronzePack).not.toHaveBeenCalled();
  });

  it("mantém os retornos e a temporada explícita das duas limpezas", async () => {
    const gateway = setup();
    expect(await cleanupLegacyCosmeticsPreview("fantasy-a", gateway))
      .toEqual({ success: true, removed: 2 });
    expect(await dismissUnopenedBronzePassPack("fantasy-a", gateway))
      .toEqual({ success: true, dismissed: 1 });
    expect(gateway.cleanupPreview).toHaveBeenCalledWith("fantasy-a");
    expect(gateway.dismissBronzePack).toHaveBeenCalledWith("fantasy-a");
  });

  it("bloqueia reset sem ID ou com ID de outra pelada antes da RPC", async () => {
    const gateway = setup();
    expect(await resetTestPassRewardClaims("", "fantasy-a", gateway))
      .toEqual({ success: false, error: "Temporada do Passe não encontrada." });
    expect(await resetTestPassRewardClaims("fantasy-b", "fantasy-a", gateway))
      .toEqual({ success: false, error: "Passe não pertence à pelada selecionada." });
    expect(gateway.resetTestClaims).not.toHaveBeenCalled();
  });

  it("executa reset somente na temporada selecionada", async () => {
    const gateway = setup();
    expect(await resetTestPassRewardClaims("fantasy-a", "fantasy-a", gateway))
      .toEqual({ success: true, removed: 3 });
    expect(gateway.resetTestClaims).toHaveBeenCalledWith("fantasy-a");
  });

  it("preserva o erro retornado pela RPC sem marcar sucesso", async () => {
    const gateway = setup();
    gateway.cleanupPreview.mockResolvedValueOnce({ count: 0, error: "não autorizado" });
    gateway.dismissBronzePack.mockResolvedValueOnce({ count: 0, error: "falha no banco" });
    gateway.resetTestClaims.mockResolvedValueOnce({ count: 0, error: "temporada ausente" });
    expect(await cleanupLegacyCosmeticsPreview("fantasy-a", gateway))
      .toEqual({ success: false, error: "não autorizado" });
    expect(await dismissUnopenedBronzePassPack("fantasy-a", gateway))
      .toEqual({ success: false, error: "falha no banco" });
    expect(await resetTestPassRewardClaims("fantasy-a", "fantasy-a", gateway))
      .toEqual({ success: false, error: "temporada ausente" });
  });
});
