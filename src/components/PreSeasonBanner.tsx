import Link from "next/link";
import { CalendarPlus, ChevronRight, Football, Sparkles, Trophy } from "@/components/icons";

type FriendlyRound = {
  id: string;
  number: number;
  date: string;
  status: "draft" | "active" | "finished";
  confirmedPlayers?: number;
};

export function PreSeasonBanner({ isAdmin, friendly }: { isAdmin: boolean; friendly: FriendlyRound | null }) {
  const href = friendly ? `/rodadas/${friendly.id}` : isAdmin ? "/admin/rodada?type=friendly" : null;
  const content = (
    <div className="group relative isolate h-[300px] overflow-hidden rounded-[28px] border border-accent/35 bg-[#07150d] p-5 shadow-[0_22px_60px_rgba(0,0,0,.38),0_0_28px_rgba(204,255,0,.08)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(rgba(204,255,0,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(204,255,0,.07) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl transition-transform duration-700 group-hover:scale-125" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-warning/15 blur-3xl" />
      <div className="pointer-events-none absolute right-5 top-5 h-32 w-24 rotate-6 rounded-[45%] border border-accent/20 bg-gradient-to-b from-accent/15 to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Abertura oficial
          </span>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-warning/30 bg-warning/10 text-warning shadow-[0_0_22px_rgba(245,158,11,.12)]">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        <div className="max-w-[82%]">
          <p className="font-athletic text-xs font-black uppercase italic tracking-[0.28em] text-warning">Pelada BQ apresenta</p>
          <h2 className="mt-1 font-athletic text-[32px] font-black uppercase italic leading-[.95] tracking-tight text-white sm:text-4xl">
            Pré-Temporada <span className="text-accent">V.1</span>
          </h2>
          <p className="mt-3 text-xs font-semibold leading-5 text-muted">Antes do Ranked, a resenha entra em campo. Amistosos, novos testes e futebol sem pressão no ranking.</p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-background"><Football className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase tracking-wider text-foreground">{friendly ? `Amistoso ${String(friendly.number).padStart(2, "0")}` : "Amistosos liberados"}</p>
              <p className="truncate text-[9px] text-muted">{friendly ? `${friendly.confirmedPlayers || 0} participantes · ${friendly.status === "active" ? "em andamento" : "em preparação"}` : isAdmin ? "Monte os times e abra a pré-temporada" : "Aguardando o ADM chamar o jogo"}</p>
            </div>
          </div>
          {href && (
            <span className="flex shrink-0 items-center gap-1 rounded-xl bg-accent px-3 py-2.5 text-[10px] font-black uppercase text-background shadow-[0_0_24px_rgba(204,255,0,.2)]">
              {friendly ? "Acessar" : <><CalendarPlus className="h-4 w-4" /> Iniciar</>}<ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return href ? <Link href={href} className="block" aria-label={friendly ? "Abrir amistoso da pré-temporada" : "Iniciar amistoso da pré-temporada"}>{content}</Link> : content;
}
