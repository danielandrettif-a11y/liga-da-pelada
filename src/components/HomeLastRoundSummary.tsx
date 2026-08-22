"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardList } from "@/components/icons";
import { TeamCrest } from "@/components/TeamCrest";

const PREVIEW_MATCH_COUNT = 5;

export function HomeLastRoundSummary({ round }: { round: any }) {
  const [expanded, setExpanded] = useState(false);
  const matches = round.matches || [];
  const visibleMatches = expanded ? matches : matches.slice(0, PREVIEW_MATCH_COUNT);
  const remainingMatches = Math.max(0, matches.length - PREVIEW_MATCH_COUNT);

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-athletic text-base font-black uppercase italic tracking-wider text-foreground">
        <ClipboardList className="h-5 w-5 text-accent" /> Última Rodada
      </h2>

      <div className="glass-card glass-card-hover animate-fade-in-up overflow-hidden p-4">
        <Link href={`/rodadas/${round.id}`} className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-foreground">Rodada {String(round.number).padStart(2, "0")}</p>
          <span className="text-xs text-muted">{new Date(`${round.date}T00:00:00`).toLocaleDateString("pt-BR")}</span>
        </Link>

        {matches.length ? (
          <>
            <div className="space-y-2">
              {visibleMatches.map((match: any) => <MatchResult key={match.id} match={match} />)}
            </div>
            {remainingMatches > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface/70 px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-accent transition-colors hover:bg-surface-hover"
                aria-expanded={expanded}
              >
                {expanded ? "Ver menos partidas" : `Ver mais ${remainingMatches} partidas`}
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
            )}
          </>
        ) : <p className="py-2 text-center text-xs text-muted">Sem partidas registradas</p>}
      </div>
    </section>
  );
}

function MatchResult({ match }: { match: any }) {
  const teamA = match.teamA || { name: "Time A" };
  const teamB = match.teamB || { name: "Time B" };
  return (
    <div className="flex items-center gap-2 py-1.5 text-xs">
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <span className="truncate font-semibold text-foreground/80">{teamA.name}</span>
        <TeamCrest name={teamA.name} crestUrl={teamA.crest_url} color={teamA.color} className="h-4 w-4 shrink-0" />
      </div>
      <div className="flex min-w-[3.5rem] items-center justify-center gap-1.5 rounded-lg bg-surface px-2 py-1">
        <span className={`font-bold ${match.score_a > match.score_b ? "text-accent" : "text-foreground/60"}`}>{match.score_a}</span>
        <span className="text-muted">×</span>
        <span className={`font-bold ${match.score_b > match.score_a ? "text-accent" : "text-foreground/60"}`}>{match.score_b}</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <TeamCrest name={teamB.name} crestUrl={teamB.crest_url} color={teamB.color} className="h-4 w-4 shrink-0" />
        <span className="truncate font-semibold text-foreground/80">{teamB.name}</span>
      </div>
    </div>
  );
}
