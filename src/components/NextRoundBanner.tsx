import Link from "next/link";
import { ChevronRight, ClipboardList, Clock, Football, Trophy } from "@/components/icons";

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
}: {
  round: NextRound | null;
  isAdmin?: boolean;
  venue?: { name?: string | null; mapUrl?: string | null } | null;
  eventDurationMinutes?: number;
}) {
  const isPrelist = round?.preparation_stage === "prelist";
  const href = round
    ? isAdmin && isPrelist ? `/admin/rodada?round=${round.id}&mount=1` : isAdmin ? `/rodadas/${round.id}` : "/rodadas"
    : "/rodadas";
  const formattedDate = round ? new Date(`${round.date}T00:00:00`).toLocaleDateString("pt-BR") : null;
  const formattedTime = round?.start_time?.slice(0, 5) || null;

  return (
    <article className="group relative isolate flex h-full min-h-[350px] sm:min-h-[360px] flex-col justify-between overflow-hidden rounded-[28px] border border-sky-400/30 bg-[#07131a] p-5 shadow-[0_22px_60px_rgba(0,0,0,.38),0_0_28px_rgba(56,189,248,.08)] sm:p-6">
      <Link href={href} className="absolute inset-0 z-10" aria-label={round ? (isAdmin && isPrelist ? "Retomar pre-lista" : "Abrir historico de rodadas") : "Abrir historico de rodadas"} />
      <div className="pointer-events-none absolute inset-0 opacity-35" style={{ backgroundImage: "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl transition-transform duration-700 group-hover:scale-125" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />

      <div className="pointer-events-none relative z-20 flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] text-sky-300">
            <Football className="h-3.5 w-3.5" /> Temporada oficial
          </span>
          <Link
            href="/ranking"
            className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 text-accent hover:bg-accent/25 transition-colors shadow-sm"
            title="Ver Ranking da Liga"
            aria-label="Ver Ranking da Liga"
          >
            <Trophy className="h-6 w-6" />
          </Link>
        </div>

        <div className="max-w-[88%]">
          <p className="font-athletic text-xs font-black uppercase italic tracking-[0.28em] text-sky-300">
            {isPrelist ? "Pre-lista em preparacao" : round?.status === "active" ? "Bola rolando" : "Proximo compromisso"}
          </p>
          <h2 className="mt-1 font-athletic text-[32px] font-black uppercase italic leading-[.95] tracking-tight text-white sm:text-4xl">
            {round ? <>Rodada <span className="text-accent">{String(round.number).padStart(2, "0")}</span></> : <>Agenda <span className="text-accent">BQ</span></>}
          </h2>
          <p className="mt-3 text-xs font-semibold leading-5 text-muted">
            {round ? `${formattedDate}${formattedTime ? ` as ${formattedTime}` : ""} · ${round.confirmedPlayers || 0} jogadores.` : "Nenhuma rodada agendada. Acesse o historico das peladas."}
          </p>
        </div>

        <div className="pointer-events-auto relative z-30 flex items-center justify-between gap-2 border-t border-white/10 pt-3.5">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <Link
              href="/rodadas"
              className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 py-2 text-[10px] font-black uppercase text-foreground hover:bg-white/10 transition-colors"
              title="Histórico de partidas"
            >
              <Clock className="h-3.5 w-3.5 text-sky-300" />
              <span>Partidas</span>
            </Link>

            <Link
              href="/admin/prelistas"
              className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 py-2 text-[10px] font-black uppercase text-foreground hover:bg-white/10 transition-colors"
              title="Pré-listas salvas"
            >
              <ClipboardList className="h-3.5 w-3.5 text-accent" />
              <span>Pré-listas</span>
            </Link>
          </div>

          <Link
            href={href}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-sky-400 px-3.5 py-2 text-[10px] font-black uppercase text-[#04131a] shadow-[0_0_15px_rgba(56,189,248,0.3)] hover:brightness-110 transition-all ml-auto"
          >
            {isAdmin && isPrelist ? "Retomar" : "Abrir"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
