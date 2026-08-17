import {
  CalendarDays,
  Camera,
  ChevronRight,
  ClipboardList,
  Football,
  LogIn,
  Medal,
  Target,
  TrendingUp,
  Trophy,
  type SportIconProps,
} from "@/components/icons";
import type { ComponentType } from "react";
import Link from "next/link";
import { getDashboardData } from "@/lib/actions/dashboard";
import { getLatestFinishedSeason } from "@/lib/actions/seasons";
import { PreviousSeasonBanner } from "@/components/PreviousSeasonBanner";
import { GreetingBanner } from "@/components/GreetingBanner";
import { LiveMatchBanner, type HomeLiveMatch } from "@/components/LiveMatchBanner";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PreSeasonBanner } from "@/components/PreSeasonBanner";
import { HomeHeroCarousel } from "@/components/HomeHeroCarousel";
import { NextRoundBanner } from "@/components/NextRoundBanner";
import { OpenCallupBanner } from "@/components/OpenCallupBanner";
import { TeamCrest } from "@/components/TeamCrest";
import { getAccountDisplayName, getCurrentAccount } from "@/lib/auth";

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
  Icon,
  label,
  playerName,
  value,
  unit,
  delay,
}: {
  Icon: ComponentType<SportIconProps>;
  label: string;
  playerName: string;
  value: number;
  unit: string;
  delay: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0d2417] to-[#06100b] p-4 shadow-[0_14px_32px_rgba(0,0,0,.2)] animate-fade-in-up ${delay}`}>
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-accent/40 to-transparent" />
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-5 w-5 text-accent" />
        <span className="font-athletic text-xs font-bold uppercase italic tracking-wider text-muted">
          {label}
        </span>
      </div>
      <p className="text-base font-bold text-foreground truncate">{playerName || "-"}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="stat-number text-3xl text-accent">{value || 0}</span>
        <span className="text-xs text-muted font-medium">{unit}</span>
      </div>
    </div>
  );
}

function JoinSelectionButton() {
  return (
    <Link
      href="/login"
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/50 bg-accent/10 px-4 py-3.5 text-sm font-black text-accent transition-colors hover:bg-accent/15"
    >
      <LogIn className="h-5 w-5" />
      Entrar na Seleção
    </Link>
  );
}

function IncompleteProfileBanner() {
  return (
    <Link
      href="/meu-perfil"
      className="block overflow-hidden rounded-xl border border-warning/50 bg-warning/10 py-3 text-warning"
      aria-label="Cadastro incompleto. Adicione uma foto ao seu perfil."
    >
      <span className="profile-reminder-track flex w-max items-center gap-2 whitespace-nowrap px-4 text-xs font-black uppercase tracking-wide">
        <Camera className="h-4 w-4" />
        Cadastro incompleto: falta adicionar sua foto — toque aqui
      </span>
    </Link>
  );
}

