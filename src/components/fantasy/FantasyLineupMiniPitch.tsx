import Link from "next/link";
import { Crown } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";

type PitchPlayer = {
  id?: string;
  playerId?: string;
  player_id?: string;
  name?: string;
  player_name_locked?: string | null;
  avatarUrl?: string | null;
  avatar_url_locked?: string | null;
  players?: { name?: string; avatar_url?: string | null } | null;
  slotRole?: string | null;
  slot_role?: string | null;
  points?: number;
  total_points?: number;
  isCaptain?: boolean;
};

export function FantasyLineupMiniPitch({
  players,
  captainId,
  playerHref,
}: {
  players: PitchPlayer[];
  captainId?: string | null;
  playerHref?: (playerId: string) => string;
}) {
  const normalized = players.map((player, index) => ({
    source: player,
    id: player.playerId || player.player_id || player.id || String(index),
    name: player.name || player.player_name_locked || player.players?.name || "Jogador",
    avatarUrl: player.avatarUrl || player.avatar_url_locked || player.players?.avatar_url || null,
    role: player.slotRole || player.slot_role || null,
    points: Number(player.points ?? player.total_points ?? 0),
    captain: Boolean(player.isCaptain || (captainId && (player.playerId || player.player_id) === captainId)),
  }));
  const byRole = (role: string) => normalized.filter((player) => player.role === role);
  const hasRoles = normalized.some((player) => player.role);
  const rows = hasRoles
    ? [byRole("ATA"), byRole("ALA"), byRole("MEI"), byRole("DEF"), byRole("GOL")].filter((row) => row.length)
    : normalized.length >= 6
      ? [normalized.slice(0, 2), normalized.slice(2, 3), normalized.slice(3, 5), normalized.slice(5, 6)]
      : [normalized.slice(0, 2), normalized.slice(2, 4), normalized.slice(4, 5)];

  return (
    <div className="relative min-h-[410px] overflow-hidden rounded-2xl border border-emerald-300/30 bg-[radial-gradient(circle_at_50%_40%,rgba(53,170,97,.22),transparent_50%),linear-gradient(160deg,#092a1b,#04130c)] p-3 shadow-inner">
      <div className="absolute inset-x-0 top-1/2 border-t border-white/25" />
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      <div className="absolute inset-x-5 bottom-3 top-3 border border-white/20" />
      <div className="relative z-10 flex min-h-[386px] flex-col justify-between py-2">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className={`flex ${row.length > 1 ? "justify-around" : "justify-center"}`}>
            {row.map((player) => {
              const content = <>
                <div className={`relative rounded-full ${player.captain ? "ring-2 ring-accent" : ""}`}>
                  <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} clickable={false} className="h-12 w-12 rounded-full border-2 border-emerald-200 bg-background text-xs font-black text-accent" />
                  {player.captain && <span className="absolute -right-2 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-background"><Crown className="h-3 w-3" /></span>}
                </div>
                <span className="mt-1 max-w-28 truncate rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-black text-white">{player.name}</span>
                <span className="mt-0.5 text-[10px] font-black text-accent">{player.points.toFixed(1)} pts</span>
                {player.role && <span className="text-[7px] font-black uppercase text-emerald-200/65">{player.role}</span>}
              </>;
              const className = "flex w-28 flex-col items-center text-center transition-transform active:scale-95";
              return playerHref ? <Link key={player.id} href={playerHref(player.id)} className={className}>{content}</Link> : <div key={player.id} className={className}>{content}</div>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
