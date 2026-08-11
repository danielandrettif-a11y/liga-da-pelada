import Link from "next/link";
import type { Player } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";

export function CommunityCarousel({ title, subtitle, players }: { title: string; subtitle: string; players: Player[] }) {
  if (players.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="px-1"><h2 className="text-sm font-black text-foreground">{title}</h2><p className="text-[10px] text-muted">{subtitle}</p></div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 no-scrollbar">
        {players.map((player) => (
          <Link key={player.id} href={`/jogadores/${player.id}`} className="glass-card w-32 shrink-0 snap-start p-3 text-center">
            <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="mx-auto h-16 w-16 rounded-full bg-surface text-base font-black text-muted ring-2 ring-border" />
            <p className="mt-2 truncate text-xs font-black text-foreground">{player.name}</p>
            {player.nickname && <p className="truncate text-[9px] text-muted">{player.nickname}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}

