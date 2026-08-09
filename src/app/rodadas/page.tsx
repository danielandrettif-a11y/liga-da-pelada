import { CalendarDays, Plus, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getRounds } from "@/lib/actions/rounds";
import { formatDateShort } from "@/lib/utils";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

const STATUS_STYLES = {
  draft: {
    label: "Rascunho",
    bg: "bg-warning/15",
    text: "text-warning",
  },
  active: {
    label: "Em Andamento",
    bg: "bg-accent/15",
    text: "text-accent",
  },
  finished: {
    label: "Finalizada",
    bg: "bg-muted/15",
    text: "text-muted",
  },
};

export default async function RodadasPage() {
  const [rounds, account] = await Promise.all([
    getRounds(),
    getCurrentAccount(),
  ]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Rodadas</h1>
          <p className="text-xs text-muted mt-0.5">
            {rounds.length} rodadas registradas
          </p>
        </div>
        {account.isAdmin && <Link href="/admin/rodada" className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-light text-background text-sm font-bold transition-all active:scale-95">
          <Plus className="w-4 h-4" />
          Nova Rodada
        </Link>}
      </div>

      {/* Rounds List */}
      <div className="space-y-3">
        {rounds.map((round, index) => {
          const statusStyle = STATUS_STYLES[round.status as keyof typeof STATUS_STYLES] || STATUS_STYLES.draft;

          return (
            <Link key={round.id} href={`/rodadas/${round.id}`} className="block">
              <div
                className={`glass-card glass-card-hover p-4 animate-fade-in stagger-${index + 1}`}
              >
                <div className="flex items-center gap-4">
                  {/* Round number */}
                  <div className="w-14 h-14 rounded-xl bg-surface flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-[10px] text-muted font-semibold uppercase">
                      Rod.
                    </span>
                    <span className="stat-number text-xl text-foreground">
                      {String(round.number).padStart(2, "0")}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-foreground">
                        Rodada {String(round.number).padStart(2, "0")}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {statusStyle.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {formatDateShort(round.date)}
                      </span>
                      {round.playersCount > 0 && (
                        <span>👥 {round.playersCount} jogadores</span>
                      )}
                      {round.matchesCount > 0 && (
                        <span>⚽ {round.matchesCount} partidas</span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-muted flex-shrink-0" />
                </div>
              </div>
            </Link>
          );
        })}
        {rounds.length === 0 && (
          <div className="p-8 text-center text-muted text-sm glass-card">
            Nenhuma rodada criada ainda.
          </div>
        )}
      </div>
    </div>
  );
}
