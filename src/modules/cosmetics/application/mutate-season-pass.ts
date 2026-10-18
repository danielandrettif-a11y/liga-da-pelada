import { claimPassError, purchasePassError, validatePassShopItemId } from "../domain/pass-mutation";

export type SeasonPassMutationGateway = {
  rewardBelongsToSeason(rewardId: string, fantasySeasonId: string): Promise<boolean>;
  shopItemBelongsToUserAndSeason(shopItemId: string, fantasySeasonId: string, userId: string): Promise<boolean>;
  claim(rewardId: string, cosmeticId: string): Promise<string | null>;
  purchase(shopItemId: string): Promise<string | null>;
};

export async function claimSeasonPassCosmetic(
  input: { rewardId: string; cosmeticId: string; fantasySeasonId: string },
  gateway: SeasonPassMutationGateway,
) {
  if (!await gateway.rewardBelongsToSeason(input.rewardId, input.fantasySeasonId)) {
    return { success: false as const, error: "Recompensa não pertence à pelada selecionada." };
  }
  const error = await gateway.claim(input.rewardId, input.cosmeticId);
  if (error) {
    console.error("Erro ao resgatar recompensa do Passe:", error);
    return { success: false as const, error: claimPassError(error) };
  }
  return { success: true as const };
}

export async function purchaseSeasonPassItem(
  input: { shopItemId: string; fantasySeasonId: string; userId: string },
  gateway: SeasonPassMutationGateway,
) {
  const validationError = validatePassShopItemId(input.shopItemId);
  if (validationError) return { success: false as const, error: validationError };
  if (!await gateway.shopItemBelongsToUserAndSeason(input.shopItemId, input.fantasySeasonId, input.userId)) {
    return { success: false as const, error: "Item não pertence à pelada selecionada." };
  }
  const error = await gateway.purchase(input.shopItemId);
  if (error) {
    console.error("Erro ao comprar item do Passe:", error);
    return { success: false as const, error: purchasePassError(error) };
  }
  return { success: true as const };
}
