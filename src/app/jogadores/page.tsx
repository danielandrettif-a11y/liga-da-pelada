import Link from "next/link";
import { getPlayersWithStats } from "@/lib/actions/players";
import { getDisplayName, calculateWinRate } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";

export const revalidate = 0; // Para garantir que sempre busca do banco ao recarregar (em produção podemos mudar para ISR)

export default async function JogadoresPage() {
  const players = await getPlayersWithStats();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Jogadores</h1>
        <p className="text-xs text-muted mt-0.5">
          {players.length} jogadores cadastrados
        </p>
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-2 gap-3">
        {players.map((player, index) => (
          <Link key={player.id} href={`/jogadores/${player.id}`}>
            <div
              className={`glass-card glass-card-hover p-4 animate-fade-in stagger-${Math.min(index + 1, 5)}`}
            >
              {/* Avatar */}
              <div className="flex items-center gap-3 mb-3">
                <PlayerAvatar
                  name={player.name}
                  avatarUrl={player.avatar_url}
                  className="w-11 h-11 rounded-full bg-surface-hover text-sm font-bold text-muted flex-shrink-0 ring-1 ring-border"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">
                    {getDisplayName(player.name, player.nickname)}
                  </p>
                  <p className="text-[10px] text-muted truncate">
                    {player.games} jogos
                  </p>
                </div>
              </div>

              {/* Stats mini grid */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div>
                  <p className="text-[10px] text-muted">Gols</p>
                  <p className="text-sm font-bold text-foreground">{player.goals}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted">Assists</p>
                  <p className="text-sm font-bold text-foreground">{player.assists}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted">Vitórias</p>
                  <p className="text-sm font-bold text-foreground">{player.wins}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted">Aprov.</p>
                  <p className="text-sm font-bold text-foreground">
                    {calculateWinRate(player.wins, player.draws, player.games)}%
                  </p>
                </div>
              </div>

              {/* Points */}
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-[10px] text-muted font-semibold uppercase">
                  Pontos
                </span>
                <span className="stat-number text-lg gradient-text">
                  {player.points}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
