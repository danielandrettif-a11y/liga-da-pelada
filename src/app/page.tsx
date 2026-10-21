import {
  CalendarDays,
  Camera,
  ChevronRight,
  LogIn,
  TrendingUp,
} from "@/components/icons";
import { Suspense } from "react";
import Link from "next/link";
import { getDashboardData } from "@/lib/actions/dashboard";
import { getLatestFinishedSeason } from "@/lib/actions/seasons";
import { PreviousSeasonBanner } from "@/components/PreviousSeasonBanner";
import { LiveMatchBanner, type HomeLiveMatch } from "@/components/LiveMatchBanner";
import { PreSeasonBanner } from "@/components/PreSeasonBanner";
import { HomeHeroCarousel } from "@/components/HomeHeroCarousel";
import { NextRoundBanner } from "@/components/NextRoundBanner";
import { OpenCallupBanner } from "@/components/OpenCallupBanner";
import { HomeLastRoundSummary } from "@/components/HomeLastRoundSummary";
import { getCurrentAccount, getCurrentAccountIdentity } from "@/lib/auth";
import { getSeasonPassDashboard } from "@/lib/actions/fantasy";
import { SeasonPassBanner } from "@/components/fantasy/SeasonPassBanner";
import { getPreviousMonthAwardWinners } from "@/lib/actions/players";
import { LeagueInviteCard } from "@/components/LeagueInviteCard";
import { getSelectedLeague } from "@/lib/league-context";
import { HomeRankingPreview, HomeRankingPreviewFallback } from "@/components/HomeRankingPreview";

export const dynamic = "force-dynamic";

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

export default async function HomePage({ searchParams }: { searchParams: Promise<{ inviteError?: string }> }) {
  const query = await searchParams;
  const accountPromise = getCurrentAccount();
  const selectedLeaguePromise = getSelectedLeague();
  const [{ data }, previousSeason, account, identity, seasonPass, monthlyAwards, selectedLeague] = await Promise.all([
    getDashboardData(),
    getLatestFinishedSeason(),
    accountPromise,
    getCurrentAccountIdentity(),
    selectedLeaguePromise.then((league) => league?.featureTier === "complete" ? getSeasonPassDashboard() : null),
    getPreviousMonthAwardWinners(),
    selectedLeaguePromise,
  ]);
  const inheritedGoogleAvatars = [
    account.user?.user_metadata?.avatar_url,
    account.user?.user_metadata?.picture,
  ].filter(Boolean);
  const hasIncompleteProfile = Boolean(
    account.user
      && account.profile?.player_id
      && (identity.avatarUrl === null || inheritedGoogleAvatars.includes(identity.avatarUrl)),
  );
  
  if (!data) {
    return (
      <div className="space-y-6">
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

  const { nextRound, nextFriendly, preseasonEnabled, activeCallups = [], liveMatch, matchDuration, venue, nextRoundWeather, eventDurationMinutes, lastRound } = data;

  const currentPlayerId = account.profile?.player_id || null;

  return (
    <div className="space-y-5">
      {!account.user && <JoinSelectionButton />}
      {hasIncompleteProfile && <IncompleteProfileBanner />}

      <LiveMatchBanner
        initialMatch={liveMatch as unknown as HomeLiveMatch | null}
        matchDuration={matchDuration}
      />

      {/* Carrossel Principal Unificado (Convocação + Rodada/Pré-lista) */}
      <section className="space-y-3">
        <div className="px-1">
          <h2 className="font-athletic text-sm font-black uppercase italic tracking-wider text-foreground">
            {activeCallups.length > 0 || account.isAdmin ? "Agenda e gestão" : "Próxima Rodada"}
          </h2>
        </div>

        {(() => {
          const callupSlides = activeCallups.map((callup: any) => {
            const userEntry = currentPlayerId
              ? (callup.entries || []).find((entry: any) => entry.playerId === currentPlayerId) || null
              : null;
            return {
              userEntry,
              slide: <OpenCallupBanner key={callup.id} callup={callup} userEntry={userEntry} />,
            };
          });

          const roundSlide = preseasonEnabled ? (
            <PreSeasonBanner key="friendly" isAdmin={account.isAdmin} friendly={nextFriendly} />
          ) : (
            <NextRoundBanner
              key="round"
              round={nextRound}
              isAdmin={account.isAdmin}
              venue={venue}
              eventDurationMinutes={eventDurationMinutes}
              weather={nextRoundWeather}
              awardsPeriodStart={monthlyAwards.periodStart}
              awardWinners={monthlyAwards.winners}
            />
          );

          const hasConfirmedPresence = callupSlides.some(
            ({ userEntry }: { userEntry: any }) => userEntry?.status === "confirmed",
          );
          const inviteSlide = account.isAdmin
            ? <LeagueInviteCard key="league-invite" variant="hero" returnTo="/" error={query.inviteError === "review"} />
            : null;
          // A convocação exige ação enquanto a presença ainda estiver pendente.
          // Depois da confirmação, a temporada/rodada vira a informação principal.
          const slides = (hasConfirmedPresence
            ? [roundSlide, ...callupSlides.map(({ slide }: { slide: React.ReactNode }) => slide), inviteSlide]
            : [...callupSlides.map(({ slide }: { slide: React.ReactNode }) => slide), roundSlide, inviteSlide]
          ).filter(Boolean);

          if (slides.length > 1) {
            return <HomeHeroCarousel>{slides}</HomeHeroCarousel>;
          }

          return slides[0] || null;
        })()}
      </section>

      {selectedLeague?.featureTier === "complete" && <SeasonPassBanner pass={seasonPass || undefined} compact />}

      {previousSeason && <PreviousSeasonBanner summary={previousSeason} />}

      <Suspense fallback={<HomeRankingPreviewFallback />}>
        <HomeRankingPreview />
      </Suspense>

      {lastRound && <HomeLastRoundSummary round={lastRound} />}
    </div>
  );
}
