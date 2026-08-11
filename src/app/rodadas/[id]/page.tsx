import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Plus } from "@/components/icons";
import { getRound } from "@/lib/actions/rounds";
import { formatDateShort } from "@/lib/utils";
import { FinishRoundButton } from "@/components/FinishRoundButton";
import { BestGoalkeeperPicker } from "@/components/BestGoalkeeperPicker";
import { getCurrentAccount } from "@/lib/auth";
import { getGoalkeeperScoringPoints } from "@/lib/actions/scoring";
import { TeamMiniPitch } from "@/components/TeamMiniPitch";
import { RoundAvailabilityManager } from "@/components/RoundAvailabilityManager";

export const revalidate = 0;

export default async function RodadaDetalhePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const roundPromise = getRound(id);
  const [round, account, goalkeeperPoints] = await Promise.all([
    roundPromise,
    getCurrentAccount(),
    roundPromise.then((currentRound) => currentRound?.status === "finished"
      ? getGoalkeeperScoringPoints(currentRound.league_id)
      : 0),
  ]);

  if (!round) {
    notFound();
  }

  const participants = (round.round_players || [])
    .map((entry: any) => entry.players)
    .filter(Boolean)
    .sort((a: any, b: any) => a.name.localeCompare(b.name, "pt-BR"));
  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/rodadas"
            className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Rodada {String(round.number).padStart(2, "0")}
            </h1>
            <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
              <CalendarDays className="w-3 h-3" />
              {formatDateShort(round.date)}
            </p>
          </div>
        </div>
      </div>

      {round.status !== "finished" && account.isAdmin && (
        <Link
          href={`/rodadas/${round.id}/nova-partida`}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-4 text-sm font-black uppercase tracking-wide text-background shadow-lg shadow-accent/20 transition-all hover:bg-accent-light active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" strokeWidth={3} />
          Nova Partida
        </Link>
      )}

      {/* Teams Grid */}
      <section>
        <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 px-1">
          Times Formados
        </h2>
        <div className="-mx-2 grid grid-cols-3 gap-1.5">
          {round.teams.map((team: any, index: number) => (
            <TeamMiniPitch key={team.id} team={team} index={index} />
          ))}
          {round.teams.length === 0 && (
            <div className="col-span-full p-6 text-center text-muted text-sm glass-card">
              Nenhum time formado ainda.
            </div>
          )}
        </div>
      </section>

      <RoundAvailabilityManager
        roundId={round.id}
        entries={round.round_players || []}
        canManage={account.isAdmin && round.status !== "finished"}
      />

      {/* Partidas */}
      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider">
            Partidas
          </h2>
        </div>
        
        <div className="space-y-3">
          {round.matches.length === 0 ? (
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-muted">Ainda não há partidas cadastradas.</p>
              <p className="text-[10px] text-muted/70 mt-1">Crie uma para começar a registrar os gols!</p>
            </div>
          ) : (
            round.matches.map((match: any, index: number) => {
              const teamA = round.teams.find((t: any) => t.id === match.team_a_id);
              const teamB = round.teams.find((t: any) => t.id === match.team_b_id);
              const isFinished = match.status === "finished";
              const isLive = match.status === "live";
              
              return (
                <Link key={match.id} href={`/partidas/${match.id}`} className="block">
                  <div className={`glass-card glass-card-hover overflow-hidden p-4 animate-fade-in stagger-${Math.min(index + 1, 5)} ${isLive ? "border-accent/40 shadow-[0_0_24px_rgba(190,255,0,0.06)]" : ""}`}>
                    <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted">
                        Partida {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${isFinished ? "bg-muted/15 text-muted" : isLive ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"}`}>
                        {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                        {isFinished ? "Finalizada" : isLive ? "Ao vivo" : "Aguardando"}
                      </span>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                      <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                        <span className="truncate text-sm font-bold text-foreground">{teamA?.name}</span>
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: teamA?.color }} />
                      </div>

                      <div className="flex min-w-[5.75rem] items-center justify-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2">
                        <span className={`stat-number text-2xl ${isFinished && match.score_a > match.score_b ? "text-accent" : "text-foreground"}`}>{match.score_a}</span>
                        <span className="text-xs font-black text-muted">×</span>
                        <span className={`stat-number text-2xl ${isFinished && match.score_b > match.score_a ? "text-accent" : "text-foreground"}`}>{match.score_b}</span>
                      </div>

                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: teamB?.color }} />
                        <span className="truncate text-sm font-bold text-foreground">{teamB?.name}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
      
      <FinishRoundButton roundId={round.id} status={round.status} canManage={account.isAdmin} />

      {round.status === "finished" && (
        <BestGoalkeeperPicker
          roundId={round.id}
          participants={participants}
          selectedPlayerId={round.best_goalkeeper_player_id || null}
          canManage={account.isAdmin}
          points={goalkeeperPoints}
        />
      )}
    </div>
  );
}
