"use client";

import { getInitials } from "@/lib/utils";
import type { Player } from "@/lib/types";

type PitchPlayer = {
  player_id: string;
  players: Player | null;
};

type TeamMiniPitchProps = {
  team: {
    id: string;
    name: string;
    color: string;
    team_players: PitchPlayer[];
  };
  index: number;
  selectedPlayerId?: string;
  onPlayerClick?: (player: Player) => void;
};

const POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[26, 50], [74, 50]],
  3: [[50, 23], [26, 70], [74, 70]],
  4: [[26, 28], [74, 28], [26, 72], [74, 72]],
  5: [[50, 17], [26, 48], [74, 48], [26, 79], [74, 79]],
  6: [[26, 18], [74, 18], [26, 50], [74, 50], [26, 82], [74, 82]],
};

export function TeamMiniPitch({ team, index, selectedPlayerId, onPlayerClick }: TeamMiniPitchProps) {
  const players = team.team_players
    .map((entry) => entry.players)
    .filter((player): player is Player => Boolean(player))
    .slice(0, 6);
  const positions = POSITIONS[Math.max(1, players.length)];

  return (
    <article className={`glass-card min-w-0 overflow-hidden p-1.5 animate-fade-in-up stagger-${Math.min(index + 1, 5)}`}>
      <div className="mb-1.5 flex min-w-0 items-center gap-1.5 px-0.5 py-0.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor]"
          style={{ backgroundColor: team.color, color: team.color }}
          aria-hidden="true"
        />
        <h3 className="min-w-0 flex-1 truncate text-[10px] font-black leading-tight text-foreground" title={team.name}>
          {team.name}
        </h3>
        <span className="shrink-0 text-[7px] font-black text-muted">{players.length}J</span>
      </div>

      <div
        className="relative h-[196px] overflow-hidden rounded-lg border border-white/25 shadow-[inset_0_0_22px_rgba(0,0,0,.3)]"
        style={{
          background: "repeating-linear-gradient(90deg, #0d5b32 0, #0d5b32 24px, #0b512c 24px, #0b512c 48px)",
        }}
      >
        <div className="absolute inset-1.5 border border-white/30" />
        <div className="absolute inset-x-1.5 top-1/2 h-px bg-white/30" />
        <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
        <div className="absolute left-1/2 top-1.5 h-6 w-12 -translate-x-1/2 border border-t-0 border-white/30" />
        <div className="absolute bottom-1.5 left-1/2 h-6 w-12 -translate-x-1/2 border border-b-0 border-white/30" />

        {players.map((player, playerIndex) => {
          const [left, top] = positions[playerIndex];
          return (
            <button
              key={player.id}
              type="button"
              disabled={!onPlayerClick}
              onClick={() => onPlayerClick?.(player)}
              aria-pressed={onPlayerClick ? selectedPlayerId === player.id : undefined}
              className={`absolute flex w-[48%] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-md transition-transform enabled:active:scale-95 ${selectedPlayerId === player.id ? "z-10 bg-warning/20 ring-2 ring-warning" : ""}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              title={player.name}
            >
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 bg-[#07170f] text-[8px] font-black text-white shadow-[0_4px_9px_rgba(0,0,0,.5)]"
                style={{ borderColor: team.color }}
              >
                {getInitials(player.name)}
              </div>
              <span className="mt-0.5 line-clamp-2 w-full rounded bg-black/75 px-0.5 py-0.5 text-center text-[7px] font-black leading-[1.05] text-white shadow-sm">
                {player.name}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}
