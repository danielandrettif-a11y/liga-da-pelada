import { getPlayer, getPlayerGoalkeeperAwards, getPlayerRoundHistory, getPlayersWithStats } from "@/lib/actions/players";
import { getDisplayName, calculateWinRate, formatDateShort } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerProfileBadge } from "@/components/PlayerProfileBadge";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Medal } from "lucide-react";

export const revalidate = 0;

export default async function JogadorPerfilPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;

  // Busca dados em paralelo
  const [player, history, allStats, goalkeeperAwards] = await Promise.all([
    getPlayer(id),
    getPlayerRoundHistory(id),
    getPlayersWithStats(),
    getPlayerGoalkeeperAwards(id),
  ]);

  if (!player) {
    notFound();
  }

  // Encontra as estatísticas agregadas desse jogador
  const stats = allStats.find((p) => p.id === id) || {
    games: 0,
    goals: 0,
    assists: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
  };

  const winRate = calculateWinRate(stats.wins, stats.draws, stats.games);

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Link
          href="/jogadores"
          className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <h1 className="text-sm font-bold text-foreground uppercase tracking-wider">
          Perfil
        </h1>
      </div>

      {/* Hero Card */}
      <div className="glass-card p-6 animate-fade-in flex flex-col items-center text-center">
        <PlayerAvatar
          name={player.name}
          avatarUrl={player.avatar_url}
          className="w-24 h-24 rounded-full bg-surface text-2xl font-bold text-muted mb-4 ring-2 ring-border shadow-lg"
        />
        <h2 className="text-2xl font-bold text-foreground mb-1">
          {getDisplayName(player.name, player.nickname)}
        </h2>
        <p className="text-sm text-muted">{player.name}</p>
        <div className="mt-2"><PlayerProfileBadge profile={player.player_profile} /></div>

        {goalkeeperAwards.length > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-black text-accent">
            <Medal className="h-4 w-4" />
            Melhor goleiro {goalkeeperAwards.length > 1 ? `× ${goalkeeperAwards.length}` : "da rodada"}
          </div>
        )}

        <div className="mt-6 py-3 px-6 rounded-2xl bg-surface/50 border border-border inline-flex items-center gap-4">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Pontos</span>
            <span className="stat-number text-2xl gradient-text">{stats.points}</span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Aprov.</span>
            <span className="stat-number text-xl text-foreground">{winRate}%</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <section className="animate-fade-in-up stagger-1">
        <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 px-1">
          Estatísticas
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4">
            <p className="text-xs text-muted mb-1">Peladas</p>
            <p className="stat-number text-2xl text-foreground">{stats.rounds || 0}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted mb-1">Jogos</p>
            <p className="stat-number text-2xl text-foreground">{stats.games}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted mb-1">Vitórias</p>
            <p className="stat-number text-2xl text-success">{stats.wins}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted mb-1">Gols</p>
            <p className="stat-number text-2xl text-foreground">{stats.goals}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted mb-1">Assistências</p>
            <p className="stat-number text-2xl text-foreground">{stats.assists}</p>
          </div>
        </div>
      </section>

      {goalkeeperAwards.length > 0 && (
        <section className="animate-fade-in-up stagger-2">
          <h3 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-muted">Prêmios de goleiro</h3>
          <div className="glass-card overflow-hidden">
            {goalkeeperAwards.map((award, index) => (
              <Link key={award.id} href={`/rodadas/${award.id}`}>
                <div className={`flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover ${index < goalkeeperAwards.length - 1 ? "border-b border-border" : ""}`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                    <Medal className="h-5 w-5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-foreground">Melhor goleiro · Rodada {String(award.number).padStart(2, "0")}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatDateShort(award.date)} · +6 pontos</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section className="animate-fade-in-up stagger-2">
        <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 px-1">
          Histórico de Rodadas
        </h3>
        {history.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-muted">Ainda não participou de nenhuma rodada.</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            {history.map((h, idx) => (
              <Link key={h.id} href={`/rodadas/${h.round_id}`}>
                <div
                  className={`
                    flex items-center gap-4 px-4 py-4 hover:bg-surface-hover transition-colors
                    ${idx < history.length - 1 ? "border-b border-border" : ""}
                  `}
                >
                  <div className="w-12 h-12 rounded-xl bg-surface flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-[10px] text-muted font-bold">R{String(h.rounds?.number).padStart(2, "0")}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted mb-1">
                      {h.rounds ? formatDateShort(h.rounds.date) : ""}
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted">⚽</span>
                        <span className="text-sm font-bold text-foreground">{h.goals}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted">🎯</span>
                        <span className="text-sm font-bold text-foreground">{h.assists}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted">🏆</span>
                        <span className={`text-sm font-bold ${h.wins > 0 ? "text-success" : h.draws > 0 ? "text-warning" : "text-danger"}`}>
                          {h.wins > 0 ? "V" : h.draws > 0 ? "E" : "D"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="stat-number text-lg text-accent">+{h.points}</span>
                    <span className="text-[10px] text-muted font-semibold">PTS</span>
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted ml-2" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
