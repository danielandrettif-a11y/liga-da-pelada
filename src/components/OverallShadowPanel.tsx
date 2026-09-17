"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recalculateOverallShadow, type OverallShadowAdminData } from "@/lib/actions/overall";

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
        ? `Rascunho calculado para ${result.players} jogadores em ${result.rounds} rodadas. ${result.pendingPlayers} aguardam características. Nada foi publicado.`
        : result.error || "Não foi possível calcular o OVR.");
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="glass-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-foreground">Modo sombra do OVR</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Calcula o histórico oficial, mas não altera ranking, Cartola, sorteio ou telas dos jogadores.</p>
          </div>
          <button type="button" onClick={recalculate} disabled={pending} className="rounded-xl bg-accent px-4 py-3 text-xs font-black text-background disabled:opacity-50">
            {pending ? "Calculando..." : initialData.latestRun ? "Recalcular rascunho" : "Calcular histórico"}
          </button>
        </div>
        {message && <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs font-semibold text-foreground">{message}</p>}
      </section>

      {initialData.latestRun && (
        <p className="px-1 text-xs text-muted">{initialData.latestRun.formulaLabel} · {new Date(initialData.latestRun.created_at).toLocaleString("pt-BR")} · {initialData.latestRun.status}</p>
      )}

      {initialData.pendingPlayers.length > 0 && (
        <section className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-black text-foreground">Características pendentes ({initialData.pendingPlayers.length})</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Esses jogadores oficiais não entram no OVR v5 até um administrador escolher uma ou mais características no perfil. Convidados só passam a ter OVR quando virarem jogadores oficiais.</p>
          <p className="mt-2 text-xs font-bold text-warning">{initialData.pendingPlayers.map((player) => player.name).join(" · ")}</p>
        </section>
      )}

      <section className="glass-card overflow-hidden">
        {initialData.snapshots.length === 0 ? (
          <p className="p-5 text-sm text-muted">Ainda não há rascunhos. Calcule o histórico para conferir os primeiros resultados.</p>
        ) : initialData.snapshots.map((item) => (
          <div key={item.playerId} className="border-b border-border p-4 last:border-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-sm font-black text-foreground">{item.playerName}</p><p className="mt-0.5 text-[11px] text-muted">{item.roundsPlayed} rodadas · confiança {Math.round(item.confidence * 100)}% · {item.goals} G · {item.assists} A · características ponderadas</p></div>
              <span className="rounded-lg bg-accent/15 px-3 py-1 text-lg font-black text-accent">OVR {item.overall.toFixed(1)}</span>
            </div>
            <p className="mt-3 text-[11px] font-bold tracking-wide text-muted">DEF {item.def.toFixed(1)} · ALA/MEI {item.alaMei.toFixed(1)} · ATA {item.ata.toFixed(1)} · GOL {item.gol.toFixed(1)} {item.provisional ? "· PROV" : ""}{item.stale ? " · DESATUALIZADO" : ""}</p>
            {item.comparison && <p className="mt-1 text-[10px] font-bold text-accent">vs v4: OVR {item.comparison.overallDelta >= 0 ? "+" : ""}{item.comparison.overallDelta.toFixed(1)} · DEF {item.comparison.defDelta >= 0 ? "+" : ""}{item.comparison.defDelta.toFixed(1)} · ALA/MEI {item.comparison.alaMeiDelta >= 0 ? "+" : ""}{item.comparison.alaMeiDelta.toFixed(1)} · ATA {item.comparison.ataDelta >= 0 ? "+" : ""}{item.comparison.ataDelta.toFixed(1)}</p>}
            <p className="mt-1 text-[10px] text-muted">Confiança por posição: DEF {Math.round(item.positionConfidence.DEF * 100)}% · ALA/MEI {Math.round(item.positionConfidence.ALA_MEI * 100)}% · ATA {Math.round(item.positionConfidence.ATA * 100)}% · GOL {Math.round(item.positionConfidence.GOL * 100)}%</p>
            <button type="button" onClick={() => setOpenPlayer(openPlayer === item.playerId ? null : item.playerId)} className="mt-3 text-xs font-black text-accent">
              {openPlayer === item.playerId ? "Ocultar explicação" : "Ver por que a nota mudou"}
            </button>
            {openPlayer === item.playerId && (
              <div className="mt-3 space-y-2 rounded-xl bg-surface p-3 text-[11px] text-muted">
                <p className="font-bold text-foreground">Últimas rodadas usadas no cálculo</p>
                {item.recentRounds.length === 0 ? <p>Ainda não há atuação oficial registrada.</p> : item.recentRounds.map((round) => (
                  <p key={`${round.date}-${round.positions.DEF}`}>{new Date(`${round.date}T12:00:00`).toLocaleDateString("pt-BR")} · {round.goals} G · {round.assists} A · sofreu {round.goalsConceded} · ataque {Math.round(round.attackingScore * 100)}% · defesa {Math.round(round.defensiveScore * 100)}% · pesos: DEF {Math.round(round.traitEvidence.DEF * 100)}% / ALA {Math.round(round.traitEvidence.ALA_MEI * 100)}% / ATA {Math.round(round.traitEvidence.ATA * 100)}% · tempo do gol {round.timingQuality === "exact" ? "exato" : "estimado"}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