export default async function HomePage() {
  const accountPromise = getCurrentAccount();
  const playerAvatarPromise = accountPromise.then(async (account) => {
    if (!account.profile?.player_id) return undefined;

    const { data: player } = await account.client
      .from("players")
      .select("avatar_url")
      .eq("id", account.profile.player_id)
      .maybeSingle();

    return player ? player.avatar_url : undefined;
  });
  const [{ data }, previousSeason, account, accountName, playerAvatarUrl] = await Promise.all([
    getDashboardData(),
    getLatestFinishedSeason(),
    accountPromise,
    accountPromise.then(getAccountDisplayName),
    playerAvatarPromise,
  ]);
  const inheritedGoogleAvatars = [
    account.user?.user_metadata?.avatar_url,
    account.user?.user_metadata?.picture,
  ].filter(Boolean);
  const hasIncompleteProfile = Boolean(
    account.user
      && account.profile?.player_id
      && (playerAvatarUrl === null || inheritedGoogleAvatars.includes(playerAvatarUrl)),
  );
  
  if (!data) {
    return (
      <div className="space-y-8">
        <GreetingBanner name={accountName} />
        {!account.user && <JoinSelectionButton />}
        {hasIncompleteProfile && <IncompleteProfileBanner />}
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
      </div>
    );
  }

  const { nextRound, nextFriendly, preseasonEnabled, activeCallup, liveMatch, matchDuration, venue, eventDurationMinutes, lastRound, rankingPreview, highlights } = data;

  const currentPlayerId = account.profile?.player_id || null;
  const userEntry = activeCallup && currentPlayerId
    ? (activeCallup.entries || []).find((entry: any) => entry.playerId === currentPlayerId) || null
    : null;

  return (
    <div className="space-y-6">
      <GreetingBanner name={accountName} />

      {!account.user && <JoinSelectionButton />}
      {hasIncompleteProfile && <IncompleteProfileBanner />}

      <LiveMatchBanner
        initialMatch={liveMatch as unknown as HomeLiveMatch | null}
        matchDuration={matchDuration}
      />

      {activeCallup && <OpenCallupBanner callup={activeCallup} userEntry={userEntry} />}

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-athletic text-sm font-black uppercase italic tracking-wider text-foreground">{preseasonEnabled ? "Em destaque" : "Rodadas"}</h2>
          <Link href="/rodadas" className="flex items-center gap-1 text-xs font-bold text-accent">
            Ver todas
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {preseasonEnabled ? (
          <HomeHeroCarousel>
            <PreSeasonBanner isAdmin={account.isAdmin} friendly={nextFriendly} />
            <NextRoundBanner round={nextRound} isAdmin={account.isAdmin} venue={venue} eventDurationMinutes={eventDurationMinutes} />
          </HomeHeroCarousel>
        ) : (
          <NextRoundBanner round={nextRound} isAdmin={account.isAdmin} venue={venue} eventDurationMinutes={eventDurationMinutes} />
        )}
      </section>

      {previousSeason && <PreviousSeasonBanner summary={previousSeason} />}

      {/* Highlights Section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-accent" />
          <h2 className="font-athletic text-base font-black uppercase italic tracking-wider text-foreground">
            Destaques da Temporada
          </h2>
        </div>

        {/* Carrossel Horizontal para Mobile */}
        <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-4 -mx-4 px-4 hide-scrollbar">
          <div className="min-w-[150px] snap-center shrink-0">
            <StatHighlightCard
              Icon={Football}
              label="Líder de gols"
              playerName={highlights?.topScorer?.player?.name}
              value={highlights?.topScorer?.goals}
              unit="gols"
              delay="stagger-1"
            />
          </div>
          <div className="min-w-[150px] snap-center shrink-0">
            <StatHighlightCard
              Icon={Target}
              label="Líder de assistências"
              playerName={highlights?.topAssists?.player?.name}
              value={highlights?.topAssists?.assists}
              unit="assists"
              delay="stagger-2"
            />
          </div>
          <div className="min-w-[150px] snap-center shrink-0">
            <StatHighlightCard
              Icon={Trophy}
              label="Vitórias"
              playerName={highlights?.topWins?.player?.name}
              value={highlights?.topWins?.wins}
              unit="vitórias"
              delay="stagger-3"
            />
          </div>
        </div>
      </section>

      {/* Ranking Preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 font-athletic text-base font-black uppercase italic tracking-wider text-foreground">
            <Medal className="h-5 w-5 text-accent" /> Top 5 Ranking
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
              const name = stats.player?.name || "Desconhecido";
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
                  
                  {/* Foto do jogador, com iniciais apenas como fallback */}
                  <PlayerAvatar
                    name={name}
                    avatarUrl={stats.player?.avatar_url}
                    className="h-9 w-9 flex-shrink-0 rounded-full border border-border bg-surface-hover text-xs font-bold text-muted"
                  />

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-[10px] text-muted">
                        <Football className="h-3 w-3" /> {stats.goals}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted">
                        <Target className="h-3 w-3" /> {stats.assists}
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
          <h2 className="mb-3 flex items-center gap-2 font-athletic text-base font-black uppercase italic tracking-wider text-foreground">
            <ClipboardList className="h-5 w-5 text-accent" /> Última Rodada
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
                        <TeamCrest name={match.teamA?.name || "Time A"} crestUrl={match.teamA?.crest_url} color={match.teamA?.color} className="h-4 w-4" />
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
                        <TeamCrest name={match.teamB?.name || "Time B"} crestUrl={match.teamB?.crest_url} color={match.teamB?.color} className="h-4 w-4" />
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
