import {
  CalendarDays,
  Camera,
  ChevronRight,
  LogIn,
  TrendingUp,
} from "@/components/icons";
import { cache, Suspense } from "react";
import { WeatherBadge } from "@/components/WeatherBadge";
import { BQTheBestButton } from "@/components/BQTheBestButton";
import { getEventWeather, type EventWeather } from "@/lib/weather";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getHomeAgenda, getHomeLastRound } from "@/lib/actions/dashboard";
import { homeTraceId } from "@/lib/home-performance";
import { HomeReadyMarker } from "@/components/HomeReadyMarker";
import { getLatestFinishedSeason } from "@/lib/actions/seasons";
import { PreviousSeasonBanner } from "@/components/PreviousSeasonBanner";
import { LiveMatchBanner, type HomeLiveMatch } from "@/components/LiveMatchBanner";
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
      <span className="profile-reminder-track flex w-max items-center whitespace-nowrap text-xs font-black uppercase tracking-wide">
        {[false, true].map((duplicate) => (
          <span key={String(duplicate)} aria-hidden={duplicate || undefined} className="flex shrink-0 items-center gap-2 px-4 pr-12">
            <Camera className="h-4 w-4" />
            Cadastro incompleto: falta adicionar sua foto — toque aqui
          </span>
        ))}
      </span>
    </Link>
  );
}

async function HomeSeasonPass() {
  const data = await getSeasonPassDashboard().catch(() => null);
  return <SeasonPassBanner pass={data || undefined} compact />;
}

async function HomePreviousSeason() {
  const summary = await getLatestFinishedSeason().catch(() => null);
  return summary ? <PreviousSeasonBanner summary={summary} /> : null;
}

async function HomeLastRound() {
  const round = await getHomeLastRound().catch(() => null);
  return round ? <HomeLastRoundSummary round={round} /> : null;
}

type HomeWeatherEvent = {
  stadiumId?: string | null;
  date?: string | null;
  time?: string | null;
};

const getHomeStadium = cache(async (stadiumId: string) => {
  const { client } = await getCurrentAccount();
  const { data } = await client.from("stadiums").select("latitude, longitude").eq("id", stadiumId).maybeSingle();
  return data;
});

async function readHomeWeather(event: HomeWeatherEvent | null, durationMinutes: number) {
  if (!event?.stadiumId || !event.date || !event.time) return null;
  const stadium = await getHomeStadium(event.stadiumId);
  return getEventWeather({
    latitude: stadium?.latitude,
    longitude: stadium?.longitude,
    date: event.date,
    startTime: event.time,
    durationMinutes,
  });
}

async function HomeWeather({ events, duration, location }: {
  events: Array<HomeWeatherEvent | null>;
  duration: number;
  location?: string | null;
}) {
  let weather: EventWeather | null = null;
  for (const event of events) {
    if (weather) break;
    weather = await readHomeWeather(event, duration).catch(() => null);
  }
  return <WeatherBadge weather={weather} locationName={location} />;
}

async function HomeMonthlyAwards() {
  const { periodStart, winners } = await getPreviousMonthAwardWinners();
  return <BQTheBestButton periodStart={periodStart} winners={winners} />;
}

