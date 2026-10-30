"use server";

import { revalidatePath } from "next/cache";
import { cache } from "react";
import { getCurrentAccount } from "@/lib/auth";
import { getActiveLeague } from "./rounds";
import { getActiveSeason } from "./seasons";
import type { CosmeticSlot } from "@/lib/fantasy/cosmetics";
import { claimSeasonPassCosmetic, purchaseSeasonPassItem } from "@/modules/cosmetics/application/mutate-season-pass";
import { supabaseSeasonPassMutationGateway } from "@/modules/cosmetics/infrastructure/supabase-season-pass-gateway";
import { equipAccountCosmetic } from "@/modules/cosmetics/application/equip-account-cosmetic";
import { supabaseAccountCosmeticEquipmentGateway } from "@/modules/cosmetics/infrastructure/supabase-equipment-gateway";
import { buildCosmeticsDashboard, emptyCosmeticsDashboard } from "@/modules/cosmetics/application/build-dashboard";
import { buildEquippedCosmeticsSummary, buildPlayersEquippedCosmeticsMap } from "@/modules/cosmetics/application/build-equipped-summary";
import { resolveAdminCosmeticsPreview } from "@/modules/cosmetics/application/admin-preview";
import { cleanupLegacyCosmeticsPreview, dismissUnopenedBronzePassPack, resetTestPassRewardClaims } from "@/modules/cosmetics/application/admin-cleanup";
import { readCosmeticsDashboardRows } from "@/modules/cosmetics/infrastructure/supabase-dashboard-reader";
import { readAccountCosmeticLoadout, readPlayerCosmeticLoadout, readPlayersCosmeticLoadouts } from "@/modules/cosmetics/infrastructure/supabase-loadout-reader";
import { supabaseAdminPreviewGateway } from "@/modules/cosmetics/infrastructure/supabase-admin-preview-gateway";
import { readFantasySeasonId, supabaseAdminCosmeticsCleanupGateway } from "@/modules/cosmetics/infrastructure/supabase-admin-cleanup-gateway";
import { cosmeticsApiFor } from "@/modules/cosmetics/infrastructure/cosmetics-api-session";
import type { CosmeticsDashboard } from "@/modules/cosmetics/domain/dashboard-types";
import type { CosmeticPreviewLoadout, EquippedCosmeticsSummary } from "@/modules/cosmetics/domain/equipped-summary";

export type { CosmeticSlot } from "@/lib/fantasy/cosmetics";
export type { CosmeticPassReward, SeasonPassShopItem, SeasonPassShop, CosmeticsDashboard } from "@/modules/cosmetics/domain/dashboard-types";
export type { CosmeticPreviewLoadout, EquippedCosmeticsSummary } from "@/modules/cosmetics/domain/equipped-summary";

async function getSelectedFantasySeasonId(client: Parameters<typeof readFantasySeasonId>[0]): Promise<string | null> {
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return null;
  return readFantasySeasonId(client, league.id, season.id);
}

export async function getMyCosmeticsDashboard(): Promise<CosmeticsDashboard> {
  const account = await getCurrentAccount();
  if (!account.user) return emptyCosmeticsDashboard;
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    const league = await getActiveLeague();
    const season = await getActiveSeason(league.id);
    return cosmeticsApi.getCosmeticsDashboard(league.id, season?.id || null, account.isAdmin);
  }
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  const rows = await readCosmeticsDashboardRows(account.client, {
    userId: account.user.id,
    leagueId: league.id,
    seasonId: season?.id || null,
    isAdmin: account.isAdmin,
  });
  return rows ? buildCosmeticsDashboard(rows) : emptyCosmeticsDashboard;
}

export async function cleanupMyLegacyCosmeticsPreview() {
  const account = await getCurrentAccount();
  if (!account.user || !account.isAdmin) return { success: false as const, error: "A prévia é exclusiva para administradores." };
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    const fantasySeasonId = await getSelectedFantasySeasonId(account.client);
    const result = await cosmeticsApi.cleanupLegacyCosmeticsPreview(fantasySeasonId);
    if (!result.success) return result;
    revalidatePath("/meu-perfil");
    revalidatePath("/jogadores");
    revalidatePath("/ranking");
    return result;
  }
  const fantasySeasonId = await getSelectedFantasySeasonId(account.client);
  const result = await cleanupLegacyCosmeticsPreview(fantasySeasonId,
    supabaseAdminCosmeticsCleanupGateway(account.client));
  if (!result.success) return result;
  revalidatePath("/meu-perfil");
  revalidatePath("/jogadores");
  revalidatePath("/ranking");
  return result;
}

export async function dismissMyUnopenedBronzePassPack() {
  const account = await getCurrentAccount();
  if (!account.user || !account.isAdmin) return { success: false as const, error: "A limpeza é exclusiva para administradores." };
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    const fantasySeasonId = await getSelectedFantasySeasonId(account.client);
    const result = await cosmeticsApi.dismissUnopenedBronzePassPack(fantasySeasonId);
    if (!result.success) return result;
    revalidatePath("/cartola");
    revalidatePath("/meu-perfil");
    return result;
  }
  const fantasySeasonId = await getSelectedFantasySeasonId(account.client);
  const result = await dismissUnopenedBronzePassPack(fantasySeasonId,
    supabaseAdminCosmeticsCleanupGateway(account.client));
  if (!result.success) return result;
  revalidatePath("/cartola");
  revalidatePath("/meu-perfil");
  return result;
}

