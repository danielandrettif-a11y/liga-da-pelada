import { getPlayerProfile, PLAYER_PROFILE_STYLES } from "@/lib/playerProfiles";
import type { PlayerProfile } from "@/lib/types";

export function PlayerProfileBadge({ profile }: { profile?: PlayerProfile | null }) {
  const option = getPlayerProfile(profile);

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black tracking-wider ${PLAYER_PROFILE_STYLES[option.value]}`}>
      {option.shortLabel}
    </span>
  );
}
