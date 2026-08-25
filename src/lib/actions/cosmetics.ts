"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import { getActiveLeague } from "./rounds";
import { getActiveSeason } from "./seasons";
import type { CosmeticItem, CosmeticSlot } from "@/lib/fantasy/cosmetics";

export type CosmeticPassReward = {
  id: string; house: number; rewardType: "cosmetic_choice" | "card_pack"; cardTier: "bronze" | "gold" | null;
  selectedCosmeticId: string | null; options: CosmeticItem[];
};
export type CosmeticsDashboard = {
  available: boolean; seasonId: string | null; cosmetics: CosmeticItem[]; rewards: CosmeticPassReward[];
  equipped: Partial<Record<CosmeticSlot, string | null>>; canPreviewAll: boolean;
};

const empty: CosmeticsDashboard = { available: false, seasonId: null, cosmetics: [], rewards: [], equipped: {}, canPreviewAll: false };
const mapCosmetic = (row: any): CosmeticItem => ({ id: row.id, slug: row.slug, slot: row.slot, rarity: row.rarity, name: row.name, description: row.description, assetKey: row.asset_key });

export async function getMyCosmeticsDashboard(): Promise<CosmeticsDashboard> {
  const account = await getCurrentAccount();
  if (!account.user) return empty;
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return empty;
  const client: any = account.client;
  const { data: fantasySeason } = await client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle();
  if (!fantasySeason) return empty;
  const [ownedResult, rewardResult, choiceResult, loadoutResult] = await Promise.all([
    client.from("fantasy_user_cosmetics").select("cosmetic:fantasy_cosmetics(*)").eq("user_id", account.user.id),
    client.from("fantasy_season_pass_rewards").select("id, house, reward_type, card_tier, options:fantasy_season_pass_reward_options(cosmetic:fantasy_cosmetics(*))").eq("fantasy_season_id", fantasySeason.id).order("house"),
    client.from("fantasy_user_cosmetic_reward_choices").select("reward_id, cosmetic_id").eq("user_id", account.user.id),
    client.from("fantasy_user_cosmetic_loadouts").select("*").eq("user_id", account.user.id).eq("fantasy_season_id", fantasySeason.id).maybeSingle(),
  ]);
  if (ownedResult.error || rewardResult.error) return empty;
  const choices = new Map((choiceResult.data || []).map((row: any) => [row.reward_id, row.cosmetic_id]));
  const loadout = loadoutResult.data || {};
  return {
    available: true, seasonId: fantasySeason.id, canPreviewAll: account.isAdmin,
    cosmetics: (ownedResult.data || []).map((row: any) => row.cosmetic).filter(Boolean).map(mapCosmetic),
    rewards: (rewardResult.data || []).map((row: any) => ({
      id: row.id, house: Number(row.house), rewardType: row.reward_type, cardTier: row.card_tier,
      selectedCosmeticId: choices.get(row.id) || null,
      options: (row.options || []).map((option: any) => option.cosmetic).filter(Boolean).map(mapCosmetic),
    })),
    equipped: {
      banner: loadout.banner_cosmetic_id || null, frame: loadout.frame_cosmetic_id || null, title: loadout.title_cosmetic_id || null,
      aura: loadout.aura_cosmetic_id || null, nameplate: loadout.nameplate_cosmetic_id || null, background: loadout.background_cosmetic_id || null,
    },
  };
}

export async function grantAllCosmeticsPreview() {
  const account = await getCurrentAccount();
  if (!account.user || !account.isAdmin) return { success: false, error: "A prévia é exclusiva para administradores." };
  const league = await getActiveLeague(); const season = await getActiveSeason(league.id);
  if (!season) return { success: false, error: "Temporada não encontrada." };
  const client: any = account.client;
  const { data: fantasySeason } = await client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle();
  if (!fantasySeason) return { success: false, error: "Passe indisponível." };
  const { data, error } = await client.rpc("grant_fantasy_cosmetics_preview", { p_fantasy_season_id: fantasySeason.id });
  if (error) return { success: false, error: error.message };
  revalidatePath("/meu-perfil");
  return { success: true, granted: Number(data || 0) };
}

export async function claimPassCosmetic(rewardId: string, cosmeticId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para resgatar sua recompensa." };
  const client: any = account.client;
  const { error } = await client.rpc("claim_fantasy_pass_cosmetic", { p_reward_id: rewardId, p_cosmetic_id: cosmeticId });
  if (error) return { success: false, error: error.message };
  revalidatePath("/jogadores"); revalidatePath("/meu-perfil");
  return { success: true };
}

export async function equipCosmetic(slot: CosmeticSlot, cosmeticId: string | null) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para personalizar o perfil." };
  const league = await getActiveLeague(); const season = await getActiveSeason(league.id);
  if (!season) return { success: false, error: "Temporada não encontrada." };
  const client: any = account.client;
  const { data: fantasySeason } = await client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle();
  if (!fantasySeason) return { success: false, error: "Passe indisponível." };
  const { error } = await client.rpc("equip_fantasy_cosmetic", { p_fantasy_season_id: fantasySeason.id, p_slot: slot, p_cosmetic_id: cosmeticId });
  if (error) return { success: false, error: error.message };
  revalidatePath("/meu-perfil");
  revalidatePath("/jogadores");
  revalidatePath("/");
  revalidatePath("/ranking");
  return { success: true };
}

export type EquippedCosmeticsSummary = {
  frameKey: string | null;
  auraKey: string | null;
  titleName: string | null;
  bannerAssetKey: string | null;
  nameplateKey: string | null;
};

export async function getMyEquippedCosmetics(): Promise<EquippedCosmeticsSummary | null> {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return null;
  const client: any = account.client;
  const { data: fantasySeason } = await client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle();
  if (!fantasySeason) return null;

  const { data: loadout } = await client
    .from("fantasy_user_cosmetic_loadouts")
    .select(`
      frame:frame_cosmetic_id(asset_key),
      aura:aura_cosmetic_id(asset_key),
      title:title_cosmetic_id(name),
      banner:banner_cosmetic_id(asset_key),
      nameplate:nameplate_cosmetic_id(asset_key)
    `)
    .eq("user_id", account.user.id)
    .eq("fantasy_season_id", fantasySeason.id)
    .maybeSingle();

  if (!loadout) return null;

  return {
    frameKey: loadout.frame?.asset_key || null,
    auraKey: loadout.aura?.asset_key || null,
    titleName: loadout.title?.name || null,
    bannerAssetKey: loadout.banner?.asset_key || null,
    nameplateKey: loadout.nameplate?.asset_key || null,
  };
}
