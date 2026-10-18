import type { SupabaseClient } from "@supabase/supabase-js";
import type { CosmeticLoadoutRelations, PlayerCosmeticProfile } from "../domain/equipped-summary";

const CURRENT_LOADOUT_RELATIONS = `
  user_id,
  frame:frame_cosmetic_id(asset_key),
  aura:aura_cosmetic_id(asset_key),
  title:title_cosmetic_id(name),
  banner:banner_cosmetic_id(asset_key),
  nameplate:nameplate_cosmetic_id(asset_key),
  background:background_cosmetic_id(asset_key),
  showcase:showcase_cosmetic_id(asset_key),
  pitch:pitch_cosmetic_id(asset_key)
`;

const LEGACY_LOADOUT_RELATIONS = `
  user_id,
  frame:frame_cosmetic_id(asset_key),
  aura:aura_cosmetic_id(asset_key),
  title:title_cosmetic_id(name),
  banner:banner_cosmetic_id(asset_key),
  nameplate:nameplate_cosmetic_id(asset_key),
  background:background_cosmetic_id(asset_key)
`;

export async function readAccountCosmeticLoadout(client: SupabaseClient, userId: string): Promise<CosmeticLoadoutRelations | null> {
  const current = await client.from("account_cosmetic_loadouts")
    .select(CURRENT_LOADOUT_RELATIONS).eq("user_id", userId).maybeSingle();
  if (!current.error) return current.data as unknown as CosmeticLoadoutRelations | null;
  // Bancos ainda sem os slots showcase/pitch continuam exibindo os seis antigos.
  const legacy = await client.from("account_cosmetic_loadouts")
    .select(LEGACY_LOADOUT_RELATIONS).eq("user_id", userId).maybeSingle();
  return legacy.data as unknown as CosmeticLoadoutRelations | null;
}

async function readCosmeticLoadouts(client: SupabaseClient, userIds?: string[]): Promise<CosmeticLoadoutRelations[] | null> {
  const query = (selection: string) => {
    const request = client.from("account_cosmetic_loadouts").select(selection);
    return userIds ? request.in("user_id", userIds) : request;
  };
  const current = await query(CURRENT_LOADOUT_RELATIONS);
  if (!current.error) return current.data as unknown as CosmeticLoadoutRelations[] | null;
  const legacy = await query(LEGACY_LOADOUT_RELATIONS);
  return legacy.data as unknown as CosmeticLoadoutRelations[] | null;
}

export async function readPlayerCosmeticLoadout(client: SupabaseClient, playerId: string): Promise<CosmeticLoadoutRelations | null> {
  const { data: profile } = await client.from("account_profiles")
    .select("user_id").eq("player_id", playerId).maybeSingle();
  if (!profile?.user_id) return null;
  return readAccountCosmeticLoadout(client, profile.user_id);
}

export async function readPlayersCosmeticLoadouts(
  client: SupabaseClient,
  playerIds?: string[],
): Promise<{ profiles: PlayerCosmeticProfile[]; loadouts: CosmeticLoadoutRelations[] }> {
  if (playerIds && playerIds.length === 0) return { profiles: [], loadouts: [] };
  if (playerIds) {
    const { data } = await client.from("account_profiles")
      .select("user_id, player_id").in("player_id", [...new Set(playerIds)]);
    const profiles = (data || []) as PlayerCosmeticProfile[];
    const userIds = [...new Set(profiles.map((profile) => profile.user_id))];
    if (userIds.length === 0) return { profiles, loadouts: [] };
    const loadouts = await readCosmeticLoadouts(client, userIds);
    return { profiles, loadouts: loadouts || [] };
  }
  const [profilesResult, loadouts] = await Promise.all([
    client.from("account_profiles").select("user_id, player_id").not("player_id", "is", null),
    readCosmeticLoadouts(client),
  ]);
  return {
    profiles: (profilesResult.data || []) as PlayerCosmeticProfile[],
    loadouts: loadouts || [],
  };
}
