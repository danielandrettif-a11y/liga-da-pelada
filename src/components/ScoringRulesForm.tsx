"use client";

import { useState } from "react";
import {
  CircleDot,
  Handshake,
  Medal,
  Save,
  ShieldX,
  Sparkles,
  Target,
  Trophy,
} from "@/components/icons";
import { updateScoringRules } from "@/lib/actions/scoring";
import { SCORING_RULE_FIELDS, type ScoringPoints } from "@/lib/scoring";
import type { EventType } from "@/lib/types";

const ICONS = {
  goal: CircleDot,
  assist: Target,
  win: Trophy,
  draw: Handshake,
  loss: ShieldX,
  best_goalkeeper: Medal,
  goalkeeper_appearance: Medal,
  goal_conceded: ShieldX,
} satisfies Record<EventType, typeof CircleDot>;

type Props = {
  initialRules: ScoringPoints;
  initialError?: string;
};

export function ScoringRulesForm({ initialRules, initialError }: Props) {
  const [rules, setRules] = useState<ScoringPoints>(initialRules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [success, setSuccess] = useState("");
  const [warning, setWarning] = useState("");

  function setRule(eventType: EventType, value: string) {
    setRules((current) => ({
      ...current,
      [eventType]: value === "" ? 0 : Number(value),
    }));
    setSuccess("");
    setWarning("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    setWarning("");

    const result = await updateScoringRules(rules);
    if (!result.success) {
      setError(result.error || "Não foi possível salvar a pontuação.");
    } else {
      setSuccess(
        result.recalculatedRounds
          ? `Pontuação salva e ${result.recalculatedRounds} ${result.recalculatedRounds === 1 ? "rodada recalculada" : "rodadas recalculadas"}.`
          : "Pontuação salva com sucesso.",
      );
      setWarning(result.warning || "");
    }

    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="glass-card flex gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Como funciona</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Os pontos são aplicados a cada partida ou evento. Ao salvar, o ranking da temporada atual é recalculado.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-bold text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-xs font-bold text-success">
          {success}
        </div>
      )}
      {warning && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs font-bold text-warning">
          {warning}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        {SCORING_RULE_FIELDS.map((field, index) => {
          const Icon = ICONS[field.eventType];
          return (
            <div
              key={field.eventType}
              className={`flex items-center gap-3 p-4 ${index < SCORING_RULE_FIELDS.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
                <Icon className="h-5 w-5 text-accent" />
              </div>
              <label className="min-w-0 flex-1" htmlFor={`points-${field.eventType}`}>
                <span className="block text-sm font-bold text-foreground">{field.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{field.description}</span>
              </label>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  id={`points-${field.eventType}`}
                  type="number"
                  inputMode="numeric"
                  min={-100}
                  max={100}
                  step={1}
                  value={rules[field.eventType]}
                  onChange={(event) => setRule(field.eventType, event.target.value)}
                  className="h-11 w-16 rounded-xl border border-border bg-surface-hover px-2 text-center text-lg font-black text-foreground outline-none transition-colors focus:border-accent"
                />
                <span className="hidden w-8 text-[10px] font-bold uppercase text-muted min-[390px]:block">pts</span>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 font-black text-background transition-all active:scale-[0.98] disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? "Salvando e recalculando..." : "Salvar pontuação"}
      </button>
    </div>
  );
}
