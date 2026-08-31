import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, CalendarPlus, ChevronRight, Clock, Flag, Users } from "@/components/icons";
import { DeleteRoundButton } from "@/components/DeleteRoundButton";
import { getCurrentAccount } from "@/lib/auth";
import { getAdminRoundPrelists } from "@/lib/actions/rounds";

export const dynamic = "force-dynamic";

export default async function PrelistasPage() {
  const account = await getCurrentAccount();
  if (!account.isAdmin) redirect("/mais");
  const prelists = await getAdminRoundPrelists();
  if (prelists.length === 0) redirect("/admin/rodada?new=1");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/mais" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface transition-colors hover:bg-surface-hover">
          <ArrowLeft className="h-5 w-5 text-muted" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-black text-foreground">Central de pré-listas</h1>
          <p className="mt-0.5 text-xs text-muted">Prepare várias peladas e monte os times quando chegar a hora.</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/15 via-surface to-background p-5">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-accent">Sala de preparação</p>
            <h2 className="mt-1 text-lg font-black text-foreground">Uma pré-lista para cada data</h2>
            <p className="mt-1 max-w-[270px] text-xs leading-5 text-muted">Os participantes ficam salvos mesmo se você sair do app. Depois, abra o cartão e faça o sorteio.</p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-background shadow-[0_0_24px_rgba(204,255,0,.18)]">
            <CalendarPlus className="h-7 w-7" />
          </div>
        </div>
        <Link href="/admin/rodada?new=1" className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-black uppercase text-background transition-transform active:scale-[0.98]">
          <CalendarPlus className="h-5 w-5" /> Nova pré-lista
        </Link>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-athletic text-sm font-black uppercase italic tracking-wider text-foreground">Pré-listas salvas</h2>
          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-black text-warning">{prelists.length}</span>
        </div>

        {prelists.map((prelist: any, index: number) => {
          const date = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
            .format(new Date(`${prelist.date}T12:00:00`));
          const isFriendly = prelist.round_type === "friendly";
          const theme = isFriendly
            ? {
                card: "border-warning/35 bg-gradient-to-br from-warning/10 via-surface to-background",
                tile: "border-warning/30 bg-warning/10",
                text: "text-warning",
                badge: "bg-warning/15 text-warning",
                action: "text-warning",
              }
            : {
                card: "border-accent/35 bg-gradient-to-br from-accent/10 via-surface to-background",
                tile: "border-accent/30 bg-accent/10",
                text: "text-accent",
                badge: "bg-accent/15 text-accent",
                action: "text-accent",
              };
          return (
            <article key={prelist.id} className={`relative overflow-hidden rounded-2xl border ${theme.card} animate-fade-in stagger-${Math.min(index + 1, 5)}`}>
              <Link href={`/admin/rodada?round=${prelist.id}&mount=1`} className="block p-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border ${theme.tile}`}>
                    <span className={`text-[8px] font-black uppercase ${theme.text}`}>{isFriendly ? "AM." : "ROD."}</span>
                    <span className="stat-number text-xl text-foreground">{String(prelist.number).padStart(2, "0")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-black text-foreground">{isFriendly ? "Amistoso" : "Rodada oficial"} {String(prelist.number).padStart(2, "0")}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${theme.badge}`}>{isFriendly ? "Amistoso" : "Ranked"}</span>
                      {prelist.callupId && <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[8px] font-black uppercase text-accent"><Flag className="h-2.5 w-2.5" /> Convocação</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-muted">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {date}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {prelist.start_time?.slice(0, 5) || "--:--"}</span>
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {prelist.playersCount} jogadores</span>
                    </div>
                    <p className={`mt-2 flex items-center gap-1 text-[10px] font-black uppercase ${theme.action}`}>Abrir sorteio dos times <ChevronRight className="h-3 w-3" /></p>
                  </div>
                </div>
              </Link>
              <div className="flex items-center justify-between gap-3 border-t border-white/5 px-4 py-2.5">
                <span className={`min-w-0 flex-1 truncate text-[10px] font-black uppercase ${theme.action}`}>Toque no card para editar e montar</span>
                <DeleteRoundButton redirectTo="/admin/prelistas" round={{
                  id: prelist.id,
                  number: prelist.number,
                  round_type: prelist.round_type,
                  date: prelist.date,
                  playersCount: prelist.playersCount,
                  matchesCount: 0,
                }} />
              </div>
            </article>
          );
        })}

        {prelists.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center">
            <CalendarDays className="mx-auto h-9 w-9 text-muted/50" />
            <p className="mt-3 text-sm font-black text-foreground">Nenhuma pré-lista salva</p>
            <p className="mt-1 text-xs text-muted">Crie a primeira e os nomes ficarão guardados aqui.</p>
          </div>
        )}
      </section>
    </div>
  );
}
