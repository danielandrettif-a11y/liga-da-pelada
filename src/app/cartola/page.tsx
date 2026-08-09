import Link from "next/link";
import { CalendarDays, ClipboardList, Clock3, Sparkles } from "lucide-react";

export default function CartolaPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-accent" />
          <h1 className="text-xl font-black text-foreground">Cartola</h1>
        </div>
        <p className="mt-1 text-xs text-muted">O fantasy game da Pelada de Baixa Qualidade.</p>
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/15 via-surface to-surface p-6 text-center">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-accent/30 bg-background/70 shadow-[0_0_35px_rgba(204,255,0,.12)]">
          <Sparkles className="h-9 w-9 text-accent" />
        </div>

        <div className="relative mt-5 inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-warning" role="status">
          <Clock3 className="h-3.5 w-3.5" />
          Em construção
        </div>

        <h2 className="relative mt-4 text-2xl font-black text-foreground">O Cartola da pelada vem aí</h2>
        <p className="relative mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
          Esta área está sendo preparada para escalações, desafios e disputas entre os participantes da liga.
        </p>
      </section>

      <Link
        href="/rodadas"
        className="glass-card glass-card-hover flex items-center gap-3 p-4"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15">
          <CalendarDays className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">Procurando as rodadas?</p>
          <p className="text-xs text-muted">Acesse a agenda e as partidas pela página inicial.</p>
        </div>
      </Link>
    </div>
  );
}
