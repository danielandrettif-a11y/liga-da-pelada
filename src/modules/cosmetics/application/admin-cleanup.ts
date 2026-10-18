export type AdminCosmeticsCleanupGateway = {
  cleanupPreview(fantasySeasonId: string): Promise<{ count: number; error: string | null }>;
  dismissBronzePack(fantasySeasonId: string): Promise<{ count: number; error: string | null }>;
  resetTestClaims(fantasySeasonId: string): Promise<{ count: number; error: string | null }>;
};

export async function cleanupLegacyCosmeticsPreview(
  fantasySeasonId: string | null,
  gateway: AdminCosmeticsCleanupGateway,
) {
  if (!fantasySeasonId) return { success: false as const, error: "Passe da pelada selecionada não encontrado." };
  const result = await gateway.cleanupPreview(fantasySeasonId);
  if (result.error) return { success: false as const, error: result.error };
  return { success: true as const, removed: result.count };
}

export async function dismissUnopenedBronzePassPack(
  fantasySeasonId: string | null,
  gateway: AdminCosmeticsCleanupGateway,
) {
  if (!fantasySeasonId) return { success: false as const, error: "Passe da pelada selecionada não encontrado." };
  const result = await gateway.dismissBronzePack(fantasySeasonId);
  if (result.error) return { success: false as const, error: result.error };
  return { success: true as const, dismissed: result.count };
}

export async function resetTestPassRewardClaims(
  requestedFantasySeasonId: string,
  selectedFantasySeasonId: string | null,
  gateway: AdminCosmeticsCleanupGateway,
) {
  if (!requestedFantasySeasonId) return { success: false as const, error: "Temporada do Passe não encontrada." };
  if (requestedFantasySeasonId !== selectedFantasySeasonId) {
    return { success: false as const, error: "Passe não pertence à pelada selecionada." };
  }
  const result = await gateway.resetTestClaims(requestedFantasySeasonId);
  if (result.error) return { success: false as const, error: result.error };
  return { success: true as const, removed: result.count };
}
