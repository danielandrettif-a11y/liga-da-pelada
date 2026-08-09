import { getInitials } from "@/lib/utils";
import type { Player, PlayerProfile } from "@/lib/types";

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
};

const ROWS: Array<{ profile: PlayerProfile; top: string; shortLabel: string }> = [
  { profile: "offensive", top: "21%", shortLabel: "ATA" },
  { profile: "midfield", top: "50%", shortLabel: "MEI" },
  { profile: "defensive", top: "79%", shortLabel: "DEF" },
];

function displayName(player: Player) {
  return player.nickname || player.name;
}

export function TeamMiniPitch({ team, index }: TeamMiniPitchProps) {
  const groupedPlayers = new Map<PlayerProfile, Player[]>([
    ["offensive", []],
    ["midfield", []],
    ["defensive", []],
  ]);

  for (const entry of team.team_players) {
    if (!entry.players) continue;
    const profile = entry.players.player_profile || "midfield";
    groupedPlayers.get(profile)?.push(entry.players);
  }

  return (
    <article className={`glass-card overflow-hidden p-3 animate-fade-in-up stagger-${Math.min(index + 1, 5)}`}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-lg"
            style={{ backgroundColor: `${team.color}24`, color: team.color }}
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
              <path d="M12 2.8 20 6v5.8c0 5-3.2 8.6-8 10.4-4.8-1.8-8-5.4-8-10.4V6Z" opacity=".22" />
              <path d="M12 3.8 19 6.6v5.2c0 4.2-2.6 7.3-7 9-4.4-1.7-7-4.8-7-9V6.6Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-foreground">{team.name}</h3>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {team.team_players.length} jogadores
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wide text-muted">
          {ROWS.slice().reverse().map((row) => (
            <span key={row.profile} className="rounded-md bg-surface-hover px-1.5 py-1">
              {row.shortLabel} {groupedPlayers.get(row.profile)?.length || 0}
            </span>
          ))}
        </div>
      </div>

      <div
        className="relative min-h-[220px] overflow-hidden rounded-2xl border-2 border-white/20 shadow-[inset_0_0_35px_rgba(0,0,0,.28)]"
        style={{
          background: "repeating-linear-gradient(90deg, #0d5b32 0, #0d5b32 54px, #0b512c 54px, #0b512c 108px)",
        }}
      >
        <div className="absolute inset-3 border border-white/35" />
        <div className="absolute inset-x-3 top-1/2 h-px bg-white/35" />
        <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
        <div className="absolute left-1/2 top-3 h-9 w-24 -translate-x-1/2 border border-t-0 border-white/35" />
        <div className="absolute bottom-3 left-1/2 h-9 w-24 -translate-x-1/2 border border-b-0 border-white/35" />
        <div className="absolute left-1/2 top-0 h-3 w-12 -translate-x-1/2 rounded-b border-x border-b border-white/35 bg-black/10" />
        <div className="absolute bottom-0 left-1/2 h-3 w-12 -translate-x-1/2 rounded-t border-x border-t border-white/35 bg-black/10" />

        {ROWS.map((row) => {
          const players = groupedPlayers.get(row.profile) || [];
          if (players.length === 0) return null;

          return (
            <div
              key={row.profile}
              className="absolute inset-x-4 flex -translate-y-1/2 items-start justify-evenly gap-1"
              style={{ top: row.top }}
            >
              {players.map((player) => {
                const name = displayName(player);
                return (
                  <div key={player.id} className="flex min-w-0 flex-1 flex-col items-center" title={name}>
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full border-2 bg-[#07170f] text-[10px] font-black text-white shadow-[0_5px_12px_rgba(0,0,0,.4)]"
                      style={{ borderColor: team.color }}
                    >
                      {getInitials(name)}
                    </div>
                    <span className="mt-1 block max-w-full truncate rounded-md bg-black/70 px-2 py-1 text-center text-[9px] font-black leading-none text-white shadow-md backdrop-blur-sm">
                      {name}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </article>
  );
}
