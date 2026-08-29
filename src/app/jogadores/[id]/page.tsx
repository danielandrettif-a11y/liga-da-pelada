import { getPlayer, getPlayerAwardSeasons, getPlayerGoalsByClub, getPlayerPlaytime, getPlayerRoundHistory } from "@/lib/actions/players";
import { getPlayerFitnessSummaries } from "@/lib/actions/fitness";
import { aggregatePlayerStats, calculateWinRate, formatDateShort, formatDuration } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerProfileBadge } from "@/components/PlayerProfileBadge";
import { PlayerAwards } from "@/components/PlayerAwards";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Football, Target, TrendingUp, Trophy } from "@/components/icons";
import { TeamCrest } from "@/components/TeamCrest";
import { FantasyPlayerCard } from "@/components/fantasy/FantasyPlayerCard";
import { getFantasyPlayerSummary } from "@/lib/actions/fantasy";
import { getPlayerEquippedCosmetics } from "@/lib/actions/cosmetics";
import { cosmeticBackgroundPosition, cosmeticImage, cosmeticNameplateClass, cosmeticVisual } from "@/lib/fantasy/cosmetics";

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

function aggregateGoalkeeperStats(rows: HistoryRow[]) {
  return rows.reduce((total, row) => ({
    games: total.games + Number((row as any).goalkeeper_games || 0),
    cleanSheets: total.cleanSheets + Number((row as any).clean_sheets || 0),
    conceded: total.conceded + Number((row as any).goals_conceded || 0),
  }), { games: 0, cleanSheets: 0, conceded: 0 });
}

