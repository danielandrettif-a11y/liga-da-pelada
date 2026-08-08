import { CalendarDays, ChevronRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import { getDashboardData } from "@/lib/actions/dashboard";

export const dynamic = "force-dynamic";

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const cls = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : "rank-3";
    return <span className={`rank-badge ${cls}`}>{rank}</span>;
  }
  return (
    <span className="rank-badge bg-surface text-muted">{rank}</span>
  );
}

function StatHighlightCard({
  emoji,
  label,
  playerName,
  value,
  unit,
  delay,
}: {
  emoji: string;
  label: string;
  playerName: string;
  value: number;
  unit: string;
  delay: string;
}) {
  return (
    <div className={`glass-card p-4 animate-fade-in-up ${delay}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{emoji}</span>
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-base font-bold text-foreground truncate">{playerName || "-"}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="stat-number text-2xl gradient-text">{value || 0}</span>
        <span className="text-xs text-muted font-medium">{unit}</span>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const { data } = await getDashboardData();
  
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-surface-hover flex items-center justify-center mb-4">
          <TrendingUp className="w-8 h-8 text-muted" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Bem-vindo à Liga</h2>
        <p className="text-muted text-sm mb-6">
          Comece criando a primeira rodada e chamando seus amigos!
        </p>
        <Link href="/rodadas" className="btn-primary w-full">
          Ir para Rodadas
        </Link>
      </div>
    );
  }

  const { nextRound, lastRound, rankingPreview, highlights } = data;

  return (
    <div className="space-y-6">
      {/* Next Round Card */}
      {nextRound ? (
        <Link href={`/rodadas/${nextRound.id}`} className="block">
          <div className="glass-card glass-card-hover p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted font-semibold uppercase tracking-wider">
                    {nextRound.status === 'active' ? 'Rodada em Andamento' : 'Próxima Pelada'}
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    Rodada {String(nextRound.number).padStart(2, "0")}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted" />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-muted mb-0.5">Data</p>
                  <p className="text-sm font-semibold text-foreground">
                    {new Date(nextRound.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <p className="text-xs text-muted mb-0.5">Confirmados</p>
                  <p className="text-sm font-semibold text-foreground">
                    {nextRound.confirmedPlayers} jogadores
                  </p>
                </div>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-accent/15 text-accent text-xs font-bold">
                ACESSAR
              </div>
            </div>
          </div>
        </Link>
      ) : (
        <Link href="/rodadas" className="block">
          <div className="glass-card glass-card-hover p-5 animate-fade-in flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-muted" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Nenhuma rodada agendada</p>
                <p className="text-xs text-muted">Clique para criar a próxima pelada</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted" />
          </div>
        </Link>
      )}

      {/* Highlights Section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Destaques da Temporada
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatHighlightCard
            emoji="⚽"
            label="Artilheiro"
            playerName={highlights?.topScorer?.player?.nickname || highlights?.topScorer?.player?.name}
            value={highlights?.topScorer?.goals}
            unit="gols"
            delay="stagger-1"
          />
          <StatHighlightCard
            emoji="🎯"
            label="Assistências"
            playerName={highlights?.topAssists?.player?.nickname || highlights?.topAssists?.player?.name}
            value={highlights?.topAssists?.assists}
            unit="assists"
            delay="stagger-2"
          />
          <StatHighlightCard
            emoji="🏆"
            label="Vitórias"
            playerName={highlights?.topWins?.player?.nickname || highlights?.topWins?.player?.name}
            value={highlights?.topWins?.wins}
            unit="vitórias"
            delay="stagger-3"
          />
        </div>
      </section>

      {/* Ranking Preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            🏅 Top 5 Ranking
          </h2>
          <Link
            href="/ranking"
            className="text-xs font-semibold text-accent hover:text-accent-light transition-colors"
          >
            Ver completo →
          </Link>
        </div>

        <div className="glass-card overflow-hidden">
          {rankingPreview && rankingPreview.length > 0 ? (
            rankingPreview.map((stats: any, index: number) => {
              const name = stats.player?.nickname || stats.player?.name || "Desconhecido";
              return (
                <Link
                  href={`/jogadores/${stats.player.id}`}
                  key={stats.player.id}
                  className={`
                    flex items-center gap-3 px-4 py-3.5 animate-fade-in
                    ${index < rankingPreview.length - 1 ? "border-b border-border" : ""}
                    stagger-${index + 1}
                    hover:bg-surface-hover transition-colors
                  `}
                >
                  <RankBadge rank={index + 1} />
                  
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-surface-hover flex items-center justify-center text-xs font-bold text-muted flex-shrink-0">
                    {name.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted">
                        ⚽ {stats.goals}
                      </span>
                      <span className="text-[10px] text-muted">
                        🎯 {stats.assists}
                      </span>
                    </div>
                  </div>

                  {/* Points */}
                  <div className="text-right">
                    <p className="stat-number text-lg gradient-text">
                      {stats.points}
                    </p>
                    <p className="text-[10px] text-muted font-medium">pts</p>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="p-6 text-center text-muted text-sm">
              Nenhuma pontuação registrada ainda.
            </div>
          )}
        </div>
      </section>

      {/* Last Round Summary */}
      {lastRound && (
        <section>
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">
            📋 Última Rodada
          </h2>

          <Link href={`/rodadas/${lastRound.id}`} className="block">
            <div className="glass-card glass-card-hover p-4 animate-fade-in-up">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-foreground">
                  Rodada {String(lastRound.number).padStart(2, "0")}
                </p>
                <span className="text-xs text-muted">
                  {new Date(lastRound.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>

              {/* Mini match results */}
              <div className="space-y-2">
                {lastRound.matches && lastRound.matches.length > 0 ? (
                  lastRound.matches.map((match: any) => (
                    <div
                      key={match.id}
                      className="flex items-center gap-2 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        <span className="font-semibold text-foreground/80 truncate">
                          {match.teamA?.name || "Time A"}
                        </span>
                        <span
                          className="team-dot flex-shrink-0"
                          style={{ backgroundColor: match.teamA?.color || "#fff" }}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface min-w-[3.5rem] justify-center">
                        <span
                          className={`font-bold ${
                            match.score_a > match.score_b
                              ? "text-accent"
                              : "text-foreground/60"
                          }`}
                        >
                          {match.score_a}
                        </span>
                        <span className="text-muted">×</span>
                        <span
                          className={`font-bold ${
                            match.score_b > match.score_a
                              ? "text-accent"
                              : "text-foreground/60"
                          }`}
                        >
                          {match.score_b}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-1">
                        <span
                          className="team-dot flex-shrink-0"
                          style={{ backgroundColor: match.teamB?.color || "#fff" }}
                        />
                        <span className="font-semibold text-foreground/80 truncate">
                          {match.teamB?.name || "Time B"}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-center text-muted py-2">Sem partidas registradas</p>
                )}
              </div>
            </div>
          </Link>
        </section>
      )}
    </div>
  );
}
