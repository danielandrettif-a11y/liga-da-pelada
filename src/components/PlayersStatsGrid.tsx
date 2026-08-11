"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SlidersHorizontal } from "@/components/icons";
import type { Player } from "@/lib/types";
import { calculateWinRate, getDisplayName } from "@/lib/utils";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";

export type PlayerStats = Player & {
  rounds: number;
  games: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
};

type SortOption = "alphabetical" | "games" | "rounds" | "goals" | "assists" | "wins" | "losses" | "winRate";

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "alphabetical", label: "Ordem alfabética" },
  { value: "games", label: "Mais jogos" },
  { value: "rounds", label: "Mais peladas" },
  { value: "goals", label: "Mais gols" },
  { value: "assists", label: "Mais assistências" },
  { value: "wins", label: "Mais vitórias" },
  { value: "losses", label: "Mais derrotas" },
  { value: "winRate", label: "Melhor aproveitamento" },
];

function alphabeticalCompare(a: PlayerStats, b: PlayerStats) {
  return getDisplayName(a.name).localeCompare(getDisplayName(b.name), "pt-BR");
}

export function PlayersStatsGrid({ players }: { players: PlayerStats[] }) {
  const [sortBy, setSortBy] = useState<SortOption>("alphabetical");
  const sortedPlayers = useMemo(() => [...players].sort((a, b) => {
    if (sortBy === "alphabetical") return alphabeticalCompare(a, b);
    const aValue = sortBy === "winRate" ? calculateWinRate(a.wins, a.draws, a.games) : a[sortBy];
    const bValue = sortBy === "winRate" ? calculateWinRate(b.wins, b.draws, b.games) : b[sortBy];
    return bValue - aValue || alphabeticalCompare(a, b);
  }), [players, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-accent" />
        <label htmlFor="players-sort" className="shrink-0 text-[10px] font-black uppercase tracking-wider text-muted">Ordenar</label>
        <select
          id="players-sort"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortOption)}
          className="min-w-0 flex-1 bg-transparent text-right text-xs font-bold text-foreground outline-none"
        >
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value} className="bg-surface text-foreground">{option.label}</option>)}
        </select>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3">
        {sortedPlayers.map((player, index) => (
          <Link key={player.id} href={`/jogadores/${player.id}`} className="block h-full min-w-0">
            <div className={`player-stat-card h-full min-w-0 rounded-2xl p-3.5 animate-fade-in stagger-${Math.min(index + 1, 5)}`}>
              <div className="mb-3 flex items-center gap-3">
                <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="h-11 w-11 flex-shrink-0 rounded-full border border-accent/25 bg-surface-hover text-sm font-bold text-muted ring-2 ring-background shadow-[0_0_16px_rgba(204,255,0,.08)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{getDisplayName(player.name)}</p>
                  <PlayerProfileBadge profile={player.player_profile} />
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/5 bg-black/15 px-2 py-2 text-center shadow-inner"><p className="player-card-number text-xl text-foreground">{player.rounds}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-muted">Peladas</p></div>
                <div className="rounded-lg border border-white/5 bg-black/15 px-2 py-2 text-center shadow-inner"><p className="player-card-number text-xl text-foreground">{player.games}</p><p className="mt-1 text-[8px] font-black uppercase tracking-wider text-muted">Jogos</p></div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div><p className="text-[9px] font-bold uppercase tracking-wide text-muted">Gols</p><p className="player-card-number mt-0.5 text-base text-foreground">{player.goals}</p></div>
                <div><p className="text-[9px] font-bold uppercase tracking-wide text-muted">Assists</p><p className="player-card-number mt-0.5 text-base text-foreground">{player.assists}</p></div>
                <div><p className="text-[9px] font-bold uppercase tracking-wide text-muted">Vitórias</p><p className="player-card-number mt-0.5 text-base text-foreground">{player.wins}</p></div>
                <div><p className="text-[9px] font-bold uppercase tracking-wide text-muted">Aprov.</p><p className="player-card-number mt-0.5 text-base text-foreground">{calculateWinRate(player.wins, player.draws, player.games)}%</p></div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-muted">Pontos</span>
                <span className="player-card-points text-2xl">{player.points}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