async function HomeProfileReminder() {
  const account = await getCurrentAccount();
  if (!account.user || !account.profile?.player_id) return null;
  const { avatarUrl } = await getCurrentAccountIdentity();
  const inherited = [account.user.user_metadata?.avatar_url, account.user.user_metadata?.picture];
  return avatarUrl === null || inherited.includes(avatarUrl) ? <IncompleteProfileBanner /> : null;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ inviteError?: string; home_trace?: string }> }) {
  const query = await searchParams;
  const [data, account, selectedLeague] = await Promise.all([
    getHomeAgenda(homeTraceId(query.home_trace)).catch(() => null),
    getCurrentAccount(),
    getSelectedLeague(),
  ]);
  if (account.user && (!account.memberships.length || !selectedLeague)) redirect("/lobby");
  if (!data) {
    return (
      <div className="space-y-6">
        {!account.user && <JoinSelectionButton />}
        <Suspense fallback={null}><HomeProfileReminder /></Suspense>
        <div className="flex flex-col items-center justify-center p-8 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-surface-hover flex items-center justify-center mb-4">
            <TrendingUp className="w-8 h-8 text-muted" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Agenda indisponível</h2>
          <p className="text-muted text-sm mb-6">
            A agenda não pôde ser carregada agora.
          </p>
          <a href="/" className="btn-primary w-full">Tentar novamente</a>
        </div>
      </div>
    );
  }

  const { nextRound, activeCallups, liveMatch, matchDuration, venue, eventDurationMinutes } = data;

  const matchingCallup = activeCallups.find((callup) =>
    callup.roundType === "official" && (callup.roundId === nextRound?.id || callup.date === nextRound?.date),
  );
  const weatherForCallup = (callup: any): HomeWeatherEvent | null => callup
    ? { stadiumId: callup.stadiumId, date: callup.date, time: callup.startTime }
    : null;

  return (
    <div className="space-y-5 pt-1 sm:pt-0">
      {!account.user && <JoinSelectionButton />}
      <Suspense fallback={null}><HomeProfileReminder /></Suspense>
      {selectedLeague?.featureTier === "quick" && <section className="rounded-2xl border border-accent/30 bg-accent/[.07] p-4"><p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">Pelada descartável</p><h1 className="mt-1 font-athletic text-2xl font-black uppercase text-white">Você está no controle</h1><p className="mt-2 text-xs leading-5 text-muted">Cadastre apenas os convidados, monte os times e use o placar ao vivo. Esta sessão não gera ranking.</p><div className="mt-3 grid grid-cols-2 gap-2"><Link href="/rodadas" className="rounded-xl bg-accent px-3 py-2.5 text-center text-xs font-black text-background">Partidas e histórico</Link><Link href="/pagamentos" className="rounded-xl border border-accent/35 px-3 py-2.5 text-center text-xs font-black text-accent">Transfermarket</Link></div></section>}

      <LiveMatchBanner
        initialMatch={liveMatch as unknown as HomeLiveMatch | null}
        matchDuration={matchDuration}
      />

      {/* Carrossel principal unificado: convocação e próxima rodada. */}
      <section className="space-y-3" data-home-agenda>
        <HomeReadyMarker />
        <div className="px-1">
          <h2 className="font-athletic text-sm font-black uppercase italic tracking-wider text-foreground">
            {activeCallups.length > 0 || account.isAdmin ? "Agenda e gestão" : "Próxima Rodada"}
          </h2>
        </div>

        {(() => {
          const callupSlides = activeCallups.map((callup) => {
            const { userEntry } = callup;
            return {
              userEntry,
              slide: <OpenCallupBanner key={callup.id} callup={callup} userEntry={userEntry} weatherBadge={
                <Suspense fallback={null}>
                  <HomeWeather events={[weatherForCallup(callup)]} duration={eventDurationMinutes} location={callup.stadiumName} />
                </Suspense>
              } />,
            };
          });

          const roundSlide = (
            <NextRoundBanner
              key="round"
              round={nextRound}
              isAdmin={account.isAdmin}
              venue={venue}
              eventDurationMinutes={eventDurationMinutes}
              weatherBadge={nextRound && (
                <Suspense fallback={null}>
                  <HomeWeather
                    events={[weatherForCallup(matchingCallup), { stadiumId: nextRound.stadium_id, date: nextRound.date, time: nextRound.start_time }]}
                    duration={eventDurationMinutes}
                    location={venue?.name}
                  />
                </Suspense>
              )}
              awards={<Suspense fallback={null}><HomeMonthlyAwards /></Suspense>}
            />
          );

          const hasConfirmedPresence = callupSlides.some(
            ({ userEntry }: { userEntry: any }) => userEntry?.status === "confirmed",
          );
          const inviteSlide = account.isAdmin && selectedLeague?.featureTier !== "quick"
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

      {selectedLeague?.featureTier === "complete" && <Suspense fallback={null}><HomeSeasonPass /></Suspense>}

      {selectedLeague?.featureTier !== "quick" && <Suspense fallback={null}><HomePreviousSeason /></Suspense>}

      {selectedLeague?.featureTier !== "quick" && <Suspense fallback={<HomeRankingPreviewFallback />}>
        <HomeRankingPreview />
      </Suspense>}

      <Suspense fallback={null}><HomeLastRound key={selectedLeague?.id} /></Suspense>
    </div>
  );
}
