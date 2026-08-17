"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Clock, Loader2, TrendingUp } from "@/components/icons";
import { saveMyFitness, setFitnessVisibility, type FitnessRoundEntry, type FitnessSummary } from "@/lib/actions/fitness";

export function FitnessPanel({
  rounds,
  visible,
  summaries,
}: {
  rounds: FitnessRoundEntry[];
  visible: boolean;
  summaries: { official: FitnessSummary; friendly: FitnessSummary } | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);

  async function save(round: FitnessRoundEntry, formData: FormData) {
    setLoading(round.roundId);
    setError("");
    const distance = Number(formData.get("distance"));
    const pace = Number(formData.get("pace"));
    const result = await saveMyFitness(round.roundId, distance, pace);
    if (!result.success) {
      setError(result.error || "Erro ao salvar.");
    } else {
      router.refresh();
      setOpenRoundId(null);
    }
    setLoading("");
  }

  async function toggle(next: boolean) {
    setLoading("visibility");
    const result = await setFitnessVisibility(next);
    if (!result.success) setError(result.error || "Erro ao alterar privacidade.");
    else router.refresh();
    setLoading("");
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <TrendingUp className="h-4 w-4 text-accent" />
        <div>
          <h2 className="text-sm font-black text-foreground">Desempenho físico</h2>
          <p className="text-[10px] text-muted">Preenchimento opcional após cada participação</p>
        </div>
      </div>

      {error && <p className="rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}

      <div className="glass-card p-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-bold text-foreground">Mostrar no perfil público</span>
            <span className="block text-[10px] text-muted">Privado por padrão; você controla a exibição.</span>
          </span>
          <input
            type="checkbox"
            checked={visible}
            disabled={loading === "visibility"}
            onChange={(event) => toggle(event.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
        </label>

        {summaries && (
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
            {([['Ranked', summaries.official], ['Amistosos', summaries.friendly]] as const).map(([label, summary]) => {
              const metersPerMin = summary.metersPerMinute || Math.round((summary.averageSpeedKmh * 1000) / 60);
              return (
                <div key={label} className="rounded-xl bg-background/50 p-3">
                  <p className="text-[9px] font-black uppercase text-muted">{label}</p>
                  <p className="mt-1 text-lg font-black text-foreground">{summary.distanceKm} km</p>
                  <p className="text-[10px] text-muted">
                    média {metersPerMin} m/min · {summary.entries} registros
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Accordion de Partidas / Rodadas */}
      <div className="space-y-2">
        <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted">
          Suas Rodadas ({rounds.length})
        </p>

        {rounds.map((round) => {
          const isOpen = openRoundId === round.roundId;
          const isFilled = Boolean(round.fitness);
          const currentMetersPerMin = round.fitness?.average_speed_kmh
            ? Math.round((round.fitness.average_speed_kmh * 1000) / 60)
            : "";

          return (
            <div key={round.roundId} className="glass-card overflow-hidden transition-colors">
              {/* Cabeçalho do Accordion (Toque para abrir/fechar) */}
              <button
                type="button"
                onClick={() => setOpenRoundId(isOpen ? null : round.roundId)}
                className="flex w-full items-center justify-between p-3.5 text-left hover:bg-surface/50 transition-colors"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-foreground">
                      {round.roundType === "friendly" ? "Amistoso" : "Rodada"} {String(round.number).padStart(2, "0")}
                    </p>
                    <span className="text-[10px] text-muted">
                      {new Intl.DateTimeFormat("pt-BR").format(new Date(`${round.date}T12:00:00`))}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center gap-2">
                    {isFilled ? (
                      <span className="text-[11px] font-black text-accent">
                        {round.fitness?.distance_km} km · {currentMetersPerMin} m/min
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning/80">
                        <Clock className="h-3 w-3" /> Pendente de preenchimento
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isFilled && <CheckCircle2 className="h-4 w-4 text-accent" />}
                  <ChevronDown className={`h-4 w-4 text-muted transition-transform duration-200 ${isOpen ? "rotate-180 text-accent" : ""}`} />
                </div>
              </button>

              {/* Formulário Expandido */}
              {isOpen && (
                <form
                  action={save.bind(null, round)}
                  className="border-t border-border/60 bg-black/25 p-4 animate-fade-in space-y-3"
                >
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="text-[10px] font-bold uppercase text-muted">
                      Distância (km)
                      <input
                        name="distance"
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        required
                        placeholder="ex: 4.50"
                        defaultValue={round.fitness?.distance_km || ""}
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground"
                      />
                    </label>
                    <label className="text-[10px] font-bold uppercase text-muted">
                      Ritmo Médio (m/min)
                      <input
                        name="pace"
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        required
                        placeholder="ex: 110"
                        defaultValue={currentMetersPerMin}
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setOpenRoundId(null)}
                      className="rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-muted hover:text-foreground"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading === round.roundId}
                      className="flex-1 flex items-center justify-center rounded-xl bg-accent py-2.5 text-xs font-black uppercase text-background shadow-md active:scale-95 disabled:opacity-50"
                    >
                      {loading === round.roundId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isFilled ? (
                        "Atualizar Dados"
                      ) : (
                        "Salvar Dados"
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}

        {rounds.length === 0 && (
          <div className="glass-card p-5 text-center text-xs text-muted">
            Depois de participar de uma rodada finalizada, o formulário aparecerá aqui.
          </div>
        )}
      </div>
    </section>
  );
}

