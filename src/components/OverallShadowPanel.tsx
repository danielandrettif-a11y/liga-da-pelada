"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishOverallShadow, recalculateOverallShadow, type OverallShadowAdminData } from "@/lib/actions/overall";

const TREND_LABELS = {
  rising: "↑ Em alta",
  steady: "→ Estável",
  falling: "↓ Em baixa",
} as const;

export function OverallShadowPanel({ initialData }: { initialData: OverallShadowAdminData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);

  function recalculate() {
    setMessage(null);
    startTransition(async () => {
      const result = await recalculateOverallShadow();
      setMessage(result.success
        ? `Rascunho calculado para ${result.players} jogadores em ${result.rounds} rodadas. ${result.pendingPlayers} estão sem bônus de característica. Confira a comparação antes de publicar.`
        : result.error || "Não foi possível calcular o OVR.");
      if (result.success) router.refresh();
    });
  }

  function publish() {
    if (!initialData.latestRun || !window.confirm("Publicar este rascunho v12 nas cartas e no ranking?")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await publishOverallShadow(initialData.latestRun!.id);
      setMessage(result.success ? "OVR v12 publicado nas cartas e no ranking." : result.error || "Não foi possível publicar.");
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="glass-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-foreground">Modo sombra do OVR</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Calcula o histórico oficial para você comparar com a v11. Nada muda nas cartas até você publicar o rascunho.</p>
          </div>
          <button type="button" onClick={recalculate} disabled={pending} className="rounded-xl bg-accent px-4 py-3 text-xs font-black text-background disabled:opacity-50">
            {pending ? "Calculando..." : initialData.latestRun ? "Recalcular rascunho" : "Calcular histórico"}
          </button>
        </div>
        {initialData.latestRun?.status === "succeeded" && <button type="button" onClick={publish} disabled={pending} className="mt-3 w-full rounded-xl border border-accent/40 px-4 py-3 text-xs font-black text-accent disabled:opacity-50">Publicar este rascunho v12</button>}
        {message && <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs font-semibold text-foreground">{message}</p>}
      </section>

      {initialData.latestRun && (
        <p className="px-1 text-xs text-muted">{initialData.latestRun.formulaLabel} · {new Date(initialData.latestRun.created_at).toLocaleString("pt-BR")} · {initialData.latestRun.status}</p>
      )}

      {initialData.pendingPlayers.length > 0 && (
        <section className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-black text-foreground">Sem bônus de característica ({initialData.pendingPlayers.length})</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Esses jogadores continuam recebendo OVR normalmente, mas nenhuma posição tem aceleração extra até o administrador escolher as características.</p>
          <p className="mt-2 text-xs font-bold text-warning">{initialData.pendingPlayers.map((player) => player.name).join(" · ")}</p>
        </section>
      )}

      <section className="glass-card overflow-hidden">
        {initialData.snapshots.length === 0 ? (
          <p className="p-5 text-sm text-muted">Ainda não há rascunhos. Calcule o histórico para conferir os primeiros resultados.</p>
        ) : initialData.snapshots.map((item) => (
          <div key={item.playerId} className="border-b border-border p-4 last:border-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-sm font-black text-foreground">{item.playerName}</p><p className="mt-0.5 text-[11px] text-muted">{item.roundsPlayed} rodadas · confiança {Math.round(item.confidence * 100)}% · {item.goals} G · {item.assists} A · bônus de progressão</p></div>
              <span className="rounded-lg bg-accent/15 px-3 py-1 text-lg font-black text-accent">OVR {item.overall.toFixed(1)}</span>
            </div>
            <p className="mt-3 text-[11px] font-bold tracking-wide text-muted">DEF/VOL {item.def.toFixed(1)} · ALA {item.alaMei.toFixed(1)} · ATA {item.ata.toFixed(1)} · GOL {item.gol.toFixed(1)} {item.provisional ? "· PROV" : ""}{item.stale ? " · DESATUALIZADO" : ""}</p>
            <p className={`mt-1 text-[10px] font-black ${item.trend === "rising" ? "text-accent" : item.trend === "falling" ? "text-danger" : "text-muted"}`}>Tendência geral: {TREND_LABELS[item.trend]} · DEF/VOL {TREND_LABELS[item.positionTrends.DEF]} · ALA {TREND_LABELS[item.positionTrends.ALA_MEI]} · ATA {TREND_LABELS[item.positionTrends.ATA]} · GOL {TREND_LABELS[item.positionTrends.GOL]}</p>
            {item.comparison && <p className="mt-1 text-[10px] font-bold text-accent">vs v11: OVR {item.comparison.overallDelta >= 0 ? "+" : ""}{item.comparison.overallDelta.toFixed(1)} · DEF/VOL {item.comparison.defDelta >= 0 ? "+" : ""}{item.comparison.defDelta.toFixed(1)} · ALA {item.comparison.alaMeiDelta >= 0 ? "+" : ""}{item.comparison.alaMeiDelta.toFixed(1)} · ATA {item.comparison.ataDelta >= 0 ? "+" : ""}{item.comparison.ataDelta.toFixed(1)}</p>}
            <p className="mt-1 text-[10px] text-muted">Confiança por posição: DEF/VOL {Math.round(item.positionConfidence.DEF * 100)}% · ALA {Math.round(item.positionConfidence.ALA_MEI * 100)}% · ATA {Math.round(item.positionConfidence.ATA * 100)}% · GOL {Math.round(item.positionConfidence.GOL * 100)}%</p>
            <button type="button" onClick={() => setOpenPlayer(openPlayer === item.playerId ? null : item.playerId)} className="mt-3 text-xs font-black text-accent">
              {openPlayer === item.playerId ? "Ocultar explicação" : "Ver por que a nota mudou"}
            </button>
            {openPlayer === item.playerId && (
              <div className="mt-3 space-y-2 rounded-xl bg-surface p-3 text-[11px] text-muted">
                <p className="font-bold text-foreground">Últimas rodadas usadas no cálculo</p>
                {item.recentRounds.length === 0 ? <p>Ainda não há atuação oficial registrada.</p> : item.recentRounds.map((round) => (
                  <p key={`${round.date}-${round.positions.DEF}`}>{new Date(`${round.date}T12:00:00`).toLocaleDateString("pt-BR")} · {round.goals} G · {round.assists} A · sofreu {round.goalsConceded} · gol {Math.round(round.goalScore * 100)}% · passe {Math.round(round.assistScore * 100)}% · defesa {Math.round(round.defensiveScore * 100)}% · pesos: DEF/VOL {Math.round(round.traitEvidence.DEF * 100)}% / ALA {Math.round(round.traitEvidence.ALA_MEI * 100)}% / ATA {Math.round(round.traitEvidence.ATA * 100)}% · tempo do gol {round.timingQuality === "exact" ? "exato" : "estimado"}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
