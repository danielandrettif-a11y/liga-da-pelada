import { afterEach, describe, expect, it, vi } from "vitest";
import { claimSeasonPassCosmetic, purchaseSeasonPassItem, type SeasonPassMutationGateway } from "./mutate-season-pass";

function setup() {
  return {
    rewardBelongsToSeason: vi.fn().mockResolvedValue(true),
    shopItemBelongsToUserAndSeason: vi.fn().mockResolvedValue(true),
    claim: vi.fn().mockResolvedValue(null),
    purchase: vi.fn().mockResolvedValue(null),
  } satisfies SeasonPassMutationGateway;
}

afterEach(() => vi.restoreAllMocks());

describe("mutações do Passe da pelada", () => {
  it("só resgata recompensa da temporada selecionada", async () => {
    const gateway = setup();
    gateway.rewardBelongsToSeason.mockResolvedValueOnce(false);
    expect(await claimSeasonPassCosmetic({ rewardId: "reward-1", cosmeticId: "cosmetic-1", fantasySeasonId: "season-1" }, gateway))
      .toEqual({ success: false, error: "Recompensa não pertence à pelada selecionada." });
    expect(gateway.claim).not.toHaveBeenCalled();
    expect(await claimSeasonPassCosmetic({ rewardId: "reward-1", cosmeticId: "cosmetic-1", fantasySeasonId: "season-1" }, gateway))
      .toEqual({ success: true });
    expect(gateway.claim).toHaveBeenCalledWith("reward-1", "cosmetic-1");
  });

  it("retorna erro da RPC de resgate traduzido sem expor detalhes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const gateway = setup();
    gateway.claim.mockResolvedValueOnce("Recompensa ainda nao desbloqueada");
    expect(await claimSeasonPassCosmetic({ rewardId: "reward-1", cosmeticId: "cosmetic-1", fantasySeasonId: "season-1" }, gateway))
      .toEqual({ success: false, error: "Esta recompensa ainda não foi desbloqueada." });
  });

  it("valida ID e vínculo do item com usuário e temporada antes de comprar", async () => {
    const gateway = setup();
    expect(await purchaseSeasonPassItem({ shopItemId: "", fantasySeasonId: "season-1", userId: "user-1" }, gateway))
      .toEqual({ success: false, error: "Item da loja inválido." });
    expect(gateway.shopItemBelongsToUserAndSeason).not.toHaveBeenCalled();
    gateway.shopItemBelongsToUserAndSeason.mockResolvedValueOnce(false);
    expect(await purchaseSeasonPassItem({ shopItemId: "item-1", fantasySeasonId: "season-1", userId: "user-1" }, gateway))
      .toEqual({ success: false, error: "Item não pertence à pelada selecionada." });
    expect(gateway.purchase).not.toHaveBeenCalled();
    expect(await purchaseSeasonPassItem({ shopItemId: "item-1", fantasySeasonId: "season-1", userId: "user-1" }, gateway))
      .toEqual({ success: true });
    expect(gateway.shopItemBelongsToUserAndSeason).toHaveBeenCalledWith("item-1", "season-1", "user-1");
    expect(gateway.purchase).toHaveBeenCalledWith("item-1");
  });

  it("mantém a mensagem de saldo insuficiente", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const gateway = setup();
    gateway.purchase.mockResolvedValueOnce("Pontos extras insuficientes");
    expect(await purchaseSeasonPassItem({ shopItemId: "item-1", fantasySeasonId: "season-1", userId: "user-1" }, gateway))
      .toEqual({ success: false, error: "Você ainda não tem pontos extras suficientes." });
  });
});
