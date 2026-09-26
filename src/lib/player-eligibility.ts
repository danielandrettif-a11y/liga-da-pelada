import type { Player, PlayerProfile } from "./types";

type CompetitiveProfile = Pick<
  Player,
  "name" | "avatar_url" | "player_profile" | "overall_traits" | "member_category" | "is_selectable"
> & { is_competitive_profile_complete?: boolean };

const LINE_PROFILES: PlayerProfile[] = ["defensive", "midfield", "offensive"];

/** Espelho em TypeScript da coluna gerada pelo banco; aceita fixtures antigas sem a coluna. */
export function isCompetitiveProfileComplete(player: CompetitiveProfile | null | undefined) {
  if (!player) return false;
  if (typeof player.is_competitive_profile_complete === "boolean") {
    return player.is_competitive_profile_complete;
  }
  const traits = [...new Set((player.overall_traits || []).filter((trait) => LINE_PROFILES.includes(trait)))];
  return player.member_category === "player"
    && player.is_selectable
    && Boolean(player.name?.trim())
    && Boolean(player.avatar_url?.trim())
    && Boolean(player.player_profile && LINE_PROFILES.includes(player.player_profile))
    && traits.length >= 1
    && traits.length <= 2;
}

