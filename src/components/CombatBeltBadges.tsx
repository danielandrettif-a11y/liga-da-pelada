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
            "relative inline-flex items-center rounded-sm border border-amber-300/40 bg-[#171109] text-amber-100 shadow-sm",
            compact ? "min-h-5 px-1.5 py-0.5" : "min-h-7 px-2 py-1",
          )}
        >
          <span aria-hidden="true" className="absolute left-0 top-1/2 h-2 w-1 -translate-y-1/2 bg-amber-300/35" />
          <span aria-hidden="true" className="absolute right-0 top-1/2 h-2 w-1 -translate-y-1/2 bg-amber-300/35" />
          <span className={cn("mr-1 flex items-center justify-center border border-amber-200/50 bg-amber-300/15 text-amber-200", compact ? "size-3.5" : "size-4")}>
            <Trophy className={compact ? "size-2.5" : "size-3"} />
          </span>
          <span className={cn("font-black uppercase leading-none", compact ? "text-[7px]" : "text-[9px]")}>{SHORT_LABEL[belt.slug]}</span>
          <span className={cn("ml-1 border-l border-amber-300/25 pl-1 font-athletic font-black tabular-nums text-amber-300", compact ? "text-[8px]" : "text-[10px]")}>{belt.recordValue}</span>
        </span>
      ))}
    </div>
  );
}
