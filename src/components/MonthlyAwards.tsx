import { Crown, Medal, Trophy } from "@/components/icons";
import { formatAwardMonth, formatAwardPerformance, MONTHLY_AWARD_LABELS, type MonthlyAward } from "@/lib/monthly-awards";

export function MonthlyAwards({ awards }: { awards: MonthlyAward[] }) {
  if (awards.length === 0) return null;
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2">
      {awards.map((award) => {
        const Icon = award.type === "bestManagerMonth" ? Trophy : award.type === "bestWagMonth" ? Crown : Medal;
        const isWagAward = award.type === "bestWagMonth";
        return (
          <article key={`${award.type}-${award.periodStart}`} className="relative overflow-hidden rounded-xl border border-amber-300/30 bg-gradient-to-br from-amber-300/15 via-surface to-surface p-3">
            <div className="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-amber-300/10 blur-xl" />
            <div className="relative flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-300 text-background"><Icon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase text-amber-200">{MONTHLY_AWARD_LABELS[award.type]}</p>
                <p className="mt-0.5 text-xs font-bold text-foreground">{formatAwardMonth(award.periodStart)}</p>
                <p className="mt-1 text-[9px] text-muted">{formatAwardPerformance(award)}{isWagAward ? "" : ` · ${award.roundsPlayed} rodada${award.roundsPlayed === 1 ? "" : "s"}`}</p>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${award.isFinal || isWagAward ? "bg-amber-300/20 text-amber-200" : "bg-sky-400/15 text-sky-300"}`}>{isWagAward ? "Homenagem mensal" : award.isFinal ? "Título conquistado" : "Liderança provisória"}</span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
