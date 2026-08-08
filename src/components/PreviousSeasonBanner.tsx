"use client";

import { useState } from "react";
import { ChevronDown, Download, FileText, Image, Trophy } from "lucide-react";
import type { SeasonSummary } from "@/lib/types";
import { downloadSeasonPdf, downloadSeasonStory } from "@/lib/seasonExports";

export function PreviousSeasonBanner({ summary }: { summary: SeasonSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const champion = summary.ranking[0];

  function downloadPdf() {
    setError("");
    try {
      downloadSeasonPdf(summary);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao gerar o PDF.");
    }
  }

  async function downloadStory() {
    setError("");
    try {
      await downloadSeasonStory(summary);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao gerar a imagem.");
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/15 via-surface to-surface animate-fade-in">
      <div className="absolute -right-8 -top-10 w-36 h-36 rounded-full bg-accent/10 blur-2xl" />
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="relative w-full p-4 text-left flex items-center gap-3"
        aria-expanded={expanded}
      >
        <div className="w-11 h-11 rounded-xl bg-accent text-background flex items-center justify-center flex-shrink-0">
          <Trophy className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-accent uppercase tracking-widest">Temporada anterior</p>
          <p className="text-sm font-bold text-foreground mt-0.5">Veja como foi a Temporada {summary.seasonNumber}</p>
          <p className="text-xs text-muted truncate mt-0.5">
            Campeão: {champion?.nickname || champion?.name || "Sem classificação"}
          </p>
        </div>
        <ChevronDown className={`w-5 h-5 text-accent transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="relative px-4 pb-4 border-t border-accent/15 pt-4 space-y-4 animate-fade-in">
          <div className="grid grid-cols-3 gap-2">
            {[
              [summary.roundCount, "Rodadas"],
              [summary.matchCount, "Partidas"],
              [summary.goalCount, "Gols"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl bg-background/60 border border-border p-3 text-center">
                <p className="stat-number text-xl text-foreground">{value}</p>
                <p className="text-[9px] text-muted uppercase font-bold mt-1">{label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={downloadPdf}
              className="py-3 rounded-xl bg-background/70 border border-border text-foreground text-xs font-bold flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4 text-accent" />
              PDF
              <Download className="w-3.5 h-3.5 text-muted" />
            </button>
            <button
              type="button"
              onClick={downloadStory}
              className="py-3 rounded-xl bg-accent text-background text-xs font-bold flex items-center justify-center gap-2"
            >
              <Image className="w-4 h-4" />
              Stories
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && <p className="text-xs text-danger font-semibold">{error}</p>}
        </div>
      )}
    </section>
  );
}
