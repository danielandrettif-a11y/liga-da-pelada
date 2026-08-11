"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TrendingUp } from "@/components/icons";
import { saveMyFitness, setFitnessVisibility, type FitnessRoundEntry, type FitnessSummary } from "@/lib/actions/fitness";

export function FitnessPanel({ rounds, visible, summaries }: { rounds: FitnessRoundEntry[]; visible: boolean; summaries: { official: FitnessSummary; friendly: FitnessSummary } | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  async function save(round: FitnessRoundEntry, formData: FormData) {
    setLoading(round.roundId); setError("");
    const result = await saveMyFitness(round.roundId, Number(formData.get("distance")), Number(formData.get("speed")));
    if (!result.success) setError(result.error || "Erro ao salvar."); else router.refresh();
    setLoading("");
  }
  async function toggle(next: boolean) {
    setLoading("visibility"); const result = await setFitnessVisibility(next);
    if (!result.success) setError(result.error || "Erro ao alterar privacidade."); else router.refresh();
    setLoading("");
  }
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1"><TrendingUp className="h-4 w-4 text-accent" /><div><h2 className="text-sm font-black text-foreground">Desempenho físico</h2><p className="text-[10px] text-muted">Preenchimento opcional após cada participação</p></div></div>
      {error && <p className="rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}
      <div className="glass-card p-4">
        <label className="flex items-center justify-between gap-3"><span><span className="block text-sm font-bold text-foreground">Mostrar no perfil público</span><span className="block text-[10px] text-muted">Privado por padrão; você controla a exibição.</span></span><input type="checkbox" checked={visible} disabled={loading === "visibility"} onChange={(event) => toggle(event.target.checked)} className="h-5 w-5 accent-[var(--accent)]" /></label>
        {summaries && <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">{([['Ranked', summaries.official], ['Amistosos', summaries.friendly]] as const).map(([label, summary]) => <div key={label} className="rounded-xl bg-background/50 p-3"><p className="text-[9px] font-black uppercase text-muted">{label}</p><p className="mt-1 text-lg font-black text-foreground">{summary.distanceKm} km</p><p className="text-[10px] text-muted">média {summary.averageSpeedKmh} km/h · {summary.entries} registros</p></div>)}</div>}
      </div>
      <div className="space-y-2">
        {rounds.map((round) => (
          <form key={round.roundId} action={save.bind(null, round)} className="glass-card p-4">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-black text-foreground">{round.roundType === "friendly" ? "Amistoso" : "Rodada"} {String(round.number).padStart(2, "0")}</p><p className="text-[10px] text-muted">{new Intl.DateTimeFormat("pt-BR").format(new Date(`${round.date}T12:00:00`))}</p></div>{round.fitness && <CheckCircle2 className="h-5 w-5 text-accent" />}</div>
            <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold uppercase text-muted">Distância (km)<input name="distance" type="number" min="0.01" max="100" step="0.01" required defaultValue={round.fitness?.distance_km || ""} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground" /></label><label className="text-[10px] font-bold uppercase text-muted">Média (km/h)<input name="speed" type="number" min="0.1" max="60" step="0.01" required defaultValue={round.fitness?.average_speed_kmh || ""} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground" /></label></div>
            <button disabled={!!loading} className="mt-3 flex w-full items-center justify-center rounded-xl border border-accent/30 py-2.5 text-xs font-black text-accent disabled:opacity-50">{loading === round.roundId ? <Loader2 className="h-4 w-4 animate-spin" /> : round.fitness ? "Atualizar dados" : "Salvar dados"}</button>
          </form>
        ))}
        {rounds.length === 0 && <div className="glass-card p-5 text-center text-xs text-muted">Depois de participar de uma rodada finalizada, o formulário aparecerá aqui.</div>}
      </div>
    </section>
  );
}

