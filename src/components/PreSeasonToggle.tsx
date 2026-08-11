"use client";

import { useState, useTransition } from "react";
import { Sparkles, Trophy } from "@/components/icons";
import { updatePreSeasonEnabled } from "@/lib/actions/league";

export function PreSeasonToggle({ leagueId, initialEnabled }: { leagueId: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle() {
    const nextValue = !enabled;
    setEnabled(nextValue);
    setError("");
    startTransition(async () => {
      const result = await updatePreSeasonEnabled(leagueId, nextValue);
      if (!result.success) {
        setEnabled(!nextValue);
        setError(result.error || "Não foi possível alterar a pré-temporada.");
      }
    });
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">Pré-temporada</h2>
      <div className={`overflow-hidden rounded-2xl border transition-colors ${enabled ? "border-accent/35 bg-accent/[0.07]" : "border-border bg-surface"}`}>
        <div className="flex items-center gap-3 p-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${enabled ? "bg-accent text-background" : "bg-surface-hover text-muted"}`}>
            {enabled ? <Trophy className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-foreground">Pré-Temporada V.1</p>
            <p className="text-xs leading-4 text-muted">
              {enabled ? "O carrossel de amistosos está visível na página inicial." : "A página inicial exibe somente a próxima rodada."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Ativar pré-temporada"
            disabled={pending || !leagueId}
            onClick={toggle}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-60 ${enabled ? "border-accent bg-accent" : "border-border bg-surface-hover"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-transform ${enabled ? "translate-x-5 bg-background" : "translate-x-0.5 bg-muted"}`} />
          </button>
        </div>
        <div className="border-t border-border/70 px-4 py-2.5">
          <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${enabled ? "text-accent" : "text-muted"}`}>
            {pending ? "Salvando..." : enabled ? "Campanha ligada" : "Campanha desligada"}
          </p>
          {error && <p className="mt-1 text-[10px] font-semibold text-danger">{error}</p>}
        </div>
      </div>
    </section>
  );
}
