"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ChevronDown } from "@/components/icons";
import { shuffleRoundTeams, swapRoundTeamPlayers } from "@/lib/actions/rounds";
import { TeamCrest } from "@/components/TeamCrest";

export function RoundTeamShuffleCard({
  roundId,
  canManage,
  teams,
}: {
  roundId: string;
  canManage: boolean;
  teams: any[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [swapPanelOpen, setSwapPanelOpen] = useState(false);
  const [swapPlayerAId, setSwapPlayerAId] = useState("");
  const [swapPlayerBId, setSwapPlayerBId] = useState("");
  const [swapFeedback, setSwapFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const playerTeamById = useMemo(() => new Map(
    teams.flatMap((team: any) => (team.team_players || []).map((entry: any) => [entry.player_id, team.id] as const)),
  ), [teams]);

  if (!canManage) return null;

  async function handleShuffle() {
    if (
      window.prompt(
        "Digite MISTURAR para sortear todos os times para os próximos jogos. Partidas já encerradas não serão alteradas."
      ) !== "MISTURAR"
    ) {
      return;
    }

    setLoading(true);
    setFeedback(null);

    const result = await shuffleRoundTeams(roundId);

    if (!result.success) {
      setFeedback({
        type: "error",
        message: result.error || "Não foi possível misturar os times.",
      });
    } else {
      setFeedback({
        type: "success",
        message: "Times misturados com sucesso! Os próximos jogos já usarão a nova divisão.",
      });
      router.refresh();
    }

    setLoading(false);
  }

  function selectSwapPlayer(playerId: string, teamId: string) {
    setSwapFeedback(null);
    if (swapPlayerAId === playerId) {
      setSwapPlayerAId("");
      return;
    }
    if (swapPlayerBId === playerId) {
      setSwapPlayerBId("");
      return;
    }
    const firstTeamId = playerTeamById.get(swapPlayerAId);
    const secondTeamId = playerTeamById.get(swapPlayerBId);
    if (!swapPlayerAId || firstTeamId === teamId) setSwapPlayerAId(playerId);
    else if (!swapPlayerBId || secondTeamId === teamId) setSwapPlayerBId(playerId);
    else setSwapPlayerBId(playerId);
  }

  async function handlePermanentSwap() {
    if (!swapPlayerAId || !swapPlayerBId) return;
    setLoading(true);
    setSwapFeedback(null);
    const result = await swapRoundTeamPlayers(roundId, swapPlayerAId, swapPlayerBId);
    if (!result.success) {
      setSwapFeedback({ type: "error", message: result.error || "Não foi possível realizar a troca." });
    } else {
      setSwapPlayerAId("");
      setSwapPlayerBId("");
      setSwapFeedback({ type: "success", message: "Troca realizada. Os próximos jogos já usarão os novos times." });
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-surface to-surface p-4 shadow-[0_12px_30px_rgba(0,0,0,.16)] transition-all">
      <div className="flex items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-background shadow-md shadow-accent/20">
          <ArrowLeftRight className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-accent">
            Intervalo da rodada
          </p>
          <h2 className="mt-0.5 text-sm font-black text-foreground">
            Misturar todos os times
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Sorteia uma nova divisão equilibrada para os próximos jogos. Resultados, vitórias e pontos das partidas encerradas ficam preservados.
          </p>

          <button
            type="button"
            disabled={loading}
            onClick={handleShuffle}
            className="mt-3.5 w-full rounded-xl bg-accent px-4 py-3 text-xs font-black text-background shadow-lg shadow-accent/15 transition-all hover:bg-accent-light active:scale-[.98] disabled:opacity-50"
          >
            {loading ? "Misturando times..." : "Sortear nova formação"}
          </button>

          {feedback && (
            <p
              role="status"
              className={`mt-3 rounded-xl p-2.5 text-center text-xs font-bold ${
                feedback.type === "success"
                  ? "bg-success/15 text-success border border-success/25"
                  : "bg-danger/15 text-danger border border-danger/25"
              }`}
            >
              {feedback.message}
            </p>
          )}

          <div className="mt-4 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setSwapPanelOpen((current) => !current)}
              aria-expanded={swapPanelOpen}
              aria-controls="round-permanent-swap-panel"
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${swapPanelOpen ? "border-warning/35 bg-warning/10" : "border-white/10 bg-black/15 hover:bg-white/5"}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning"><ArrowLeftRight className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-black uppercase tracking-wider text-foreground">Troca permanente</span>
                <span className="mt-0.5 block text-[9px] leading-3 text-muted">Troque dois jogadores entre os times sem refazer o sorteio.</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${swapPanelOpen ? "rotate-180" : ""}`} />
            </button>

            {swapPanelOpen && <div id="round-permanent-swap-panel" className="mt-3 grid gap-3 sm:grid-cols-2">
              {teams.map((team: any) => (
                <div key={team.id} className="overflow-hidden rounded-xl border border-border bg-background/45">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                    <TeamCrest name={team.name} crestUrl={team.crest_url} color={team.color} className="h-7 w-7" />
                    <span className="min-w-0 flex-1 truncate text-xs font-black text-foreground">{team.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-2">
                    {(team.team_players || []).map((entry: any) => {
                      const position = swapPlayerAId === entry.player_id ? 1 : swapPlayerBId === entry.player_id ? 2 : 0;
                      return (
                        <button
                          key={entry.player_id}
                          type="button"
                          onClick={() => selectSwapPlayer(entry.player_id, team.id)}
                          className={`relative min-w-0 rounded-lg border px-2 py-2 text-left text-[10px] font-bold transition-colors ${position ? "border-warning bg-warning/10 text-warning" : "border-border bg-surface text-foreground"}`}
                        >
                          <span className="block truncate">{entry.players?.name}</span>
                          {position > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[8px] font-black text-background">{position}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {swapFeedback && <p role="status" className={`rounded-xl p-3 text-center text-[10px] font-bold sm:col-span-2 ${swapFeedback.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{swapFeedback.message}</p>}
              <button type="button" disabled={loading || !swapPlayerAId || !swapPlayerBId} onClick={handlePermanentSwap} className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs font-black text-warning disabled:opacity-40 sm:col-span-2">
                {loading ? "Salvando..." : "Confirmar troca entre os times"}
              </button>
            </div>}
          </div>
        </div>
      </div>
    </section>
  );
}
