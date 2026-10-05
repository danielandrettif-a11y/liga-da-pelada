"use client";

import { useState } from "react";
import { BQ_SCORING_V5, type BQBaseScoringSnapshot } from "@/lib/bq-scoring";
import {
  saveBQScoringRules,
  saveColumnCScoringRules,
  type ColumnCScoringSettings,
} from "@/lib/actions/bq-scoring";

function formatPoints(points: number, suffix = "") {
  return `${points > 0 ? "+" : ""}${points}${suffix}`;
}

type ScoringRulesFormProps = {
  initialValues?: BQBaseScoringSnapshot;
  initialColumnCValues: ColumnCScoringSettings;
  isAdmin?: boolean;
};

export function ScoringRulesForm({
  initialValues = BQ_SCORING_V5,
  initialColumnCValues,
  isAdmin = false,
}: ScoringRulesFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPositionEditing, setIsPositionEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPositions, setSavingPositions] = useState(false);
  const [values, setValues] = useState<BQBaseScoringSnapshot>(initialValues);
  const [columnCValues, setColumnCValues] = useState<ColumnCScoringSettings>(initialColumnCValues);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const rulesList = [
    { key: "goal", icon: "⚽", label: "Gol", description: "Por gol marcado na partida.", value: values.goal },
    { key: "assist", icon: "🎯", label: "Assistência", description: "Por assistência registrada.", value: values.assist },
    { key: "win", icon: "🏆", label: "Vitória", description: "Por vitória em uma partida.", value: values.win },
    { key: "draw", icon: "🤝", label: "Empate", description: "Por empate em uma partida.", value: values.draw },
    { key: "loss", icon: "❌", label: "Derrota", description: "Por derrota em uma partida.", value: values.loss },
    { key: "ownGoal", icon: "⚠️", label: "Gol contra", description: "Por gol contra registrado.", value: values.ownGoal },
  ] as const;

  const goalkeeperRules = [
    { key: "goalkeeperAppearance", icon: "🧤", label: "Atuação no gol", description: "Por jogo atuando como goleiro.", value: values.goalkeeperAppearance },
    { key: "goalkeeperGoalConceded", icon: "🥅", label: "Gol sofrido", description: "Por gol sofrido enquanto no gol.", value: values.goalkeeperGoalConceded, suffix: " por gol" },
  ] as const;

  const positionSections: Array<{
    title: string;
    description: string;
    rules: Array<{
      key: keyof ColumnCScoringSettings;
      icon: string;
      label: string;
      description: string;
      suffix?: string;
    }>;
  }> = [
    {
      title: "ATA/ALA",
      description: "Pontuação de quem atua na linha ofensiva.",
      rules: [
        { key: "attackerGoalPoints", icon: "⚽", label: "Gol", description: "Por gol atuando como ATA/ALA." },
        { key: "attackerAssistPoints", icon: "🎯", label: "Assistência", description: "Por assistência atuando como ATA/ALA." },
        { key: "lineGoalConcededPoints", icon: "🥅", label: "Gol sofrido", description: "Por gol sofrido pelo time enquanto atua como ATA/ALA.", suffix: " por gol" },
      ],
    },
    {
      title: "DEF/VOL",
      description: "Clean sheet regressivo: com 1 gol sofrido, soma o bônus reduzido e depois aplica a penalidade do gol.",
      rules: [
        { key: "defenderGoalPoints", icon: "⚽", label: "Gol", description: "Por gol atuando como DEF/VOL." },
        { key: "defenderAssistPoints", icon: "🎯", label: "Assistência", description: "Por assistência atuando como DEF/VOL." },
        { key: "defenderCleanSheetPoints", icon: "🔒", label: "Clean sheet · 0 gols", description: "Bônus por partida de DEF sem sofrer gol." },
        { key: "defenderOneGoalPoints", icon: "🛡️", label: "Clean sheet regressivo · 1 gol", description: "Bônus reduzido por partida de DEF sofrendo exatamente um gol." },
        { key: "defenderOneGoalConcededPoints", icon: "📉", label: "Penalidade · 1 gol", description: "Penalidade somada ao clean sheet regressivo quando o DEF sofre um gol." },
        { key: "defenderTwoGoalsConcededPoints", icon: "🥅", label: "Penalidade · 2 gols", description: "Penalidade total por partida de DEF sofrendo exatamente dois gols." },
      ],
    },
    {
      title: "GOL",
      description: "Scouts considerados somente durante a atuação no gol. Gol e assistência usam os valores de DEF/VOL; gol contra usa o scout básico.",
      rules: [
        { key: "goalkeeperSlotAppearancePoints", icon: "🧤", label: "Atuação no gol", description: "Por partida atuando no gol." },
        { key: "goalkeeperSlotGoalConcededPoints", icon: "🥅", label: "Gol sofrido", description: "Por gol sofrido enquanto está no gol.", suffix: " por gol" },
        { key: "goalkeeperSlotCleanSheetPoints", icon: "🔒", label: "Sofreu 0 gols", description: "Total por atuação no gol sem sofrer gol." },
        { key: "goalkeeperSlotOneGoalPoints", icon: "🛡️", label: "Sofreu 1 gol", description: "Total por atuação no gol sofrendo exatamente um gol." },
      ],
    },
  ];

  function handleChange(key: keyof BQBaseScoringSnapshot, val: string) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setValues((prev) => ({ ...prev, [key]: num }));
    }
  }

  function handleColumnCChange(key: keyof ColumnCScoringSettings, val: string) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setColumnCValues((prev) => ({ ...prev, [key]: num }));
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await saveBQScoringRules(values);
      if (res.success) {
        setMessage({ type: "success", text: "Regras de pontuação BQ salvas com sucesso!" });
        setIsEditing(false);
      } else {
        setMessage({ type: "error", text: res.error || "Erro ao salvar regras." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePositions() {
    setSavingPositions(true);
    setMessage(null);
    try {
      const res = await saveColumnCScoringRules(columnCValues);
      if (res.success) {
        setMessage({ type: "success", text: "Regras por posição salvas para as próximas rodadas!" });
        setIsPositionEditing(false);
      } else {
        setMessage({ type: "error", text: res.error || "Erro ao salvar as regras por posição." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSavingPositions(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="glass-card flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-bold text-foreground">Scouts Básicos BQ v5</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Estes 8 scouts formam a base oficial compartilhada entre Ranked e Cartola.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (isEditing) {
                setValues(initialValues);
                setIsEditing(false);
              } else {
                setIsEditing(true);
              }
            }}
            className="rounded-xl bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-hover"
          >
            {isEditing ? "Cancelar" : "Editar"}
          </button>
        )}
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold ${
            message.type === "success" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Regras Gerais */}
      <div className="glass-card overflow-hidden">
        {rulesList.map((rule, index) => (
          <div
            key={rule.key}
            className={`flex items-center gap-3 p-4 ${index < rulesList.length - 1 ? "border-b border-border" : ""}`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-xl" aria-hidden="true">
              {rule.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{rule.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">{rule.description}</p>
            </div>
            {isEditing ? (
              <input
                type="number"
                step="0.5"
                value={values[rule.key]}
                onChange={(e) => handleChange(rule.key, e.target.value)}
                className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm font-bold text-foreground focus:border-accent focus:outline-none"
              />
            ) : (
              <span className={`shrink-0 text-lg font-black ${rule.value > 0 ? "text-accent" : "text-danger"}`}>
                {formatPoints(rule.value)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Goleiro */}
      <section className="space-y-3">
        <h2 className="px-1 text-xs font-black uppercase tracking-wider text-muted">Goleiro</h2>
        <div className="glass-card overflow-hidden">
          {goalkeeperRules.map((rule, index) => (
            <div
              key={rule.key}
              className={`flex items-center gap-3 p-4 ${index < goalkeeperRules.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-xl" aria-hidden="true">
                {rule.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">{rule.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{rule.description}</p>
              </div>
              {isEditing ? (
                <input
                  type="number"
                  step="0.5"
                  value={values[rule.key]}
                  onChange={(e) => handleChange(rule.key, e.target.value)}
                  className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm font-bold text-foreground focus:border-accent focus:outline-none"
                />
              ) : (
                <span className={`shrink-0 text-lg font-black ${rule.value > 0 ? "text-accent" : "text-danger"}`}>
                  {formatPoints(rule.value, (rule as any).suffix)}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {isEditing && (
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-accent px-4 py-3 text-xs font-bold text-background transition-transform active:scale-95 disabled:opacity-50"
          >
            {saving ? "Salvando alterações..." : "Salvar Regras de Pontuação"}
          </button>
        </div>
      )}

      <section className="space-y-3 pt-2">
        <div className="glass-card flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-bold text-foreground">Regras por posição · Coluna C</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Valores de ATA/ALA, DEF/VOL e GOL. As faixas de DEF são totais por partida.</p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (isPositionEditing) {
                  setColumnCValues(initialColumnCValues);
                  setIsPositionEditing(false);
                } else {
                  setIsPositionEditing(true);
                }
              }}
              className="shrink-0 rounded-xl bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-hover"
            >
              {isPositionEditing ? "Cancelar" : "Editar"}
            </button>
          )}
        </div>

        {positionSections.map((section) => (
          <div key={section.title} className="space-y-2">
            <div className="px-1">
              <h2 className="text-xs font-black uppercase tracking-wider text-muted">{section.title}</h2>
              <p className="mt-0.5 text-[10px] text-muted">{section.description}</p>
            </div>
            <div className="glass-card overflow-hidden">
              {section.rules.map((rule, index) => {
                const value = columnCValues[rule.key];
                return (
                  <div key={rule.key} className={`flex items-center gap-3 p-4 ${index < section.rules.length - 1 ? "border-b border-border" : ""}`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-xl" aria-hidden="true">{rule.icon}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">{rule.label}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">{rule.description}</p>
                    </div>
                    {isPositionEditing ? (
                      <input
                        type="number"
                        step="0.25"
                        value={value}
                        onChange={(event) => handleColumnCChange(rule.key, event.target.value)}
                        className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm font-bold text-foreground focus:border-accent focus:outline-none"
                      />
                    ) : (
                      <span className={`shrink-0 text-lg font-black ${value > 0 ? "text-accent" : value < 0 ? "text-danger" : "text-muted"}`}>
                        {formatPoints(value, rule.suffix)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {isPositionEditing && (
          <div className="space-y-2">
            {message?.type === "error" && (
              <p role="alert" className="rounded-xl bg-rose-500/20 p-3 text-xs font-semibold text-rose-400">
                {message.text}
              </p>
            )}
            <button
              type="button"
              onClick={handleSavePositions}
              disabled={savingPositions}
              className="w-full rounded-xl bg-accent px-4 py-3 text-xs font-bold text-background transition-transform active:scale-95 disabled:opacity-50"
            >
              {savingPositions ? "Salvando alterações..." : "Salvar regras por posição"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
