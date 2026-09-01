import { RANKED_GOALKEEPER_SCORING_RULES, RANKED_SCORING_RULES } from "@/lib/ranked-scoring";

function formatPoints(points: number, suffix = "") {
  return `${points > 0 ? "+" : ""}${points}${suffix}`;
}

function RulesList({ rules }: { rules: ReadonlyArray<{ key: string; icon: string; label: string; description: string; points: number; suffix?: string }> }) {
  return (
    <div className="glass-card overflow-hidden">
      {rules.map((rule, index) => (
        <div
          key={rule.key}
          className={`flex items-center gap-3 p-4 ${index < rules.length - 1 ? "border-b border-border" : ""}`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-xl" aria-hidden="true">
            {rule.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">{rule.label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">{rule.description}</p>
          </div>
          <span className={`shrink-0 text-lg font-black ${rule.points > 0 ? "text-accent" : "text-danger"}`}>
            {formatPoints(rule.points, rule.suffix)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ScoringRulesForm() {
  return (
    <div className="space-y-5">
      <div className="glass-card p-4">
        <p className="text-sm font-bold text-foreground">Como funciona</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          A Ranked usa somente resultados e eventos reais registrados nas partidas. Não há bônus por posição ou por tag.
        </p>
      </div>

      <RulesList rules={RANKED_SCORING_RULES} />

      <section className="space-y-3">
        <h2 className="px-1 text-xs font-black uppercase tracking-wider text-muted">Goleiro</h2>
        <RulesList rules={RANKED_GOALKEEPER_SCORING_RULES} />
      </section>
    </div>
  );
}
