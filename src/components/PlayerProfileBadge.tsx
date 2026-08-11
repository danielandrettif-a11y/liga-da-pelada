import { getPlayerProfile, PLAYER_PROFILE_STYLES } from "@/lib/playerProfiles";
import type { PlayerProfile } from "@/lib/types";

export function PlayerProfileBadge({ profile, isGoalkeeper = false }: { profile?: PlayerProfile | null; isGoalkeeper?: boolean }) {
  const option = getPlayerProfile(profile);

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black tracking-wider ${PLAYER_PROFILE_STYLES[option.value]}`}>
        {option.shortLabel}
      </span>
      {isGoalkeeper && (
        <span className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[9px] font-black tracking-wider text-accent">
          GOL
        </span>
      )}
    </span>
  );
}
