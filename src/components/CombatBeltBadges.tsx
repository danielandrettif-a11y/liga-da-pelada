import { Trophy } from "@/components/icons";
import type { PlayerAchievementBelt } from "@/lib/achievement-belts";
import { cn } from "@/lib/cn";

const SHORT_LABEL: Record<PlayerAchievementBelt["slug"], string> = {
  top_scorer: "Artilheiro",
  top_assister: "Garçom",
  team_win_streak: "Sequência",
};

export function CombatBeltBadges({ belts, compact = false, centered = false }: { belts?: PlayerAchievementBelt[]; compact?: boolean; centered?: boolean }) {
  if (!belts?.length) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", centered && "justify-center", compact ? "mt-1" : "mt-2")} aria-label="Cinturões em posse">
      {belts.map((belt) => (
        <span
          key={belt.slug}
          title={`${belt.name}: ${belt.recordValue} ${belt.unit}`}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-amber-300/50 bg-amber-950/80 px-2 py-1 text-amber-100 shadow-sm",
          )}
        >
          <Trophy aria-hidden="true" className="size-3.5 shrink-0 text-amber-300" />
          <span className={cn("font-bold leading-tight text-amber-100", compact ? "text-[10px]" : "text-xs")}>{SHORT_LABEL[belt.slug] || belt.name}</span>
          <span className="shrink-0 text-xs font-black tabular-nums text-amber-300">{belt.recordValue}</span>
        </span>
      ))}
    </div>
  );
}
