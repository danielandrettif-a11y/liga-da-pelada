export type EquippedCosmeticsSummary = {
  frameKey: string | null;
  auraKey: string | null;
  titleName: string | null;
  bannerAssetKey: string | null;
  nameplateKey: string | null;
  backgroundAssetKey: string | null;
  showcaseAssetKey: string | null;
  pitchAssetKey: string | null;
};

export type CosmeticLoadoutRelations = {
  user_id: string;
  frame?: { asset_key: string | null } | null;
  aura?: { asset_key: string | null } | null;
  title?: { name: string | null } | null;
  banner?: { asset_key: string | null } | null;
  nameplate?: { asset_key: string | null } | null;
  background?: { asset_key: string | null } | null;
  showcase?: { asset_key: string | null } | null;
  pitch?: { asset_key: string | null } | null;
};

export type PlayerCosmeticProfile = { user_id: string; player_id: string };
