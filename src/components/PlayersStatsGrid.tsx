"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { SlidersHorizontal } from "@/components/icons";
import type { Player } from "@/lib/types";
import { calculateWinRate, getDisplayName } from "@/lib/utils";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";
import { RosterUnreadLink } from "./RosterUnreadLink";
import type { EquippedCosmeticsSummary } from "@/lib/actions/cosmetics";
import { cosmeticBackgroundPosition, cosmeticHighResolutionImage, cosmeticVisual } from "@/lib/fantasy/cosmetics";

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

export function PlayersStatsGrid({
  players,
  unreadPlayerIds = new Set<string>(),
  playerCosmetics,
}: {
  players: PlayerStats[];
  unreadPlayerIds?: Set<string>;
  playerCosmetics?: Record<string, EquippedCosmeticsSummary>;
}) {
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
        {sortedPlayers.map((player, index) => {
          const cosmetic = playerCosmetics?.[player.id];
          const bannerImg = cosmeticHighResolutionImage(cosmetic?.bannerAssetKey);
          const cardGradient = cosmetic?.bannerAssetKey
            ? `bg-gradient-to-b ${cosmeticVisual(cosmetic.bannerAssetKey)}/30`
            : "";

          return (
            <RosterUnreadLink key={player.id} href={`/jogadores/${player.id}`} unread={unreadPlayerIds.has(player.id)} className="block h-full min-w-0">
              <div
                className={`player-stat-card relative overflow-hidden h-full min-w-0 rounded-2xl p-3.5 animate-fade-in stagger-${Math.min(index + 1, 5)} ${cardGradient} ${bannerImg ? "border-accent/30 shadow-lg" : ""}`}
              >
                {bannerImg && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden sm:h-32">
                    <Image
                      src={bannerImg}
                      alt=""
                      fill
                      quality={90}
                      sizes="(max-width: 768px) 50vw, 360px"
                      className="object-cover"
                      style={{ objectPosition: cosmeticBackgroundPosition("banner", cosmetic?.bannerAssetKey) }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-[#06150d]/30 to-[#06150d]" />
                  </div>
                )}
                {cosmetic?.bannerAssetKey && (
                  <div className="pointer-events-none absolute inset-0 opacity-15 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent via-transparent to-transparent" />
                )}

                <div className="relative z-10 flex flex-col h-full justify-between">
                  <div>
                    <div className="mb-3 flex items-center gap-3">
                      <PlayerAvatar
                        name={player.name}
                        avatarUrl={player.avatar_url}
                        frameKey={cosmetic?.frameKey}
                        auraKey={cosmetic?.auraKey}
                        className="h-11 w-11 flex-shrink-0 rounded-full border border-accent/25 bg-surface-hover text-sm font-bold text-muted ring-2 ring-background shadow-[0_0_16px_rgba(204,255,0,.08)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground drop-shadow-sm">{getDisplayName(player.name)}</p>
                        <PlayerProfileBadge profile={player.player_profile} isGoalkeeper={player.is_goalkeeper} />
                      </div>
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-white/5 bg-black/35 backdrop-blur-xs px-2 py-2 text-center shadow-inner">
                        <p className="player-card-number text-xl text-foreground">{player.rounds}</p>
                        <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-muted">Peladas</p>
                      </div>
                      <div className="rounded-lg border border-white/5 bg-black/35 backdrop-blur-xs px-2 py-2 text-center shadow-inner">
                        <p className="player-card-number text-xl text-foreground">{player.games}</p>
                        <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-muted">Jogos</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <div><p className="text-[9px] font-bold uppercase tracking-wide text-muted">Gols</p><p className="player-card-number mt-0.5 text-base text-foreground">{player.goals}</p></div>
                      <div><p className="text-[9px] font-bold uppercase tracking-wide text-muted">Assists</p><p className="player-card-number mt-0.5 text-base text-foreground">{player.assists}</p></div>
                      <div><p className="text-[9px] font-bold uppercase tracking-wide text-muted">Vitórias</p><p className="player-card-number mt-0.5 text-base text-foreground">{player.wins}</p></div>
                      <div><p className="text-[9px] font-bold uppercase tracking-wide text-muted">Aprov.</p><p className="player-card-number mt-0.5 text-base text-foreground">{calculateWinRate(player.wins, player.draws, player.games)}%</p></div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border/80 pt-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.16em] text-muted">Pontos</span>
                    <span className="player-card-points text-2xl drop-shadow-sm">{player.points}</span>
                  </div>
                </div>
              </div>
            </RosterUnreadLink>
          );
        })}
      </div>
    </div>
  );
}
