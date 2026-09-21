"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CheckCircle2, ChevronDown, RotateCcw, Sparkles, X } from "@/components/icons";
import { applyRoundTeamShuffle, previewRoundTeamShuffle, swapRoundTeamPlayers, type RoundTeamShufflePreview } from "@/lib/actions/rounds";
import { TeamCrest } from "@/components/TeamCrest";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { useDialogViewport } from "@/lib/useDialogViewport";
import type { RoundReshuffleMode } from "@/lib/round-reshuffle";

const SHUFFLE_OPTIONS: Array<{ mode: RoundReshuffleMode; label: string; description: string }> = [
  { mode: "random", label: "Aleatório", description: "Mistura todos os jogadores livremente." },
  { mode: "balanced", label: "Equilibrado", description: "Distribui OVR e funções entre os times." },
  { mode: "speed", label: "Velocidade", description: "Equilibra as estrelas de velocidade." },
  { mode: "adaptive", label: "Completo", description: "Combina OVR, velocidade e características." },
];

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
  const [shuffleModalOpen, setShuffleModalOpen] = useState(false);
  const [shuffleMode, setShuffleMode] = useState<RoundReshuffleMode>("adaptive");
  const [shufflePreview, setShufflePreview] = useState<RoundTeamShufflePreview | null>(null);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const [shuffleError, setShuffleError] = useState("");
  const [shuffleConfirmationOpen, setShuffleConfirmationOpen] = useState(false);
  const [shuffleConfirmation, setShuffleConfirmation] = useState("");
  const [mounted, setMounted] = useState(false);
  const playerTeamById = useMemo(() => new Map(
    teams.flatMap((team: any) => (team.team_players || []).map((entry: any) => [entry.player_id, team.id] as const)),
  ), [teams]);
  const playerById = useMemo(() => new Map<string, any>(
    teams.flatMap((team: any) => (team.team_players || []).map((entry: any) => [entry.player_id, entry.players] as const)),
  ), [teams]);

  useEffect(() => setMounted(true), []);
  useDialogViewport(shuffleModalOpen);

  if (!canManage) return null;

  function openShuffleModal() {
    setShuffleModalOpen(true);
    setShufflePreview(null);
    setShuffleError("");
    setShuffleConfirmationOpen(false);
    setShuffleConfirmation("");
  }

  function closeShuffleModal() {
    if (shuffleLoading) return;
    setShuffleModalOpen(false);
    setShuffleConfirmationOpen(false);
    setShuffleConfirmation("");
  }

  async function drawPreview(mode = shuffleMode) {
    setShuffleMode(mode);
    setShuffleLoading(true);
    setShuffleError("");
    setShuffleConfirmationOpen(false);
    setShuffleConfirmation("");
    const result = await previewRoundTeamShuffle(roundId, mode);
    if (!result.success) {
      setShuffleError(result.error || "Não foi possível sortear esta formação.");
    } else {
      setShufflePreview(result);
    }
    setShuffleLoading(false);
  }

  async function confirmShuffle() {
    if (!shufflePreview?.assignments) return;
    setShuffleLoading(true);
    setShuffleError("");
    const result = await applyRoundTeamShuffle({
      roundId,
      mode: shuffleMode,
      assignments: shufflePreview.assignments,
      confirmation: shuffleConfirmation,
    });
    if (!result.success) {
      setShuffleError(result.error || "Não foi possível confirmar a nova formação.");
      setShuffleLoading(false);
      return;
    }
    setFeedback({ type: "success", message: "Nova formação confirmada. Os próximos jogos já usarão estes times." });
    setShuffleLoading(false);
    setShuffleModalOpen(false);
    setShuffleConfirmationOpen(false);
    setShuffleConfirmation("");
    router.refresh();
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
    <>
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
            onClick={openShuffleModal}
            className="mt-3.5 w-full rounded-xl bg-accent px-4 py-3 text-xs font-black text-background shadow-lg shadow-accent/15 transition-all hover:bg-accent-light active:scale-[.98] disabled:opacity-50"
          >
            Sortear nova formação
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

    {mounted && shuffleModalOpen && createPortal(
      <div className="fixed inset-0 z-[140] flex items-end bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true" aria-label="Prévia do sorteio de times">
        <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-accent/30 bg-[#07150d] shadow-2xl sm:max-h-[88vh] sm:rounded-3xl">
          <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-background shadow-lg shadow-accent/20"><Sparkles className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-accent">Prévia segura</p>
              <h2 className="mt-0.5 text-base font-black text-foreground">Sortear nova formação</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">Teste quantas formações quiser. Nada muda até você confirmar a prévia escolhida.</p>
            </div>
            <button type="button" onClick={closeShuffleModal} disabled={shuffleLoading} className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-40" aria-label="Voltar para os times atuais"><X className="h-5 w-5" /></button>
          </div>

          <div className="mobile-dialog-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
            {!shuffleConfirmationOpen ? <>
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[.14em] text-muted">Tipo de sorteio</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SHUFFLE_OPTIONS.map((option) => {
                    const selected = shuffleMode === option.mode;
                    return <button key={option.mode} type="button" disabled={shuffleLoading} onClick={() => drawPreview(option.mode)} className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${selected ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-accent/45"}`}>
                      <span className={`block text-xs font-black ${selected ? "text-accent" : "text-foreground"}`}>{option.label}</span>
                      <span className="mt-1 block text-[9px] leading-3 text-muted">{option.description}</span>
                    </button>;
                  })}
                </div>
              </div>

              {!shufflePreview && !shuffleLoading && !shuffleError && <div className="rounded-2xl border border-dashed border-border bg-surface/45 p-5 text-center text-xs font-semibold leading-relaxed text-muted">Escolha um tipo de sorteio acima para montar uma prévia dos jogadores.</div>}
              {shuffleLoading && <div className="flex items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-accent/5 p-5 text-xs font-black text-accent"><RotateCcw className="h-4 w-4 animate-spin" /> Preparando os times...</div>}
              {shuffleError && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-bold text-danger">{shuffleError}</p>}

              {shufflePreview?.assignments && <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="text-xs font-black text-foreground">Prévia atual · {SHUFFLE_OPTIONS.find((option) => option.mode === shuffleMode)?.label}</p><p className="mt-0.5 text-[10px] text-muted">Pode sortear novamente sem perder os times atuais.</p></div>
                  {shuffleMode !== "random" && <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[10px] font-black text-accent">{shufflePreview.balanceScore ?? 0}% equilíbrio</span>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {shufflePreview.assignments.map((assignment, index) => {
                    const team = teams.find((item: any) => item.id === assignment.teamId);
                    const summary = shufflePreview.summaries?.[index];
                    return <article key={assignment.teamId} className="overflow-hidden rounded-2xl border border-border bg-surface/70">
                      <div className="flex items-center gap-2 border-b border-border bg-background/45 px-3 py-2.5">
                        <TeamCrest name={team?.name || `Time ${index + 1}`} crestUrl={team?.crest_url} color={team?.color} className="h-7 w-7" />
                        <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-foreground">{team?.name || `Time ${index + 1}`}</p>{summary && <p className="mt-0.5 text-[9px] font-semibold text-muted">OVR {summary.overallAverage.toFixed(1)} · Vel. {summary.speedAverage.toFixed(2)}★</p>}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 p-2.5">
                        {assignment.playerIds.map((playerId) => {
                          const player: any = playerById.get(playerId);
                          return <div key={playerId} className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background/50 px-2 py-1.5"><PlayerAvatar name={player?.name || "Jogador"} avatarUrl={player?.avatar_url} clickable={false} className="h-6 w-6 shrink-0 rounded-full text-[8px] font-bold" /><span className="truncate text-[10px] font-bold text-foreground">{player?.nickname || player?.name || "Jogador"}</span></div>;
                        })}
                      </div>
                    </article>;
                  })}
                </div>
              </div>}
            </> : <div className="space-y-4">
              <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4"><p className="text-xs font-black text-warning">Confirmar esta formação?</p><p className="mt-1 text-[11px] leading-relaxed text-muted">Os resultados já encerrados continuam preservados. Esta prévia passará a valer nos próximos jogos e os capitães serão limpos.</p></div>
              <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.14em] text-muted">Digite MISTURAR para confirmar</span><input autoFocus value={shuffleConfirmation} onChange={(event) => setShuffleConfirmation(event.target.value)} placeholder="MISTURAR" className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm font-bold uppercase text-foreground outline-none placeholder:text-muted focus:border-accent" /></label>
              {shuffleError && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-bold text-danger">{shuffleError}</p>}
            </div>}
          </div>

          <div className="shrink-0 border-t border-border bg-[#07150d] p-4">
            {!shuffleConfirmationOpen ? <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={closeShuffleModal} disabled={shuffleLoading} className="rounded-xl border border-border bg-surface px-4 py-3 text-xs font-black text-muted transition-colors hover:text-foreground disabled:opacity-40">Voltar para os times atuais</button>
              {shufflePreview?.assignments ? <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => drawPreview()} disabled={shuffleLoading} className="flex items-center justify-center gap-1.5 rounded-xl border border-accent/35 bg-accent/10 px-3 py-3 text-xs font-black text-accent disabled:opacity-40"><RotateCcw className={`h-4 w-4 ${shuffleLoading ? "animate-spin" : ""}`} /> Sortear de novo</button><button type="button" onClick={() => { setShuffleConfirmationOpen(true); setShuffleError(""); }} disabled={shuffleLoading} className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-3 text-xs font-black text-background shadow-lg shadow-accent/15 disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> Confirmar</button></div> : <button type="button" onClick={() => drawPreview()} disabled={shuffleLoading} className="rounded-xl bg-accent px-4 py-3 text-xs font-black text-background disabled:opacity-40">Sortear times</button>}
            </div> : <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setShuffleConfirmationOpen(false); setShuffleConfirmation(""); setShuffleError(""); }} disabled={shuffleLoading} className="rounded-xl border border-border bg-surface px-4 py-3 text-xs font-black text-muted hover:text-foreground disabled:opacity-40">Voltar à prévia</button><button type="button" onClick={confirmShuffle} disabled={shuffleLoading || shuffleConfirmation.trim().toUpperCase() !== "MISTURAR"} className="rounded-xl bg-accent px-4 py-3 text-xs font-black text-background shadow-lg shadow-accent/15 disabled:opacity-40">{shuffleLoading ? "Confirmando..." : "Confirmar times"}</button></div>}
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
