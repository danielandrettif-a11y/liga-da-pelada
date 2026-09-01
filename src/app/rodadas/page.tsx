import { CalendarDays, CalendarPlus, Plus, ChevronRight, Users, Football } from "@/components/icons";
import Link from "next/link";
import { getAdminRoundPrelists, getRounds } from "@/lib/actions/rounds";
import { formatDateShort } from "@/lib/utils";
import { getCurrentAccount } from "@/lib/auth";
import { DeleteRoundButton } from "@/components/DeleteRoundButton";
import { CallupAdminCard } from "@/components/CallupAdminCard";
import { getActiveCallups } from "@/lib/actions/callups";
import { getLeagueConfig } from "@/lib/actions/league";
import { getStadiums } from "@/lib/actions/stadiums";

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
  const [activeCallups, leagueConfig, stadiums, adminPrelists] = account.isAdmin
    ? await Promise.all([getActiveCallups(), getLeagueConfig(), getStadiums(), getAdminRoundPrelists()])
    : [[], null, [], []];
  const visiblePrelists = (adminPrelists || []).filter((prelist: any) => prelist.playersCount > 0);
  const agendaItems = [
    ...rounds.map((round: any) => ({ ...round, agendaKind: "round" as const })),
    ...visiblePrelists.map((prelist: any) => ({
      ...prelist,
      agendaKind: "prelist" as const,
      preparation_stage: "prelist",
      matchesCount: 0,
    })),
  ].sort((a, b) =>
    `${b.date || ""}-${b.start_time || ""}-${b.created_at || ""}`.localeCompare(
      `${a.date || ""}-${a.start_time || ""}-${a.created_at || ""}`,
    ),
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Agenda e histórico</h1>
          <p className="text-xs text-muted mt-0.5">
            {rounds.length} rodadas registradas
            {visiblePrelists.length > 0 ? ` · ${visiblePrelists.length} pré-lista${visiblePrelists.length === 1 ? "" : "s"} pronta${visiblePrelists.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        {account.isAdmin && <Link href="/admin/rodada?new=1" className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-accent hover:bg-accent-light text-background text-xs font-bold transition-all active:scale-95">
          <Plus className="w-4 h-4" />
          Nova pré-lista
        </Link>}
      </div>

      {account.isAdmin && (
        <details className="group overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.06]">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
              <CalendarPlus className="h-5 w-5 text-accent" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-foreground">Abrir convocação</span>
              <span className="block text-[10px] text-muted">Crie a chamada sem sair da tela de rodadas</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-accent transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-accent/20 p-3">
            <CallupAdminCard
              callups={activeCallups}
              stadiums={stadiums}
              playersPerTeam={leagueConfig?.players_per_team || 5}
              teamsPerRound={leagueConfig?.teams_per_round || 3}
              initialShowCreate
            />
          </div>
        </details>
      )}

      {/* Rounds List */}
      <div className="space-y-3">
        {agendaItems.map((round, index) => {
          const isPrelist = round.agendaKind === "prelist";
          const statusStyle = isPrelist
            ? { label: "Pré-lista", bg: "bg-warning/15", text: "text-warning" }
            : STATUS_STYLES[round.status as keyof typeof STATUS_STYLES] || STATUS_STYLES.draft;
          const href = isPrelist
            ? `/admin/rodada?round=${round.id}&mount=1`
            : `/rodadas/${round.id}`;

          return (
            <div key={round.id} className="relative">
            <Link href={href} className="block">
              <div
                className={`${isPrelist
                  ? "rounded-2xl border border-warning/45 bg-gradient-to-br from-warning/[0.14] via-surface to-background shadow-[0_10px_28px_rgba(0,0,0,.22)]"
                  : "glass-card glass-card-hover"} p-4 animate-fade-in stagger-${Math.min(index + 1, 5)}`}
              >
                <div className="flex items-center gap-4">
                  {/* Round number */}
                  <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${isPrelist ? "border border-warning/30 bg-warning/10" : "bg-surface"}`}>
                    <span className={`text-[10px] font-semibold uppercase ${isPrelist ? "text-warning" : "text-muted"}`}>
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
                    {isPrelist && (
                      <p className="mt-2 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-warning">
                        Convocados salvos · montar times e iniciar <ChevronRight className="h-3 w-3" />
                      </p>
                    )}
                  </div>

                  {account.isAdmin ? <div className="mr-10" /> : <ChevronRight className="w-5 h-5 text-muted flex-shrink-0" />}
                </div>
              </div>
            </Link>
            {account.isAdmin && <div className="absolute right-3 top-3"><DeleteRoundButton round={round} /></div>}
            </div>
          );
        })}
        {agendaItems.length === 0 && (
          <div className="p-8 text-center text-muted text-sm glass-card">
            Nenhuma rodada criada ainda.
          </div>
        )}
      </div>
    </div>
  );
}
