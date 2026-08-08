import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Plus } from "lucide-react";
import { getRound } from "@/lib/actions/rounds";
import { formatDateShort } from "@/lib/utils";
import { FinishRoundButton } from "@/components/FinishRoundButton";

export const revalidate = 0;

export default async function RodadaDetalhePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const round = await getRound(id);

  if (!round) {
    notFound();
  }

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

      {/* Teams Grid */}
      <section>
        <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 px-1">
          Times Formados
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {round.teams.map((team: any) => (
            <div key={team.id} className="glass-card overflow-hidden">
              <div className="px-3 py-2 bg-surface flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                  <span className="text-sm font-bold text-foreground">{team.name}</span>
                </div>
                <span className="text-[10px] font-bold text-muted bg-surface-hover px-2 py-0.5 rounded-md">
                  {team.team_players.length}
                </span>
              </div>
              <div className="p-3 space-y-1">
                {team.team_players.map((tp: any) => (
                  <div key={tp.player_id} className="text-xs font-semibold text-foreground/80 flex items-center gap-2">
                    <span className="w-1 h-1 bg-border rounded-full" />
                    {tp.players?.nickname || tp.players?.name}
                  </div>
                ))}
                {team.team_players.length === 0 && (
                  <div className="text-xs text-muted italic">Nenhum jogador</div>
                )}
              </div>
            </div>
          ))}
          {round.teams.length === 0 && (
            <div className="col-span-full p-6 text-center text-muted text-sm glass-card">
              Nenhum time formado ainda.
            </div>
          )}
        </div>
      </section>

      {/* Partidas */}
      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider">
            Partidas
          </h2>
          {round.status !== "finished" && (
            <Link
              href={`/rodadas/${round.id}/nova-partida`}
              className="flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-light transition-colors"
            >
              <Plus className="w-3 h-3" />
              Nova Partida
            </Link>
          )}
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
              
              return (
                <Link key={match.id} href={`/partidas/${match.id}`} className="block">
                  <div className="glass-card glass-card-hover p-4 flex items-center justify-between animate-fade-in stagger-1">
                    
                    {/* Team A */}
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <span className="text-sm font-bold text-foreground truncate">{teamA?.name}</span>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: teamA?.color }} />
                    </div>

                    {/* Score */}
                    <div className="px-3 flex items-center justify-center flex-shrink-0 gap-2">
                      <span className={`text-xl font-bold ${match.score_a > match.score_b ? "text-accent" : "text-foreground"}`}>
                        {match.score_a}
                      </span>
                      <span className="text-xs text-muted font-black">×</span>
                      <span className={`text-xl font-bold ${match.score_b > match.score_a ? "text-accent" : "text-foreground"}`}>
                        {match.score_b}
                      </span>
                    </div>

                    {/* Team B */}
                    <div className="flex items-center gap-2 flex-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: teamB?.color }} />
                      <span className="text-sm font-bold text-foreground truncate">{teamB?.name}</span>
                    </div>

                    {/* Status badge */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2">
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${match.status === 'finished' ? 'bg-muted/20 text-muted' : 'bg-accent/20 text-accent'}`}>
                        {match.status === 'finished' ? 'Fim' : 'Ao vivo'}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
      
      <FinishRoundButton roundId={round.id} status={round.status} />
    </div>
  );
}
