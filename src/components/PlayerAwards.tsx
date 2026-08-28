import Link from "next/link";
import { Medal, Sparkles, Target } from "@/components/icons";
import type { PlayerAwardSeason, PlayerAwardType } from "@/lib/awards";
import { formatDate } from "@/lib/utils";

const AWARDS: Array<{
  type: PlayerAwardType;
  label: string;
  Icon: typeof Target;
}> = [
  { type: "topScorer", label: "Artilheiro da rodada", Icon: Target },
  { type: "topAssister", label: "Garçom da rodada", Icon: Sparkles },
  { type: "bestGoalkeeper", label: "Melhor goleiro", Icon: Medal },
  { type: "bestDefender", label: "Xerife da rodada", Icon: Medal },
  { type: "seasonTopScorer", label: "Artilheiro da temporada", Icon: Target },
  { type: "seasonTopAssister", label: "Garçom da temporada", Icon: Sparkles },
];

export function PlayerAwards({
  seasons,
  context = "profile",
}: {
  seasons: PlayerAwardSeason[];
  context?: "profile" | "card";
}) {
  if (seasons.length === 0) {
    return context === "profile" ? <p className="text-sm text-muted">Ainda não há insígnias.</p> : null;
  }

  return (
    <div className={context === "card" ? `grid gap-2 ${seasons.length > 1 ? "grid-cols-2" : "grid-cols-1"}` : "space-y-3"}>
      {seasons.map((season) => (
        <section
          key={season.seasonId}
          className={context === "card"
            ? "min-w-0 rounded-xl border border-current/20 bg-white/10 p-2"
            : "glass-card p-4"}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-[9px] font-black uppercase tracking-wider opacity-75">
              {context === "card"
                ? season.seasonStatus === "active" ? "Temporada atual" : "Temporada passada"
                : `Temporada ${season.seasonNumber}`}
            </h4>
            {context === "profile" && (
              <span className="text-[9px] font-bold uppercase text-muted">
                {season.seasonStatus === "active" ? "Atual" : "Encerrada"}
              </span>
            )}
          </div>

          <div className={context === "card" ? "space-y-1.5" : "grid gap-2 sm:grid-cols-3"}>
            {AWARDS.map(({ type, label, Icon }) => {
              const awards = season.awards.filter((award) => award.type === type);
              if (awards.length === 0) return null;
              const isSeasonAward = type === "seasonTopScorer" || type === "seasonTopAssister";
              const visibleLabel = isSeasonAward && season.seasonStatus === "active"
                ? type === "seasonTopScorer" ? "Líder de gols" : "Líder de assistências"
                : label;

              return (
                <details key={type} className="group rounded-lg border border-current/20 bg-black/5 open:bg-black/10">
                  <summary className="flex cursor-pointer list-none items-center justify-center gap-1 px-2 py-1.5 text-[9px] font-black uppercase tracking-wide [&::-webkit-details-marker]:hidden">
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{visibleLabel}{isSeasonAward ? "" : ` ${awards.length}x`}</span>
                  </summary>
                  <div className="space-y-1 border-t border-current/15 px-2 py-2 text-left">
                    {awards.map((award) => isSeasonAward ? (
                      <div key={`${award.type}-${award.roundId}`} className="rounded px-1 py-1 text-[9px] font-bold leading-tight">
                        {season.seasonStatus === "active" ? "Liderança provisória" : "Título da temporada"}
                      </div>
                    ) : (
                      <Link
                        key={`${award.type}-${award.roundId}`}
                        href={`/rodadas/${award.roundId}`}
                        className="block rounded px-1 py-1 text-[9px] font-bold leading-tight hover:bg-white/10"
                      >
                        Rodada {String(award.roundNumber).padStart(2, "0")} · {formatDate(award.roundDate)}
                      </Link>
                    ))}
                  </div>
                </details>
              );
            })}
            {season.awards.length === 0 && (
              <p className="py-1 text-center text-[9px] font-bold opacity-55">Sem insígnias</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
