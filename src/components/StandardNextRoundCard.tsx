import Link from "next/link";
import { CalendarDays, ChevronRight } from "@/components/icons";

type NextRound = {
  id: string;
  number: number;
  date: string;
  status: "draft" | "active" | "finished";
  confirmedPlayers?: number;
};

export function StandardNextRoundCard({ round }: { round: NextRound | null }) {
  if (!round) {
    return (
      <Link href="/rodadas" className="block">
        <div className="glass-card glass-card-hover flex items-center justify-between p-5 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-hover">
              <CalendarDays className="h-5 w-5 text-muted" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Nenhuma rodada agendada</p>
              <p className="text-xs text-muted">Clique para criar a próxima pelada</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted" />
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/rodadas/${round.id}`} className="block">
      <div className="glass-card glass-card-hover p-5 animate-fade-in">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
              <CalendarDays className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{round.status === "active" ? "Rodada em andamento" : "Próxima pelada"}</p>
              <p className="text-lg font-bold text-foreground">Rodada {String(round.number).padStart(2, "0")}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="mb-0.5 text-xs text-muted">Data</p>
              <p className="text-sm font-semibold text-foreground">{new Date(`${round.date}T00:00:00`).toLocaleDateString("pt-BR")}</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="mb-0.5 text-xs text-muted">Confirmados</p>
              <p className="text-sm font-semibold text-foreground">{round.confirmedPlayers || 0} jogadores</p>
            </div>
          </div>
          <span className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-bold text-accent">ACESSAR</span>
        </div>
      </div>
    </Link>
  );
}
