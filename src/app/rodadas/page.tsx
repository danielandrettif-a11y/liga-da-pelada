import { CalendarDays, CalendarPlus, Plus, ChevronRight, Users, Football } from "@/components/icons";
import Link from "next/link";
import { getAdminRoundPrelists, getRounds } from "@/lib/actions/rounds";
import { formatDateShort } from "@/lib/utils";
import { getCurrentAccount } from "@/lib/auth";
import { DeleteRoundButton } from "@/components/DeleteRoundButton";
import { CallupAdminCard } from "@/components/CallupAdminCard";
import { getActiveCallups, getAgendaCallups } from "@/lib/actions/callups";
import { getLeagueConfig } from "@/lib/actions/league";
import { getStadiums } from "@/lib/actions/stadiums";
import { isStandaloneCallupVisible } from "@/lib/callup-ui";

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

export default async function RodadasPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  const [rounds, account, agendaCallups] = await Promise.all([
    getRounds(),
    getCurrentAccount(),
    getAgendaCallups(),
  ]);
  const [activeCallups, leagueConfig, stadiums, adminPrelists] = account.isAdmin
    ? await Promise.all([getActiveCallups(), getLeagueConfig(), getStadiums(), getAdminRoundPrelists()])
    : [[], null, [], []];
  const visiblePrelists = adminPrelists || [];
  const listedRoundIds = new Set([
    ...rounds.map((round: any) => round.id),
    ...visiblePrelists.map((prelist: any) => prelist.id),
  ]);
  const standaloneCallups = agendaCallups.filter((callup) =>
    isStandaloneCallupVisible(callup, listedRoundIds),
  );
  const agendaItems = [
    ...rounds.map((round: any) => ({ ...round, agendaKind: "round" as const })),
    ...visiblePrelists.map((prelist: any) => ({
      ...prelist,
      agendaKind: "prelist" as const,
      preparation_stage: "prelist",
      matchesCount: 0,
    })),
    ...standaloneCallups.map((callup) => ({
      ...callup,
      agendaKind: "callup" as const,
      number: null,
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
            {standaloneCallups.length > 0 ? ` · ${standaloneCallups.length} convocação${standaloneCallups.length === 1 ? "" : "ões"}` : ""}
          </p>
        </div>
        {account.isAdmin && <Link href="/admin/rodada?new=1" className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-accent hover:bg-accent-light text-background text-xs font-bold transition-all active:scale-95">
          <Plus className="w-4 h-4" />
          Nova pré-lista
        </Link>}
      </div>

      {account.isAdmin && (
        <details id="abrir-convocacao" open={params.create === "1"} className="group overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.06]">
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
      <div id="historico" className="scroll-mt-4 space-y-3">
        {agendaItems.map((round, index) => {
          const isPrelist = round.agendaKind === "prelist";
          const isCallup = round.agendaKind === "callup";
          const roundTypeTheme = round.round_type === "friendly"
            ? {
                card: "border-warning/45 bg-gradient-to-br from-warning/[0.14] via-surface to-background",
                tile: "border-warning/30 bg-warning/10",
                text: "text-warning",
                badge: "bg-warning/15",
              }
            : {
                card: "border-sky-400/35 bg-gradient-to-br from-sky-400/10 via-surface to-background",
                tile: "border-sky-400/30 bg-sky-400/10",
                text: "text-sky-300",
                badge: "bg-sky-400/15",
              };
          const useRoundTypeTheme = isPrelist || isCallup || round.status === "finished";
          const statusStyle = isCallup
            ? { label: round.status === "closed" ? "Encerrada" : round.status === "locked" ? "Lista fechada" : "Convocação aberta", bg: roundTypeTheme.badge, text: roundTypeTheme.text }
            : isPrelist
            ? { label: "Pré-lista", bg: roundTypeTheme.badge, text: roundTypeTheme.text }
            : STATUS_STYLES[round.status as keyof typeof STATUS_STYLES] || STATUS_STYLES.draft;
          const href = isCallup
            ? `/convocacao?callup=${round.id}`
            : isPrelist
            ? `/admin/rodada?round=${round.id}&mount=1`
            : `/rodadas/${round.id}`;

          const card = (
              <div
                className={`${useRoundTypeTheme
                  ? `rounded-2xl border ${roundTypeTheme.card} shadow-[0_10px_28px_rgba(0,0,0,.22)]`
                  : "glass-card glass-card-hover"} p-4 animate-fade-in stagger-${Math.min(index + 1, 5)}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${useRoundTypeTheme ? `border ${roundTypeTheme.tile}` : "bg-surface"}`}>
                    <span className={`text-[10px] font-semibold uppercase ${useRoundTypeTheme ? roundTypeTheme.text : "text-muted"}`}>
                      {isCallup ? "LISTA" : round.round_type === "friendly" ? "AM." : "ROD."}
                    </span>
                    <span className="stat-number text-xl text-foreground">
                      {isCallup ? <CalendarPlus className="h-5 w-5" /> : String(round.number).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-foreground">
                        {isCallup ? "Convocação" : round.round_type === "friendly" ? "Amistoso" : "Rodada"} {!isCallup && String(round.number).padStart(2, "0")}
                      </span>
                      {round.round_type === "friendly" && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-black text-warning">FORA DO RANKED</span>}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {formatDateShort(round.date)}
                        {round.start_time ? ` · ${round.start_time.slice(0, 5)}` : ""}
                      </span>
                      {round.playersCount > 0 && <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{round.playersCount} jogadores</span>}
                      {round.matchesCount > 0 && <span className="inline-flex items-center gap-1.5"><Football className="h-3.5 w-3.5" />{round.matchesCount} partidas</span>}
                    </div>
                    {isPrelist && <p className={`mt-2 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide ${roundTypeTheme.text}`}>Pré-lista pronta · montar times e iniciar <ChevronRight className="h-3 w-3" /></p>}
                    {isCallup && <p className={`mt-2 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide ${roundTypeTheme.text}`}>{round.status === "closed" ? "Convocação encerrada" : "Abrir lista de convocados"} {round.status !== "closed" && <ChevronRight className="h-3 w-3" />}</p>}
                  </div>
                  {account.isAdmin && !isCallup ? <div className="mr-10" /> : round.status !== "closed" && <ChevronRight className="w-5 h-5 text-muted flex-shrink-0" />}
                </div>
              </div>
          );

          return (
            <div key={round.id} className="relative">
            {isCallup && round.status === "closed" ? card : <Link href={href} className="block">{card}</Link>}
            {account.isAdmin && !isCallup && <div className="absolute right-3 top-3"><DeleteRoundButton round={round} /></div>}
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
