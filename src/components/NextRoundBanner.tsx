import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  Football,
  MapPin,
  Trophy,
  Users,
} from "@/components/icons";

type NextRound = {
  id: string;
  number: number;
  date: string;
  start_time?: string | null;
  status: "draft" | "active" | "finished";
  preparation_stage?: "prelist" | "teams_ready";
  confirmedPlayers?: number;
};

export function NextRoundBanner({
  round,
  isAdmin = false,
  venue,
  eventDurationMinutes = 120,
  activeCallup = null,
}: {
  round: NextRound | null;
  isAdmin?: boolean;
  venue?: { name?: string | null; mapUrl?: string | null } | null;
  eventDurationMinutes?: number;
  activeCallup?: { id?: string; confirmed?: number; capacity?: number } | null;
}) {
  const isPrelist = round?.preparation_stage === "prelist";
  const hasOpenCallup = Boolean(activeCallup);
  const confirmedCount = (activeCallup && activeCallup.confirmed != null)
    ? activeCallup.confirmed
    : (round?.confirmedPlayers || 0);

  const href = round
    ? isAdmin && isPrelist
      ? `/admin/rodada?round=${round.id}&mount=1`
      : isAdmin
      ? `/rodadas/${round.id}`
      : hasOpenCallup
      ? "/convocacao"
      : "/rodadas"
    : "/rodadas";

  const formattedDate = round
    ? new Date(`${round.date}T00:00:00`).toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      })
    : null;
  const formattedTime = round?.start_time?.slice(0, 5) || null;

  return (
    <article className="group relative isolate flex h-full min-h-[360px] sm:min-h-[380px] flex-col justify-between overflow-hidden rounded-[2rem] border border-amber-500/30 bg-[#040f08] p-5 sm:p-6 shadow-[0_25px_65px_rgba(0,0,0,.65),0_0_35px_rgba(245,158,11,.12)]">
      {/* Link de cobertura em todo o banner */}
      <Link
        href={href}
        className="absolute inset-0 z-10"
        aria-label={
          round
            ? isAdmin && isPrelist
              ? "Retomar pré-lista"
              : "Abrir rodada oficial"
            : "Abrir histórico de rodadas"
        }
      />

      {/* Imagem de Fundo com Troféu e Estádio */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-right sm:bg-center opacity-45 transition-transform duration-700 ease-out group-hover:scale-105"
        style={{
          backgroundImage: "url('/images/championship-trophy-banner.jpg')",
        }}
      />

      {/* Gradientes e Iluminação Dinâmica para Contraste Boleiro Perfeito */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#030d07] via-[#04130b]/80 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#030e07] via-[#04140b]/90 to-transparent sm:via-[#04140b]/70" />
      <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl transition-transform duration-700 group-hover:scale-125" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-60 w-60 rounded-full bg-accent/20 blur-3xl" />

      {/* Conteúdo do Banner */}
      <div className="pointer-events-none relative z-20 flex h-full flex-col justify-between gap-4">
        {/* Topo do Banner: Selo da Liga + Troféu Dourado */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-emerald-500/20 px-3.5 py-1.5 font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)] backdrop-blur-md">
              <Football className="h-3.5 w-3.5 text-accent animate-pulse" />
              <span>Temporada Oficial · Pelada BQ</span>
            </span>
          </div>

          <Link
            href="/ranking"
            className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/25 to-black/40 text-amber-300 hover:text-amber-200 hover:scale-105 hover:border-amber-400 transition-all shadow-[0_0_20px_rgba(245,158,11,0.25)] backdrop-blur-md"
            title="Ver Ranking da Liga"
            aria-label="Ver Ranking da Liga"
          >
            <Trophy className="h-6 w-6" />
          </Link>
        </div>

        {/* Informações Centrais: Título Boleiro e Convocados */}
        <div className="max-w-[85%] space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(204,255,0,0.8)]" />
            <p className="font-athletic text-xs font-black uppercase italic tracking-[0.25em] text-amber-300">
              {isPrelist
                ? "Pré-lista em Montagem"
                : round?.status === "active"
                ? "Bola Rolando ao Vivo"
                : "Próximo Confronto"}
            </p>
          </div>

          <h2 className="font-athletic text-[34px] sm:text-5xl font-black uppercase italic leading-[.9] tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
            {round ? (
              <>
                Rodada{" "}
                <span className="bg-gradient-to-r from-accent via-emerald-300 to-amber-300 bg-clip-text text-transparent">
                  {String(round.number).padStart(2, "0")}
                </span>
              </>
            ) : (
              <>
                Agenda <span className="text-accent">Oficial</span>
              </>
            )}
          </h2>

          {/* Chips Esportivos com Data, Horário e Local */}
          <div className="mt-3 flex flex-wrap items-center gap-2 pt-1">
            {round && formattedDate && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-bold text-gray-200 backdrop-blur-md">
                <CalendarDays className="h-3.5 w-3.5 text-accent" />
                <span className="capitalize">{formattedDate}</span>
              </span>
            )}

            {round && formattedTime && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-bold text-gray-200 backdrop-blur-md">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>{formattedTime}</span>
              </span>
            )}

            {round && (
              hasOpenCallup || confirmedCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/15 px-2.5 py-1 text-[11px] font-black text-accent backdrop-blur-md">
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    {confirmedCount} {confirmedCount === 1 ? "convocado" : "convocados"}
                    {hasOpenCallup && confirmedCount === 0 ? " · Lista aberta" : ""}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-black text-amber-300 backdrop-blur-md">
                  <Clock className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                  <span>Aguardando abertura da lista</span>
                </span>
              )
            )}

            {venue?.name && (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-bold text-gray-200 backdrop-blur-md">
                <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                <span className="truncate max-w-[130px]">{venue.name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Rodapé: Ações Rápidas */}
        <div className="pointer-events-auto relative z-30 flex items-center justify-between gap-2 border-t border-white/10 pt-3.5">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <Link
              href="/rodadas"
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-[10px] font-black uppercase text-foreground hover:bg-white/10 hover:border-white/30 transition-all backdrop-blur-sm"
              title="Histórico de partidas"
            >
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>Partidas</span>
            </Link>

            <Link
              href="/admin/prelistas"
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-[10px] font-black uppercase text-foreground hover:bg-white/10 hover:border-white/30 transition-all backdrop-blur-sm"
              title="Pré-listas salvas"
            >
              <ClipboardList className="h-3.5 w-3.5 text-accent" />
              <span>Pré-listas</span>
            </Link>
          </div>

          <Link
            href={href}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-emerald-400 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-background shadow-[0_0_25px_rgba(204,255,0,0.35)] hover:brightness-110 active:scale-95 transition-all ml-auto"
          >
            <span>{isAdmin && isPrelist ? "Montar Times" : "Ver Rodada"}</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
