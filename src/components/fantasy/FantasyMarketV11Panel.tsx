"use client";

import { useState, useTransition } from "react";
import { previewFantasyMarketV11 } from "@/lib/actions/fantasy";

function money(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `C$ ${numeric.toFixed(2).replace(".", ",")}` : "—";
}

function percent(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(0)}%` : "—";
}

export function FantasyMarketV11Panel({ initialStatus }: { initialStatus: any }) {
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const data = preview || initialStatus;

  function loadPreview() {
    startTransition(async () => {
      const result = await previewFantasyMarketV11();
      if (!result.success) {
        setMessage(result.error || "Não foi possível calcular a prévia.");
        return;
      }
      setPreview(result.preview);
      setMessage("Prévia calculada sem alterar preços, patrimônios ou escalações.");
    });
  }

  const level = data?.level === "COMPETITIVE" ? "Competitivo" : data?.level === "ACCESSIBLE" ? "Acessível" : "Equilibrado";
  return (
    <section className="glass-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-accent">Mercado V11 · dificuldade adaptativa</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">A prévia mede a economia real da liga antes de ativar qualquer mudança. Nenhum dado é gravado nesta ação.</p>
        </div>
        <span className="shrink-0 rounded-full border border-accent/25 bg-accent/10 px-2 py-1 text-[9px] font-black uppercase text-accent">{level}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Time econômico" value={money(data?.economyLineupCost ?? data?.economy_lineup_cost)} />
        <Metric label="Time competitivo" value={money(data?.competitiveLineupCost ?? data?.competitive_lineup_cost)} />
        <Metric label="Time elite" value={money(data?.eliteLineupCost ?? data?.elite_lineup_cost)} />
        <Metric label="Acesso à elite" value={percent(data?.eliteAffordabilityRate ?? data?.elite_affordability_rate)} />
        <Metric label="Patrimônio/elite" value={Number((data?.medianEliteRatio ?? data?.median_elite_ratio) ?? 0).toFixed(2)} />
        <Metric label="Pressão" value={Number(data?.pressure || 0).toFixed(2)} />
        <Metric label="Multiplicador atual" value={Number((data?.previousMultiplier ?? data?.previous_multiplier) ?? 1).toFixed(2)} />
        <Metric label="Próxima rodada" value={Number((data?.nextMultiplier ?? data?.next_multiplier) ?? 1).toFixed(2)} />
      </div>

      <button type="button" onClick={loadPreview} disabled={pending} className="mt-4 w-full rounded-xl border border-accent/35 bg-accent/10 py-3 text-xs font-black text-accent disabled:opacity-50">
        {pending ? "Calculando saúde do mercado…" : "Gerar prévia V11"}
      </button>
      <p className="mt-2 text-[9px] leading-4 text-muted">Meta: 15–25% conseguem comprar a escalação elite; ao menos 80% conseguem a competitiva; todos conseguem uma escalação válida econômica.</p>
      {message && <p role="status" className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-[10px] font-bold text-foreground">{message}</p>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/15 p-2.5"><p className="text-[8px] font-bold uppercase text-muted">{label}</p><p className="mt-1 text-sm font-black text-foreground">{value}</p></div>;
}
