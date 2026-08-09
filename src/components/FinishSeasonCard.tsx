"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, FileText, Flag, Image, X } from "@/components/icons";
import { finishSeason } from "@/lib/actions/seasons";
import type { SeasonSummary } from "@/lib/types";

export function FinishSeasonCard() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [summary, setSummary] = useState<SeasonSummary | null>(null);
  const [newSeasonNumber, setNewSeasonNumber] = useState<number | null>(null);

  function openModal() {
    setConfirmation("");
    setError("");
    setModalOpen(true);
  }

  async function handleFinish() {
    setLoading(true);
    setError("");

    const result = await finishSeason(confirmation);
    if (!result.success || !result.summary) {
      setError(result.error || "Não foi possível terminar a temporada.");
      setLoading(false);
      return;
    }

    setSummary(result.summary);
    setNewSeasonNumber(result.newSeasonNumber || result.summary.seasonNumber + 1);
    setLoading(false);
    router.refresh();
  }

  async function handlePdfDownload() {
    if (!summary) return;
    setExportError("");
    try {
      const { downloadSeasonPdf } = await import("@/lib/seasonExports");
      downloadSeasonPdf(summary);
    } catch (caughtError) {
      setExportError(caughtError instanceof Error ? caughtError.message : "Erro ao gerar o PDF.");
    }
  }

  async function handleStoryDownload() {
    if (!summary) return;
    setExportError("");
    try {
      const { downloadSeasonStory } = await import("@/lib/seasonExports");
      await downloadSeasonStory(summary);
    } catch (caughtError) {
      setExportError(caughtError instanceof Error ? caughtError.message : "Erro ao gerar a imagem.");
    }
  }

  return (
    <>
      <div>
        <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-2 px-1">Temporada</h2>
        <div className="glass-card p-4">
          {summary ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
                  <Flag className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Temporada {summary.seasonNumber} arquivada</p>
                  <p className="text-xs text-muted mt-0.5">A temporada {newSeasonNumber} já está ativa.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handlePdfDownload}
                  className="py-3 rounded-xl bg-surface-hover border border-border text-foreground text-xs font-bold flex items-center justify-center gap-2 hover:border-accent/40"
                >
                  <FileText className="w-4 h-4 text-accent" />
                  Baixar PDF
                </button>
                <button
                  type="button"
                  onClick={handleStoryDownload}
                  className="py-3 rounded-xl bg-surface-hover border border-border text-foreground text-xs font-bold flex items-center justify-center gap-2 hover:border-accent/40"
                >
                  <Image className="w-4 h-4 text-accent" />
                  Baixar Stories
                </button>
              </div>
              {exportError && <p className="text-xs font-semibold text-danger">{exportError}</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Terminar temporada</p>
                <p className="text-xs text-muted mt-0.5">Arquiva os resultados e inicia um ranking zerado.</p>
              </div>
              <button
                type="button"
                onClick={openModal}
                className="px-3 py-2.5 rounded-xl border border-danger/40 bg-danger/10 text-danger text-xs font-bold flex-shrink-0 hover:bg-danger/15"
              >
                Terminar
              </button>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[200] bg-background/90 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-slide-in-bottom">
            <div className="p-5 flex items-start justify-between border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-danger/15 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-danger" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    {summary ? "Temporada encerrada" : "Terminar temporada?"}
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    {summary ? `A temporada ${newSeasonNumber} foi iniciada.` : "Esta ação não pode ser desfeita."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={loading}
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:bg-surface-hover"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {summary ? (
              <div className="p-5 space-y-4">
                <div className="rounded-2xl bg-accent/10 border border-accent/25 p-4">
                  <p className="text-xs font-bold text-accent uppercase tracking-wider">Relatórios disponíveis</p>
                  <p className="text-sm text-foreground mt-1">
                    Baixe o ranking completo em PDF e a arte vertical para Instagram Stories.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePdfDownload}
                  className="w-full py-3.5 rounded-xl bg-surface-hover border border-border text-foreground font-bold flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5 text-accent" />
                  Baixar relatório PDF
                  <Download className="w-4 h-4 text-muted" />
                </button>
                <button
                  type="button"
                  onClick={handleStoryDownload}
                  className="w-full py-3.5 rounded-xl bg-accent text-background font-bold flex items-center justify-center gap-2"
                >
                  <Image className="w-5 h-5" />
                  Baixar imagem para Stories
                  <Download className="w-4 h-4" />
                </button>
                {exportError && <p className="text-xs font-semibold text-danger">{exportError}</p>}
              </div>
            ) : (
              <div className="p-5 space-y-5">
                <div className="space-y-2 text-sm text-muted">
                  <p>Ao confirmar:</p>
                  <ul className="space-y-1.5 list-disc pl-5">
                    <li>o ranking atual será arquivado;</li>
                    <li>uma nova temporada começará com zero pontos;</li>
                    <li>jogadores e rodadas antigas não serão apagados;</li>
                    <li>será gerado um PDF e uma arte para Stories.</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <label htmlFor="finish-season-confirmation" className="text-xs font-bold text-foreground">
                    Digite <span className="text-danger">Terminar</span> para confirmar
                  </label>
                  <input
                    id="finish-season-confirmation"
                    type="text"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder="Terminar"
                    autoComplete="off"
                    autoFocus
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-danger"
                  />
                </div>

                {error && (
                  <div role="alert" className="p-3 rounded-xl bg-danger/10 text-danger text-xs font-semibold">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pb-[max(0px,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    disabled={loading}
                    className="py-3.5 rounded-xl bg-surface-hover border border-border text-foreground font-bold disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleFinish}
                    disabled={loading || confirmation !== "Terminar"}
                    className="py-3.5 rounded-xl bg-danger text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? "Terminando..." : "Terminar temporada"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
