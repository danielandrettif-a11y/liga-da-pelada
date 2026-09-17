"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recalculateOverallShadow, type OverallShadowAdminData } from "@/lib/actions/overall";

export function OverallShadowPanel({ initialData }: { initialData: OverallShadowAdminData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function recalculate() {
    setMessage(null);
    startTransition(async () => {
      const result = await recalculateOverallShadow();
      setMessage(result.success
        ? `Rascunho calculado para ${result.players} jogadores em ${result.rounds} rodadas. Nada foi publicado.`
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
        <p className="px-1 text-xs text-muted">Última execução: {new Date(initialData.latestRun.created_at).toLocaleString("pt-BR")} · {initialData.latestRun.status}</p>
      )}

      <section className="glass-card overflow-hidden">
        {initialData.snapshots.length === 0 ? (
          <p className="p-5 text-sm text-muted">Ainda não há rascunhos. Calcule o histórico para conferir os primeiros resultados.</p>
        ) : initialData.snapshots.map((item) => (
          <div key={item.playerId} className="border-b border-border p-4 last:border-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-sm font-black text-foreground">{item.playerName}</p><p className="mt-0.5 text-[11px] text-muted">{item.roundsPlayed} rodadas · confiança {Math.round(item.confidence * 100)}% · {item.goals} G · {item.assists} A · {item.seedMode === "legacy_tag" ? "base legada" : "observado"}</p></div>
              <span className="rounded-lg bg-accent/15 px-3 py-1 text-lg font-black text-accent">OVR {item.overall.toFixed(1)}</span>
            </div>
            <p className="mt-3 text-[11px] font-bold tracking-wide text-muted">DEF {item.def.toFixed(1)} · ALA/MEI {item.alaMei.toFixed(1)} · ATA {item.ata.toFixed(1)} · GOL {item.gol.toFixed(1)} {item.provisional ? "· PROV" : ""}{item.stale ? " · DESATUALIZADO" : ""}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
