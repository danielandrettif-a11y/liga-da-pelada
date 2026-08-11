import Link from "next/link";
import { CalendarDays, ChevronRight, Football, Trophy } from "@/components/icons";

type NextRound = {
  id: string;
  number: number;
  date: string;
  status: "draft" | "active" | "finished";
  confirmedPlayers?: number;
};

export function NextRoundBanner({ round }: { round: NextRound | null }) {
  const href = round ? `/rodadas/${round.id}` : "/rodadas";
  const formattedDate = round
    ? new Date(`${round.date}T00:00:00`).toLocaleDateString("pt-BR")
    : null;

  return (
    <Link href={href} className="group block" aria-label={round ? "Abrir próxima rodada" : "Abrir central de rodadas"}>
      <div className="relative isolate min-h-64 overflow-hidden rounded-[28px] border border-sky-400/30 bg-[#07131a] p-5 shadow-[0_22px_60px_rgba(0,0,0,.38),0_0_28px_rgba(56,189,248,.08)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 opacity-35" style={{ backgroundImage: "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl transition-transform duration-700 group-hover:scale-125" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative z-10 flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] text-sky-300">
              <Football className="h-3.5 w-3.5" /> Temporada oficial
            </span>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
              <Trophy className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-6 max-w-[84%]">
            <p className="font-athletic text-xs font-black uppercase italic tracking-[0.28em] text-sky-300">
              {round?.status === "active" ? "Bola rolando" : "Próximo compromisso"}
            </p>
            <h2 className="mt-1 font-athletic text-[32px] font-black uppercase italic leading-[.95] tracking-tight text-white sm:text-4xl">
              {round ? <>Rodada <span className="text-accent">{String(round.number).padStart(2, "0")}</span></> : <>Agenda <span className="text-accent">BQ</span></>}
            </h2>
            <p className="mt-3 text-xs font-semibold leading-5 text-muted">
              {round ? `${formattedDate} · ${round.confirmedPlayers || 0} jogadores confirmados.` : "Nenhuma rodada agendada. Abra a central e prepare a próxima pelada."}
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-400 text-[#04131a]"><CalendarDays className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase tracking-wider text-foreground">{round ? "Central da rodada" : "Central de rodadas"}</p>
                <p className="truncate text-[9px] text-muted">Times, partidas e resultados</p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-xl bg-sky-400 px-3 py-2.5 text-[10px] font-black uppercase text-[#04131a] shadow-[0_0_24px_rgba(56,189,248,.18)]">
              {round ? "Acessar" : "Abrir"}<ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
