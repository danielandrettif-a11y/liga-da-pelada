"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardList, Football, Target, X } from "@/components/icons";
import { TeamCrest } from "@/components/TeamCrest";

const PREVIEW_MATCH_COUNT = 5;

type MatchEvent = {
  id: string;
  match_id: string;
  event_type: string;
  player_id: string;
  assist_player_id?: string | null;
  team_id: string;
  minute?: number | null;
  player?: { id: string; name: string; avatar_url?: string | null } | null;
  assist_player?: { id: string; name: string; avatar_url?: string | null } | null;
};

export function HomeLastRoundSummary({ round }: { round: any }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

  const matches = round.matches || [];
  const visibleMatches = expanded ? matches : matches.slice(0, PREVIEW_MATCH_COUNT);
  const remainingMatches = Math.max(0, matches.length - PREVIEW_MATCH_COUNT);

  useEffect(() => {
    if (!selectedMatch) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedMatch(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedMatch]);

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
            <div className="space-y-1.5">
              {visibleMatches.map((match: any) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => setSelectedMatch(match)}
                  className="w-full rounded-xl transition-colors hover:bg-surface-hover/80 active:scale-[0.99] text-left"
                  title="Toque para ver gols e assistências"
                >
                  <MatchResult match={match} />
                </button>
              ))}
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
        ) : (
          <p className="py-2 text-center text-xs text-muted">Sem partidas registradas</p>
        )}
      </div>

      {/* Modal de Detalhes da Partida (Gols e Assistências) */}
      {selectedMatch && (
        <MatchDetailsModal
          match={selectedMatch}
          roundNumber={round.number}
          roundId={round.id}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </section>
  );
}

function MatchResult({ match }: { match: any }) {
  const teamA = match.teamA || { name: "Time A" };
  const teamB = match.teamB || { name: "Time B" };
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 text-xs">
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <span className="truncate font-semibold text-foreground/80">{teamA.name}</span>
        <TeamCrest name={teamA.name} crestUrl={teamA.crest_url} color={teamA.color} className="h-4 w-4 shrink-0" />
      </div>
      <div className="flex min-w-[3.5rem] items-center justify-center gap-1.5 rounded-lg bg-surface px-2 py-1 shadow-inner border border-white/5">
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

function MatchDetailsModal({
  match,
  roundNumber,
  roundId,
  onClose,
}: {
  match: any;
  roundNumber: number;
  roundId: string;
  onClose: () => void;
}) {
  const teamA = match.teamA || { name: "Time A", color: "#22c55e" };
  const teamB = match.teamB || { name: "Time B", color: "#3b82f6" };
  const events: MatchEvent[] = match.match_events || [];

  const teamAGoals = events.filter(
    (ev) => ev.team_id === (match.team_a_id || teamA.id) || (ev.player && match.score_a > 0 && ev.team_id === teamA.id)
  );
  const teamBGoals = events.filter(
    (ev) => ev.team_id === (match.team_b_id || teamB.id) || (ev.player && match.score_b > 0 && ev.team_id === teamB.id)
  );

  return (
    <div
      className="mobile-dialog-backdrop z-[99999] bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes da partida"
    >
      <div
        className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#06150d] p-5 shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Cabeçalho */}
        <div className="text-center pr-6">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-accent">
            Rodada {String(roundNumber).padStart(2, "0")} · Resultado
          </p>
        </div>

        {/* Placar Destaque */}
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="flex flex-1 flex-col items-center text-center">
            <TeamCrest name={teamA.name} crestUrl={teamA.crest_url} color={teamA.color} className="h-10 w-10 shrink-0" />
            <span className="mt-1.5 max-w-[100px] truncate text-xs font-black text-foreground">{teamA.name}</span>
          </div>

          <div className="flex items-center gap-2 px-3">
            <span className="font-athletic text-3xl font-black text-foreground">{match.score_a}</span>
            <span className="text-sm font-bold text-muted">×</span>
            <span className="font-athletic text-3xl font-black text-foreground">{match.score_b}</span>
          </div>

          <div className="flex flex-1 flex-col items-center text-center">
            <TeamCrest name={teamB.name} crestUrl={teamB.crest_url} color={teamB.color} className="h-10 w-10 shrink-0" />
            <span className="mt-1.5 max-w-[100px] truncate text-xs font-black text-foreground">{teamB.name}</span>
          </div>
        </div>

        {/* Gols e Assistências */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5">
            <Football className="h-4 w-4 text-accent" />
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Gols & Assistências</h3>
          </div>

          {events.length > 0 ? (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {events.map((event) => {
                const isTeamA = event.team_id === (match.team_a_id || teamA.id);
                const teamName = isTeamA ? teamA.name : teamB.name;
                const playerName = event.player?.name || "Gol";
                const assistName = event.assist_player?.name || null;

                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-surface/50 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Football className="h-3.5 w-3.5 shrink-0 text-accent" />
                        <span className="truncate font-black text-foreground">{playerName}</span>
                        {event.minute !== null && event.minute !== undefined && (
                          <span className="text-[10px] text-muted">{event.minute}&apos;</span>
                        )}
                      </div>
                      {assistName && (
                        <div className="mt-0.5 flex items-center gap-1 pl-5 text-[10px] text-muted">
                          <Target className="h-3 w-3 text-muted/70" />
                          <span className="truncate">Passe: <span className="font-semibold text-foreground/80">{assistName}</span></span>
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-[9px] font-bold text-muted">{teamName}</span>
                  </div>
                );
              })}
            </div>
          ) : match.score_a === 0 && match.score_b === 0 ? (
            <p className="py-3 text-center text-xs text-muted">Partida empatada sem gols (0 × 0).</p>
          ) : (
            <p className="py-3 text-center text-xs text-muted">Nenhum evento detalhado registrado para esta partida.</p>
          )}
        </div>

        {/* Link para Rodada */}
        <Link
          href={`/rodadas/${roundId}`}
          className="mt-4 flex w-full items-center justify-center rounded-xl bg-accent py-2.5 text-xs font-black uppercase tracking-wider text-background transition-transform active:scale-95"
        >
          Ver Rodada Completa →
        </Link>
      </div>
    </div>
  );
}