export async function resetMyTestPassRewardClaims(fantasySeasonId: string) {
  const account = await getCurrentAccount();
  if (!account.user || !account.isAdmin) return { success: false as const, error: "A limpeza é exclusiva para administradores." };
  if (!fantasySeasonId) return { success: false as const, error: "Temporada do Passe não encontrada." };
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    const selectedFantasySeasonId = await getSelectedFantasySeasonId(account.client);
    const result = await cosmeticsApi.resetTestPassRewardClaims(fantasySeasonId, selectedFantasySeasonId);
    if (!result.success) return result;
    revalidatePath("/meu-perfil");
    revalidatePath("/jogadores");
    revalidatePath("/passe");
    return result;
  }
  const selectedFantasySeasonId = await getSelectedFantasySeasonId(account.client);
  const result = await resetTestPassRewardClaims(fantasySeasonId, selectedFantasySeasonId,
    supabaseAdminCosmeticsCleanupGateway(account.client));
  if (!result.success) return result;
  revalidatePath("/meu-perfil");
  revalidatePath("/jogadores");
  revalidatePath("/passe");
  return result;
}

export async function claimPassCosmetic(rewardId: string, cosmeticId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para resgatar sua recompensa." };
  const fantasySeasonId = await getSelectedFantasySeasonId(account.client);
  if (!fantasySeasonId) return { success: false, error: "Passe da pelada selecionada não encontrado." };
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    const result = await cosmeticsApi.claimPassCosmetic(rewardId, cosmeticId, fantasySeasonId);
    if (!result.success) return result;
    revalidatePath("/jogadores"); revalidatePath("/meu-perfil");
    return result;
  }
  const result = await claimSeasonPassCosmetic({ rewardId, cosmeticId, fantasySeasonId },
    supabaseSeasonPassMutationGateway(account.client));
  if (!result.success) return result;
  revalidatePath("/jogadores"); revalidatePath("/meu-perfil");
  return result;
}

export async function purchaseSeasonPassShopItem(shopItemId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para comprar um item da loja." };
  if (!shopItemId) return { success: false, error: "Item da loja inválido." };
  const fantasySeasonId = await getSelectedFantasySeasonId(account.client);
  if (!fantasySeasonId) return { success: false, error: "Passe da pelada selecionada não encontrado." };
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    const result = await cosmeticsApi.purchaseSeasonPassShopItem(shopItemId, fantasySeasonId);
    if (!result.success) return result;
    revalidatePath("/jogadores");
    revalidatePath("/meu-perfil");
    revalidatePath("/ranking");
    return result;
  }
  const result = await purchaseSeasonPassItem({ shopItemId, fantasySeasonId, userId: account.user.id },
    supabaseSeasonPassMutationGateway(account.client));
  if (!result.success) return result;
  revalidatePath("/jogadores");
  revalidatePath("/meu-perfil");
  revalidatePath("/ranking");
  return result;
}

export async function equipCosmetic(slot: CosmeticSlot, cosmeticId: string | null) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para personalizar o perfil." };
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    const result = await cosmeticsApi.equipCosmetic(slot, cosmeticId);
    if (!result.success) return result;
    revalidatePath("/meu-perfil");
    revalidatePath("/jogadores");
    revalidatePath("/jogadores/[id]", "page");
    revalidatePath("/", "layout");
    revalidatePath("/ranking");
    revalidatePath("/elenco");
    revalidatePath("/cartola");
    return result;
  }
  const result = await equipAccountCosmetic(slot, cosmeticId,
    supabaseAccountCosmeticEquipmentGateway(account.client));
  if (!result.success) return result;
  revalidatePath("/meu-perfil");
  revalidatePath("/jogadores");
  revalidatePath("/jogadores/[id]", "page");
  revalidatePath("/", "layout");
  revalidatePath("/ranking");
  revalidatePath("/elenco");
  revalidatePath("/cartola");
  return result;
}

export async function getAdminCosmeticsPreview(playerId: string, requested: CosmeticPreviewLoadout): Promise<EquippedCosmeticsSummary | null> {
  const account = await getCurrentAccount();
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    return cosmeticsApi.getAdminCosmeticsPreview(playerId, requested, account.profile?.player_id || null, account.isAdmin);
  }
  return resolveAdminCosmeticsPreview({
    isAdmin: account.isAdmin,
    ownPlayerId: account.profile?.player_id || null,
    playerId,
    requested,
  }, supabaseAdminPreviewGateway(account.client));
}

const getMyEquippedCosmeticsCached = cache(async (): Promise<EquippedCosmeticsSummary | null> => {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    return cosmeticsApi.getMyEquippedCosmetics();
  }
  const loadout = await readAccountCosmeticLoadout(account.client, account.user.id);
  return buildEquippedCosmeticsSummary(loadout);
});

export async function getMyEquippedCosmetics(): Promise<EquippedCosmeticsSummary | null> {
  return getMyEquippedCosmeticsCached();
}

export async function getPlayerEquippedCosmetics(playerId: string): Promise<EquippedCosmeticsSummary | null> {
  const account = await getCurrentAccount();
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    return cosmeticsApi.getPlayerEquippedCosmetics(playerId);
  }
  const loadout = await readPlayerCosmeticLoadout(account.client, playerId);
  return buildEquippedCosmeticsSummary(loadout);
}

export async function getAllPlayersEquippedCosmeticsMap(playerIds?: string[]): Promise<Map<string, EquippedCosmeticsSummary>> {
  if (playerIds && playerIds.length === 0) return new Map();
  const account = await getCurrentAccount();
  const cosmeticsApi = await cosmeticsApiFor(account.client);
  if (cosmeticsApi) {
    return cosmeticsApi.getAllPlayersEquippedCosmeticsMap(playerIds);
  }
  const { profiles, loadouts } = await readPlayersCosmeticLoadouts(account.client, playerIds);
  return buildPlayersEquippedCosmeticsMap(profiles, loadouts);
}