export default async function JogadorPerfilPage({ params }: PageProps<"/jogadores/[id]">) {
  const { id } = await params;
  const [player, officialHistory, friendlyHistory, awardSeasons, fitness, clubGoals, fantasySummary, cosmetics, playtime] = await Promise.all([
    getPlayer(id),
    getPlayerRoundHistory(id, "official"),
    getPlayerRoundHistory(id, "friendly"),
    getPlayerAwardSeasons(id),
    getPlayerFitnessSummaries(id),
    getPlayerGoalsByClub(id),
    getFantasyPlayerSummary(id),
    getPlayerEquippedCosmetics(id),
    getPlayerPlaytime(id),
  ]);
  if (!player) notFound();
  const isPlayable = player.is_selectable && (player.member_category === "player" || player.member_category === "guest");
  const official = aggregatePlayerStats(officialHistory);
  const friendly = aggregatePlayerStats(friendlyHistory);
  const officialGoalkeeper = aggregateGoalkeeperStats(officialHistory);
  const friendlyGoalkeeper = aggregateGoalkeeperStats(friendlyHistory);
  const categoryLabel = player.member_category === "player" ? "Jogador oficial" : player.member_category === "guest" ? "Convidado" : player.member_category === "wag" ? "WAG" : "Torcida";

  const cardGradient = cosmetics?.bannerAssetKey
    ? `bg-gradient-to-b ${cosmeticVisual(cosmetics.bannerAssetKey)}/30`
    : "";
  const bannerImage = cosmeticImage(cosmetics?.bannerAssetKey);
  const profileBackgroundImage = cosmeticImage(cosmetics?.backgroundAssetKey);

  return (
    <div className="relative -mx-4 -mt-4 min-h-[calc(100dvh-3.5rem)] px-4 pb-4 pt-4">
      {/* Fundo Cosmético Imersivo Fixado na Viewport (não estica com o scroll da página, 100% nítido no celular e PC) */}
      {profileBackgroundImage && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-[#06100a]"
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(2, 14, 8, 0.48) 0%, rgba(2, 14, 8, 0.78) 45%, rgba(2, 14, 8, 0.96) 100%), url(${profileBackgroundImage})`,
            backgroundSize: "cover",
            backgroundPosition: cosmeticBackgroundPosition("background", cosmetics?.backgroundAssetKey),
            backgroundRepeat: "no-repeat",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,transparent_0%,rgba(2,14,8,.22)_48%,rgba(2,14,8,.65)_100%)]" />
        </div>
      )}

      <div className="relative z-10 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/jogadores" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-sm hover:bg-surface-hover transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted" />
          </Link>
          <h1 className="text-sm font-bold uppercase tracking-wider text-foreground">Perfil</h1>
        </div>

        {/* Card do Perfil com Capa e Visual Otimizados */}
        <div className={`glass-card relative overflow-hidden flex flex-col items-center p-6 text-center shadow-xl ${cardGradient}`}>
          {/* Imagem da Capa com enquadramento perfeito */}
          {bannerImage && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 opacity-90"
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(3, 14, 8, 0.35) 0%, rgba(3, 14, 8, 0.72) 55%, rgba(3, 14, 8, 0.94) 100%), url(${bannerImage})`,
                backgroundSize: "cover",
                backgroundPosition: cosmeticBackgroundPosition("banner", cosmetics?.bannerAssetKey),
                backgroundRepeat: "no-repeat",
              }}
            />
          )}
          {cosmetics?.bannerAssetKey && (
            <div className="pointer-events-none absolute inset-0 z-0 opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent via-transparent to-transparent" />
          )}

          {/* Conteúdo em z-10 para manter nitidez e legibilidade máxima */}
          <div className="relative z-10 flex flex-col items-center w-full">
            <div className="relative mb-4">
              <PlayerAvatar
                name={player.name}
                avatarUrl={player.avatar_url}
                frameKey={cosmetics?.frameKey}
                auraKey={cosmetics?.auraKey}
                className="h-24 w-24 rounded-full bg-surface text-2xl font-bold text-muted ring-2 ring-border shadow-lg"
              />
            </div>
            <h2 className="text-2xl font-bold text-foreground drop-shadow-sm">{player.name}</h2>
            {cosmetics?.titleName ? (
              <p className={`mt-1 inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs font-black uppercase tracking-wide shadow-sm ${cosmeticNameplateClass(cosmetics.nameplateKey)}`}>
                ✨ {cosmetics.titleName}
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-border bg-surface/50 backdrop-blur-xs px-2.5 py-1 text-[9px] font-black uppercase text-muted">{categoryLabel}</span>
              {isPlayable && <PlayerProfileBadge profile={player.player_profile} isGoalkeeper={player.is_goalkeeper} />}
            </div>
            {player.profile_bio && <p className="mt-5 max-w-xl text-sm leading-6 text-muted">{player.profile_bio}</p>}
            {isPlayable && (
              <div className="mt-6 inline-flex items-center gap-4 rounded-2xl border border-border bg-surface/60 backdrop-blur-sm px-6 py-3 shadow-sm">
                <div>
                  <p className="text-[9px] font-bold uppercase text-muted">Pontos</p>
                  <p className="stat-number text-2xl text-accent">{official.points}</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                  <p className="text-[9px] font-bold uppercase text-muted">Aprov.</p>
                  <p className="stat-number text-xl text-foreground">{calculateWinRate(official.wins, official.draws, official.games)}%</p>
                </div>
              </div>
            )}
          </div>
        </div>

      {isPlayable && <section className="rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-300/10 via-surface/85 to-surface/70 p-4 shadow-[0_0_24px_rgba(251,191,36,.06)]"><div className="mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-300" /><div><h3 className="text-xs font-black uppercase tracking-wider text-foreground">Prêmios individuais</h3><p className="mt-0.5 text-[10px] text-muted">Artilheiro, Garçom, Xerife e títulos da temporada Ranked.</p></div></div><PlayerAwards seasons={awardSeasons} /></section>}

      {!isPlayable ? <div className="glass-card p-6 text-center"><p className="text-sm font-black text-foreground">Parte da comunidade da Pelada</p><p className="mt-1 text-xs text-muted">O histórico esportivo está preservado, mas fica oculto enquanto este perfil não for um jogador selecionável.</p></div> : <>
        {([['Ranked', official], ['Amistosos', friendly]] as const).map(([label, stats]) => <section key={label}><h3 className="mb-3 px-1 text-xs font-black uppercase tracking-wider text-muted">{label}</h3><div className="grid grid-cols-4 gap-2">{([['Peladas', stats.rounds || 0], ['Jogos', stats.games], ['Gols', stats.goals], ['Assists', stats.assists], ['Vitórias', stats.wins], ['Empates', stats.draws], ['Derrotas', stats.losses], ['Aprov.', `${calculateWinRate(stats.wins, stats.draws, stats.games)}%`]] as const).map(([key, value]) => <div key={key} className="glass-card p-3 text-center"><p className="text-lg font-black text-foreground">{value}</p><p className="text-[8px] font-bold uppercase text-muted">{key}</p></div>)}</div></section>)}

        <section><div className="mb-3 px-1"><h3 className="text-xs font-black uppercase tracking-wider text-muted">Tempo em quadra</h3><p className="mt-1 text-[10px] text-muted/70">Soma do tempo em que você esteve escalado nas partidas.</p></div><div className="grid grid-cols-3 gap-2"><div className="glass-card p-3 text-center"><p className="text-xl font-black text-accent">{formatDuration(playtime.totalSeconds)}</p><p className="text-[8px] font-bold uppercase text-muted">Total</p></div><div className="glass-card p-3 text-center"><p className="text-xl font-black text-foreground">{formatDuration(playtime.officialSeconds)}</p><p className="text-[8px] font-bold uppercase text-muted">Ranked</p></div><div className="glass-card p-3 text-center"><p className="text-xl font-black text-foreground">{formatDuration(playtime.friendlySeconds)}</p><p className="text-[8px] font-bold uppercase text-muted">Amistosos</p></div></div></section>

        {(officialGoalkeeper.games > 0 || friendlyGoalkeeper.games > 0) && <section><div className="mb-3 px-1"><h3 className="text-xs font-black uppercase tracking-wider text-muted">Histórico no gol</h3><p className="mt-1 text-[10px] text-muted/70">Atuações registradas como goleiro efetivo da partida.</p></div><div className="grid gap-3 sm:grid-cols-2">{([['Ranked', officialGoalkeeper], ['Amistosos', friendlyGoalkeeper]] as const).map(([label, stats]) => <div key={label} className="glass-card p-4"><p className="text-[9px] font-black uppercase text-accent">{label}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center">{([['Jogos no gol', stats.games], ['Sem sofrer', stats.cleanSheets], ['Gols sofridos', stats.conceded]] as const).map(([key, value]) => <div key={key}><p className="stat-number text-xl text-foreground">{value}</p><p className="mt-1 text-[8px] font-bold uppercase leading-tight text-muted">{key}</p></div>)}</div></div>)}</div></section>}

        {fitness && <section><div className="mb-3 flex items-center gap-2 px-1"><TrendingUp className="h-4 w-4 text-accent" /><h3 className="text-xs font-black uppercase tracking-wider text-muted">Dados físicos autorizados</h3></div><div className="grid grid-cols-2 gap-3">{([['Ranked', fitness.official], ['Amistosos', fitness.friendly]] as const).map(([label, summary]) => <div key={label} className="glass-card p-4"><p className="text-[9px] font-black uppercase text-muted">{label}</p><p className="mt-1 text-xl font-black text-foreground">{summary.distanceKm} km</p><p className="text-[10px] text-muted">média {summary.metersPerMinute || Math.round((summary.averageSpeedKmh * 1000) / 60)} m/min</p></div>)}</div></section>}

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
        <section><h3 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-muted">Histórico Ranked</h3><History rows={officialHistory} /></section>
        <section><h3 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-muted">Histórico de Amistosos</h3><History rows={friendlyHistory} friendly /></section>
      </>}
      </div>
    </div>
  );
}
