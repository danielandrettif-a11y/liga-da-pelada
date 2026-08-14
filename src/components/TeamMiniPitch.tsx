"use client";

import type { Player } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { TeamCrest } from "./TeamCrest";

type PitchPlayer = {
  player_id: string;
  goalkeeper_order?: number | null;
  players: Player | null;
};

type TeamMiniPitchProps = {
  team: {
    id: string;
    name: string;
    color: string;
    crest_url?: string | null;
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
  7: [[50, 12], [25, 32], [75, 32], [25, 54], [75, 54], [25, 80], [75, 80]],
  8: [[25, 12], [75, 12], [25, 36], [75, 36], [25, 60], [75, 60], [25, 84], [75, 84]],
  9: [[50, 9], [25, 28], [75, 28], [25, 48], [75, 48], [25, 68], [75, 68], [25, 87], [75, 87]],
  10: [[25, 9], [75, 9], [25, 28], [75, 28], [25, 48], [75, 48], [25, 68], [75, 68], [25, 87], [75, 87]],
};

export function TeamMiniPitch({ team, index, selectedPlayerId, onPlayerClick }: TeamMiniPitchProps) {
  const players = team.team_players
    .flatMap((entry) => entry.players ? [{ player: entry.players, goalkeeperOrder: entry.goalkeeper_order ?? null }] : [])
    .slice(0, 10);
  const positions = POSITIONS[Math.max(1, players.length)];
  const isCrowded = players.length > 6;

  return (
    <article className={`glass-card min-w-0 overflow-hidden p-1.5 animate-fade-in-up stagger-${Math.min(index + 1, 5)}`}>
      <div className="mb-1.5 flex min-w-0 items-center gap-1.5 px-0.5 py-0.5">
        <TeamCrest name={team.name} crestUrl={team.crest_url} color={team.color} className="h-6 w-6" />
        <h3 className="min-w-0 flex-1 truncate text-[10px] font-black leading-tight text-foreground" title={team.name}>
          {team.name}
        </h3>
        <span className="shrink-0 text-[7px] font-black text-muted">{players.length}J</span>
      </div>

      <div className="mb-1 flex items-center justify-end px-0.5">
        <span className="rounded bg-accent/10 px-1 py-0.5 text-[7px] font-black uppercase leading-none text-accent">
          Nº = ordem do gol
        </span>
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

        {players.map(({ player, goalkeeperOrder }, playerIndex) => {
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
              title={`${player.name}${goalkeeperOrder ? ` · ${goalkeeperOrder}º no gol` : ""}`}
            >
              <div className="relative rounded-full border-2" style={{ borderColor: team.color }}>
                <PlayerAvatar
                  name={player.name}
                  avatarUrl={player.avatar_url}
                  className={`${isCrowded ? "h-6 w-6 text-[7px]" : "h-8 w-8 text-[8px]"} rounded-full bg-[#07170f] font-black text-white shadow-[0_4px_9px_rgba(0,0,0,.5)]`}
                  imageClassName="object-cover"
                />
                {goalkeeperOrder && (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-accent px-0.5 font-athletic text-[8px] font-black leading-none text-background shadow-[0_2px_6px_rgba(0,0,0,.55)]"
                    aria-label={`${goalkeeperOrder}º na ordem do gol`}
                  >
                    {goalkeeperOrder}
                  </span>
                )}
                {player.is_goalkeeper && (
                  <span className="absolute -bottom-1.5 -left-2 rounded border border-accent/30 bg-background/90 px-1 text-[7px] font-black leading-none text-accent">
                    GOL
                  </span>
                )}
              </div>
              <span className={`mt-0.5 line-clamp-2 w-full rounded bg-black/75 px-0.5 py-0.5 text-center font-black leading-[1.05] text-white shadow-sm ${isCrowded ? "text-[6px]" : "text-[8px]"}`}>
                {player.name}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}
