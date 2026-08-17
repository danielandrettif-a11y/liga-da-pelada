import { getPlayer, getPlayerAwardSeasons, getPlayerGoalsByClub, getPlayerRoundHistory } from "@/lib/actions/players";
import { getPlayerFitnessSummaries } from "@/lib/actions/fitness";
import { aggregatePlayerStats, calculateWinRate, formatDateShort } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerProfileBadge } from "@/components/PlayerProfileBadge";
import { PlayerAwards } from "@/components/PlayerAwards";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Football, Target, TrendingUp, Trophy } from "@/components/icons";
import { TeamCrest } from "@/components/TeamCrest";
import { FantasyPlayerCard } from "@/components/fantasy/FantasyPlayerCard";
import { getFantasyPlayerSummary } from "@/lib/actions/fantasy";

export const revalidate = 0;

type HistoryRow = Awaited<ReturnType<typeof getPlayerRoundHistory>>[number];

function History({ rows, friendly = false }: { rows: HistoryRow[]; friendly?: boolean }) {
  if (rows.length === 0) return <div className="glass-card p-6 text-center text-sm text-muted">Nenhuma participação registrada.</div>;
  return (
    <div className="glass-card overflow-hidden">
      {rows.map((row, index) => (
        <Link key={row.id} href={`/rodadas/${row.round_id}`} className={`flex items-center gap-4 px-4 py-4 hover:bg-surface-hover ${index < rows.length - 1 ? "border-b border-border" : ""}`}>
          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-surface"><span className="text-[9px] font-black text-muted">{friendly ? "AM" : "R"}{String(row.rounds?.number).padStart(2, "0")}</span></div>
          <div className="min-w-0 flex-1"><p className="mb-1 text-xs text-muted">{row.rounds ? formatDateShort(row.rounds.date) : ""}</p><div className="flex items-center gap-3"><span className="flex items-center gap-1 text-sm font-bold text-foreground"><Football className="h-3 w-3 text-muted" />{row.goals}</span><span className="flex items-center gap-1 text-sm font-bold text-foreground"><Target className="h-3 w-3 text-muted" />{row.assists}</span><span className={`text-sm font-bold ${row.wins > 0 ? "text-success" : row.draws > 0 ? "text-warning" : "text-danger"}`}>{row.wins > 0 ? "V" : row.draws > 0 ? "E" : "D"}</span></div></div>
          {!friendly && <div className="text-right"><span className="stat-number text-lg text-accent">+{row.points}</span><p className="text-[9px] text-muted">PTS</p></div>}
          <ChevronRight className="h-4 w-4 text-muted" />
        </Link>
      ))}
    </div>
  );
}
export default async function JogadorPerfilPage({ params }: PageProps<"/jogadores/[id]">) {
  const { id } = await params;
  const [player, officialHistory, friendlyHistory, awardSeasons, fitness, clubGoals, fantasySummary] = await Promise.all([
    getPlayer(id),
    getPlayerRoundHistory(id, "official"),
    getPlayerRoundHistory(id, "friendly"),
    getPlayerAwardSeasons(id),
    getPlayerFitnessSummaries(id),
    getPlayerGoalsByClub(id),
    getFantasyPlayerSummary(id),
  ]);
  if (!player) notFound();
  const isPlayable = player.is_selectable && (player.member_category === "player" || player.member_category === "guest");
  const official = aggregatePlayerStats(officialHistory);
  const friendly = aggregatePlayerStats(friendlyHistory);
  const categoryLabel = player.member_category === "player" ? "Jogador oficial" : player.member_category === "guest" ? "Convidado" : player.member_category === "wag" ? "WAG" : "Torcida";


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Link href="/jogadores" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface"><ArrowLeft className="h-5 w-5 text-muted" /></Link><h1 className="text-sm font-bold uppercase tracking-wider text-foreground">Perfil</h1></div>
      <div className="glass-card flex flex-col items-center p-6 text-center">
        <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="mb-4 h-24 w-24 rounded-full bg-surface text-2xl font-bold text-muted ring-2 ring-border" />
        <h2 className="text-2xl font-bold text-foreground">{player.name}</h2>
        {player.nickname && <p className="mt-1 text-sm font-semibold italic text-muted">“{player.nickname}”</p>}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2"><span className="rounded-full border border-border px-2.5 py-1 text-[9px] font-black uppercase text-muted">{categoryLabel}</span>{isPlayable && <PlayerProfileBadge profile={player.player_profile} isGoalkeeper={player.is_goalkeeper} />}</div>
        {player.profile_bio && <p className="mt-5 max-w-xl text-sm leading-6 text-muted">{player.profile_bio}</p>}
        {isPlayable && <div className="mt-6 inline-flex items-center gap-4 rounded-2xl border border-border bg-surface/50 px-6 py-3"><div><p className="text-[9px] font-bold uppercase text-muted">Pontos</p><p className="stat-number text-2xl text-accent">{official.points}</p></div><div className="h-8 w-px bg-border" /><div><p className="text-[9px] font-bold uppercase text-muted">Aprov.</p><p className="stat-number text-xl text-foreground">{calculateWinRate(official.wins, official.draws, official.games)}%</p></div></div>}
      </div>

      {!isPlayable ? <div className="glass-card p-6 text-center"><p className="text-sm font-black text-foreground">Parte da comunidade da Pelada</p><p className="mt-1 text-xs text-muted">O histórico esportivo está preservado, mas fica oculto enquanto este perfil não for um jogador selecionável.</p></div> : <>
        {([['Ranked', official], ['Amistosos', friendly]] as const).map(([label, stats]) => <section key={label}><h3 className="mb-3 px-1 text-xs font-black uppercase tracking-wider text-muted">{label}</h3><div className="grid grid-cols-4 gap-2">{([['Peladas', stats.rounds || 0], ['Jogos', stats.games], ['Gols', stats.goals], ['Assists', stats.assists], ['Vitórias', stats.wins], ['Empates', stats.draws], ['Derrotas', stats.losses], ['Aprov.', `${calculateWinRate(stats.wins, stats.draws, stats.games)}%`]] as const).map(([key, value]) => <div key={key} className="glass-card p-3 text-center"><p className="text-lg font-black text-foreground">{value}</p><p className="text-[8px] font-bold uppercase text-muted">{key}</p></div>)}</div></section>)}

        {fitness && <section><div className="mb-3 flex items-center gap-2 px-1"><TrendingUp className="h-4 w-4 text-accent" /><h3 className="text-xs font-black uppercase tracking-wider text-muted">Dados físicos autorizados</h3></div><div className="grid grid-cols-2 gap-3">{([['Ranked', fitness.official], ['Amistosos', fitness.friendly]] as const).map(([label, summary]) => <div key={label} className="glass-card p-4"><p className="text-[9px] font-black uppercase text-muted">{label}</p><p className="mt-1 text-xl font-black text-foreground">{summary.distanceKm} km</p><p className="text-[10px] text-muted">média {summary.averageSpeedKmh} km/h</p></div>)}</div></section>}

        <section>
          <div className="mb-3 px-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted">Gols por clube</h3>
            <p className="mt-1 text-[10px] text-muted/70">Histórico completo em partidas Ranked e amistosas.</p>
          </div>
          {clubGoals.length > 0 ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-surface to-surface p-4">
                <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-accent/10 blur-2xl" />
                <div className="relative flex items-center gap-4">
                  <TeamCrest name={clubGoals[0].name} crestUrl={clubGoals[0].crestUrl} color={clubGoals[0].color} className="h-20 w-20" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-accent">Clube em que mais marcou</p>
                    <p className="mt-1 truncate text-lg font-black text-foreground">{clubGoals[0].name}</p>
                    <p className="mt-1"><span className="player-card-number text-3xl text-accent">{clubGoals[0].totalGoals}</span> <span className="text-[10px] font-black uppercase text-muted">gols</span></p>
                  </div>
                </div>
              </div>
              <div className="glass-card overflow-hidden">
                {clubGoals.map((club, index) => (
                  <div key={club.key} className={`flex items-center gap-3 px-4 py-3 ${index < clubGoals.length - 1 ? "border-b border-border" : ""}`}>
                    <TeamCrest name={club.name} crestUrl={club.crestUrl} color={club.color} className="h-11 w-11" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-foreground">{club.name}</p>
                      <p className="mt-0.5 text-[9px] text-muted">{club.officialGoals} Ranked · {club.friendlyGoals} amistosos</p>
                    </div>
                    <div className="text-right"><p className="player-card-number text-2xl text-accent">{club.totalGoals}</p><p className="text-[8px] font-black uppercase text-muted">gols</p></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="glass-card p-5 text-center text-xs text-muted">Nenhum gol por clube registrado ainda.</div>
          )}
        </section>

        <FantasyPlayerCard summary={fantasySummary} />
        <section><div className="mb-3 px-1"><h3 className="text-xs font-bold uppercase tracking-wider text-muted">Prêmios oficiais</h3><p className="mt-1 text-[10px] text-muted/70">Rodadas e títulos da temporada Ranked.</p></div><PlayerAwards seasons={awardSeasons} /></section>
        <section><h3 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-muted">Histórico Ranked</h3><History rows={officialHistory} /></section>
        <section><h3 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-muted">Histórico de Amistosos</h3><History rows={friendlyHistory} friendly /></section>
      </>}
    </div>
  );
}
