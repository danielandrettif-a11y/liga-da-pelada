import { CalendarDays, Plus, ChevronRight, Users, Football } from "@/components/icons";
import Link from "next/link";
import { getRounds } from "@/lib/actions/rounds";
import { formatDateShort } from "@/lib/utils";
import { getCurrentAccount } from "@/lib/auth";
import { DeleteRoundButton } from "@/components/DeleteRoundButton";

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
        {account.isAdmin && <Link href="/admin/prelistas" className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-light text-background text-sm font-bold transition-all active:scale-95">
          <Plus className="w-4 h-4" />
          Pré-listas
        </Link>}
      </div>

      {/* Rounds List */}
      <div className="space-y-3">
        {rounds.map((round, index) => {
          const statusStyle = round.preparation_stage === "prelist"
            ? { label: "Pre-lista", bg: "bg-warning/15", text: "text-warning" }
            : STATUS_STYLES[round.status as keyof typeof STATUS_STYLES] || STATUS_STYLES.draft;

          return (
            <div key={round.id} className="relative">
            <Link href={`/rodadas/${round.id}`} className="block">
              <div
                className={`glass-card glass-card-hover p-4 animate-fade-in stagger-${index + 1}`}
              >
                <div className="flex items-center gap-4">
                  {/* Round number */}
                  <div className="w-14 h-14 rounded-xl bg-surface flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-[10px] text-muted font-semibold uppercase">
                      {round.round_type === "friendly" ? "AM." : "ROD."}
                    </span>
                    <span className="stat-number text-xl text-foreground">
                      {String(round.number).padStart(2, "0")}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-foreground">
                        {round.round_type === "friendly" ? "Amistoso" : "Rodada"} {String(round.number).padStart(2, "0")}
                      </span>
                      {round.round_type === "friendly" && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-black text-warning">FORA DO RANKED</span>}
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
                        {round.start_time ? ` · ${round.start_time.slice(0, 5)}` : ""}
                      </span>
                      {round.playersCount > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          {round.playersCount} jogadores
                        </span>
                      )}
                      {round.matchesCount > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Football className="h-3.5 w-3.5" />
                          {round.matchesCount} partidas
                        </span>
                      )}
                    </div>
                  </div>

                  {account.isAdmin ? <div className="mr-10" /> : <ChevronRight className="w-5 h-5 text-muted flex-shrink-0" />}
                </div>
              </div>
            </Link>
            {account.isAdmin && <div className="absolute right-3 top-3"><DeleteRoundButton round={round} /></div>}
            </div>
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
