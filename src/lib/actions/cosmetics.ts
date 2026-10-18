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
import { readCosmeticsDashboardRows } from "@/modules/cosmetics/infrastructure/supabase-dashboard-reader";
import { readAccountCosmeticLoadout, readPlayerCosmeticLoadout, readPlayersCosmeticLoadouts } from "@/modules/cosmetics/infrastructure/supabase-loadout-reader";
import type { CosmeticsDashboard } from "@/modules/cosmetics/domain/dashboard-types";
import type { EquippedCosmeticsSummary } from "@/modules/cosmetics/domain/equipped-summary";

export type { CosmeticPassReward, SeasonPassShopItem, SeasonPassShop, CosmeticsDashboard } from "@/modules/cosmetics/domain/dashboard-types";
export type { EquippedCosmeticsSummary } from "@/modules/cosmetics/domain/equipped-summary";

async function getSelectedFantasySeasonId(client: any): Promise<string | null> {
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return null;
  const { data } = await client.from("fantasy_seasons").select("id")
    .eq("season_id", season.id).eq("league_id", league.id).maybeSingle();
  return data?.id || null;
}

export async function getMyCosmeticsDashboard(): Promise<CosmeticsDashboard> {
  const account = await getCurrentAccount();
  if (!account.user) return emptyCosmeticsDashboard;
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
  if (!account.user || !account.isAdmin) return { success: false, error: "A prévia é exclusiva para administradores." };
  const client: any = account.client;
  const fantasySeasonId = await getSelectedFantasySeasonId(client);
  if (!fantasySeasonId) return { success: false, error: "Passe da pelada selecionada não encontrado." };
  const { data, error } = await client.rpc("cleanup_my_cosmetics_preview", { p_fantasy_season_id: fantasySeasonId });
  if (error) return { success: false, error: error.message };
  revalidatePath("/meu-perfil");
  revalidatePath("/jogadores");
  revalidatePath("/ranking");
  return { success: true, removed: Number(data || 0) };
}

export async function dismissMyUnopenedBronzePassPack() {
  const account = await getCurrentAccount();
  if (!account.user || !account.isAdmin) return { success: false, error: "A limpeza é exclusiva para administradores." };
  const client: any = account.client;
  const fantasySeasonId = await getSelectedFantasySeasonId(client);
  if (!fantasySeasonId) return { success: false, error: "Passe da pelada selecionada não encontrado." };
  const { data, error } = await client.rpc("dismiss_my_unopened_bronze_pass_pack", { p_fantasy_season_id: fantasySeasonId });
  if (error) return { success: false, error: error.message };
  revalidatePath("/cartola");
  revalidatePath("/meu-perfil");
  return { success: true, dismissed: Number(data || 0) };
}

export async function resetMyTestPassRewardClaims(fantasySeasonId: string) {
  const account = await getCurrentAccount();
  if (!account.user || !account.isAdmin) return { success: false, error: "A limpeza é exclusiva para administradores." };
  if (!fantasySeasonId) return { success: false, error: "Temporada do Passe não encontrada." };
  const client: any = account.client;
  if (fantasySeasonId !== await getSelectedFantasySeasonId(client))
    return { success: false, error: "Passe não pertence à pelada selecionada." };
  const { data, error } = await client.rpc("reset_my_test_pass_cosmetic_claims", { p_fantasy_season_id: fantasySeasonId });
  if (error) return { success: false, error: error.message };
  revalidatePath("/meu-perfil");
  revalidatePath("/jogadores");
  revalidatePath("/passe");
  return { success: true, removed: Number(data || 0) };
}

export async function claimPassCosmetic(rewardId: string, cosmeticId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para resgatar sua recompensa." };
  const fantasySeasonId = await getSelectedFantasySeasonId(account.client);
  if (!fantasySeasonId) return { success: false, error: "Passe da pelada selecionada não encontrado." };
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

export type CosmeticPreviewLoadout = Partial<Record<CosmeticSlot, string | null>>;

/**
 * Resolve a combinação temporária enviada pelo provador para a página pública
 * do próprio administrador. Os IDs da URL nunca são aceitos cegamente: cada
 * item precisa existir no catálogo e pertencer exatamente ao slot solicitado.
 */
export async function getAdminCosmeticsPreview(playerId: string, requested: CosmeticPreviewLoadout): Promise<EquippedCosmeticsSummary | null> {
  const account = await getCurrentAccount();
  if (!account.isAdmin || !account.profile?.player_id || account.profile.player_id !== playerId) return null;

  const selections = (Object.entries(requested) as Array<[CosmeticSlot, string | null | undefined]>)
    .filter(([, cosmeticId]) => Boolean(cosmeticId));
  if (!selections.length) return null;

  const { data, error } = await account.client
    .from("fantasy_cosmetics")
    .select("id, slot, asset_key, name")
    .in("id", selections.map(([, cosmeticId]) => cosmeticId as string));
  if (error) return null;

  const itemsById = new Map((data || []).map((item: any) => [item.id, item]));
  const preview: EquippedCosmeticsSummary = {
    frameKey: null,
    auraKey: null,
    titleName: null,
    bannerAssetKey: null,
    nameplateKey: null,
    backgroundAssetKey: null,
    showcaseAssetKey: null,
    pitchAssetKey: null,
  };

  for (const [slot, cosmeticId] of selections) {
    const item = itemsById.get(cosmeticId);
    if (!item || item.slot !== slot) continue;
    if (slot === "frame") preview.frameKey = item.asset_key;
    if (slot === "aura") preview.auraKey = item.asset_key;
    if (slot === "title") preview.titleName = item.name;
    if (slot === "banner") preview.bannerAssetKey = item.asset_key;
    if (slot === "nameplate") preview.nameplateKey = item.asset_key;
    if (slot === "background") preview.backgroundAssetKey = item.asset_key;
    if (slot === "showcase") preview.showcaseAssetKey = item.asset_key;
    if (slot === "pitch") preview.pitchAssetKey = item.asset_key;
  }

  return preview;
}

const getMyEquippedCosmeticsCached = cache(async (): Promise<EquippedCosmeticsSummary | null> => {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const loadout = await readAccountCosmeticLoadout(account.client, account.user.id);
  return buildEquippedCosmeticsSummary(loadout);
});

export async function getMyEquippedCosmetics(): Promise<EquippedCosmeticsSummary | null> {
  return getMyEquippedCosmeticsCached();
}

export async function getPlayerEquippedCosmetics(playerId: string): Promise<EquippedCosmeticsSummary | null> {
  const account = await getCurrentAccount();
  const loadout = await readPlayerCosmeticLoadout(account.client, playerId);
  return buildEquippedCosmeticsSummary(loadout);
}

export async function getAllPlayersEquippedCosmeticsMap(playerIds?: string[]): Promise<Map<string, EquippedCosmeticsSummary>> {
  if (playerIds && playerIds.length === 0) return new Map();
  const account = await getCurrentAccount();
  const { profiles, loadouts } = await readPlayersCosmeticLoadouts(account.client, playerIds);
  return buildPlayersEquippedCosmeticsMap(profiles, loadouts);
}
