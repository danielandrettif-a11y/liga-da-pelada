import { Football, Target, Trophy } from "@/components/icons";
import { TeamCrest } from "@/components/TeamCrest";
import type { SeasonTeamStanding } from "@/lib/season-team-standings";

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function TeamSeasonStandings({ standings }: { standings: SeasonTeamStanding[] }) {
  const hasMatches = standings.some((team) => team.games > 0);

  return (
    <div className="space-y-4 pb-16">
      <header>
        <p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">Pontos corridos da temporada</p>
        <h1 className="mt-1 font-athletic text-2xl font-black uppercase italic text-foreground">Brasileirão do BQ</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted">Vitória vale 3 pontos, empate vale 1 e derrota vale 0.</p>
      </header>

      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface/60 p-3 text-center">
        <div><p className="font-athletic text-lg font-black text-accent">3</p><p className="text-[8px] font-black uppercase tracking-wider text-muted">Vitória</p></div>
        <div className="border-x border-border"><p className="font-athletic text-lg font-black text-warning">1</p><p className="text-[8px] font-black uppercase tracking-wider text-muted">Empate</p></div>
        <div><p className="font-athletic text-lg font-black text-muted">0</p><p className="text-[8px] font-black uppercase tracking-wider text-muted">Derrota</p></div>
      </div>

      {!hasMatches && (
        <p className="rounded-xl border border-border bg-surface/60 p-3 text-center text-xs text-muted">A classificação começa quando a primeira partida oficial da temporada for encerrada.</p>
      )}

      <section className="space-y-2" aria-label="Classificação dos times">
        {standings.map((team, index) => (
          <article
            key={team.key}
            className={`relative overflow-hidden rounded-2xl border p-3 shadow-[0_12px_28px_rgba(0,0,0,.2)] ${index === 0 && hasMatches ? "border-accent/40 bg-gradient-to-br from-accent/[.11] via-[#0a1c12] to-[#041009]" : "border-white/10 bg-gradient-to-br from-[#10251a] via-[#091a11] to-[#041009]"}`}
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/35 to-transparent" />
            <div className="relative flex items-center gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-athletic text-lg font-black ${index === 0 && hasMatches ? "border-accent/35 bg-accent/10 text-accent" : "border-white/10 bg-black/25 text-foreground"}`}>
                {index === 0 && hasMatches ? <Trophy className="h-5 w-5" /> : `${index + 1}º`}
              </div>
              <TeamCrest name={team.name} crestUrl={team.crestUrl} color={team.color} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-athletic text-sm font-black uppercase tracking-wide text-foreground">{team.name}</h2>
                <p className="mt-0.5 text-[9px] font-bold text-muted">{team.games} jogos · {team.wins}V · {team.draws}E · {team.losses}D</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="stat-number text-3xl text-accent">{team.points}</p>
                <p className="text-[7px] font-black uppercase tracking-[.16em] text-muted">pontos</p>
              </div>
            </div>

            <div className="relative mt-3 grid grid-cols-3 gap-1.5 border-t border-white/10 pt-2.5">
              <div className="rounded-lg border border-white/[.07] bg-black/20 px-2 py-1.5 text-center"><p className="font-athletic text-sm font-black text-foreground">{team.goalsFor}</p><p className="text-[6px] font-black uppercase tracking-wider text-muted">Gols pró</p></div>
              <div className="rounded-lg border border-white/[.07] bg-black/20 px-2 py-1.5 text-center"><p className="font-athletic text-sm font-black text-foreground">{team.goalsAgainst}</p><p className="text-[6px] font-black uppercase tracking-wider text-muted">Gols contra</p></div>
              <div className="rounded-lg border border-white/[.07] bg-black/20 px-2 py-1.5 text-center"><p className={`font-athletic text-sm font-black ${team.goalDifference > 0 ? "text-accent" : team.goalDifference < 0 ? "text-danger" : "text-foreground"}`}>{signed(team.goalDifference)}</p><p className="text-[6px] font-black uppercase tracking-wider text-muted">Saldo</p></div>
            </div>

            <div className="relative mt-2 grid gap-1.5 sm:grid-cols-2">
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[.07] bg-black/20 px-2.5 py-2">
                <Football className="h-3.5 w-3.5 shrink-0 text-accent" />
                <p className="min-w-0 truncate text-[9px] text-muted">Artilheiro: <strong className="text-foreground">{team.topScorer ? `${team.topScorer.name} · ${team.topScorer.total}` : "—"}</strong></p>
              </div>
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[.07] bg-black/20 px-2.5 py-2">
                <Target className="h-3.5 w-3.5 shrink-0 text-warning" />
                <p className="min-w-0 truncate text-[9px] text-muted">Garçom: <strong className="text-foreground">{team.topAssister ? `${team.topAssister.name} · ${team.topAssister.total}` : "—"}</strong></p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
