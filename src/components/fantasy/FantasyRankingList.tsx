import { PlayerAvatar } from "@/components/PlayerAvatar";

export type FantasyRankingEntry = {
  id: string;
  position: number;
  rounds_played: number | string;
  current_budget: number | string;
  total_points: number | string;
  player: {
    name: string;
    avatar_url: string | null;
  } | null;
};

export function FantasyRankingList({ ranking }: { ranking: FantasyRankingEntry[] }) {
  if (ranking.length === 0) {
    return (
      <p className="glass-card p-6 text-center text-sm text-muted">
        O ranking aparecerá após as primeiras escalações.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {ranking.map((item) => (
        <div key={item.id} className="glass-card flex items-center gap-3 p-4">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${item.position <= 3 ? "bg-accent text-background" : "bg-surface text-muted"}`}>
            {item.position}
          </span>
          <PlayerAvatar
            name={item.player?.name || "Cartoleiro"}
            avatarUrl={item.player?.avatar_url}
            className="h-10 w-10 shrink-0 rounded-full bg-surface text-xs font-black text-accent"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-foreground">{item.player?.name || "Cartoleiro"}</p>
            <p className="text-[10px] text-muted">
              {Number(item.rounds_played)} rodadas · patrimônio C$ {Number(item.current_budget).toFixed(2)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <strong className="stat-number text-lg text-accent">{Number(item.total_points).toFixed(1)}</strong>
            <p className="text-[8px] font-black uppercase text-muted">pontos</p>
          </div>
        </div>
      ))}
    </div>
  );
}
