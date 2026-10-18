import type { CosmeticLoadoutRelations, EquippedCosmeticsSummary, PlayerCosmeticProfile } from "../domain/equipped-summary";

export function buildEquippedCosmeticsSummary(loadout: CosmeticLoadoutRelations | null): EquippedCosmeticsSummary | null {
  if (!loadout) return null;
  return {
    frameKey: loadout.frame?.asset_key || null,
    auraKey: loadout.aura?.asset_key || null,
    titleName: loadout.title?.name || null,
    bannerAssetKey: loadout.banner?.asset_key || null,
    nameplateKey: loadout.nameplate?.asset_key || null,
    backgroundAssetKey: loadout.background?.asset_key || null,
    showcaseAssetKey: loadout.showcase?.asset_key || null,
    pitchAssetKey: loadout.pitch?.asset_key || null,
  };
}

export function buildPlayersEquippedCosmeticsMap(
  profiles: PlayerCosmeticProfile[],
  loadouts: CosmeticLoadoutRelations[],
): Map<string, EquippedCosmeticsSummary> {
  const userToPlayer = new Map(profiles.map((profile) => [profile.user_id, profile.player_id]));
  const result = new Map<string, EquippedCosmeticsSummary>();
  for (const loadout of loadouts) {
    const playerId = userToPlayer.get(loadout.user_id);
    if (!playerId) continue;
    const summary = buildEquippedCosmeticsSummary(loadout);
    if (summary) result.set(playerId, summary);
  }
  return result;
}
