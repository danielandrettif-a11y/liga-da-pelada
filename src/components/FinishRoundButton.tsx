"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, X } from "@/components/icons";
import { finishRound } from "@/lib/actions/rounds";
import { useDialogViewport } from "@/lib/useDialogViewport";

export function FinishRoundButton({ roundId, status, canManage }: { roundId: string; status: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [pix, setPix] = useState("");
  const [paymentTotal, setPaymentTotal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useDialogViewport(open);

  if (status === "finished") {
    return (
      <div className="mt-6 space-y-2">
        <div className="w-full bg-surface border border-accent/20 text-accent font-bold py-4 rounded-xl flex items-center justify-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          Rodada Encerrada
        </div>
        <Link
          href={`/pagamentos?rodada=${roundId}`}
          className="block text-center text-xs font-bold text-muted hover:text-accent"
        >
          Ver pagamentos desta rodada
        </Link>
      </div>
    );
  }

  if (!canManage) return null;

  async function handleFinish() {
    if (!pix.trim()) {
      setError("Informe a chave PIX antes de encerrar a rodada.");
      return;
    }
    const total = Number(paymentTotal.replace(",", "."));
    if (!Number.isFinite(total) || total <= 0) {
      setError("Informe o valor total da pelada.");
      return;
    }

    setLoading(true);
    setError("");
    const result = await finishRound(roundId, pix, total);
    if (!result.success) {
      setError(result.error || "Nao foi possivel encerrar a rodada.");
      setLoading(false);
      return;
    }
    setOpen(false);
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-6 bg-surface border border-danger/30 hover:bg-danger/10 text-danger font-bold py-4 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <CheckCircle2 className="w-5 h-5" />
        Encerrar Rodada
      </button>

      {open && (
        <div className="mobile-dialog-backdrop bg-black/75 backdrop-blur-sm animate-fade-in" onMouseDown={(event) => event.target === event.currentTarget && !loading && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="finish-round-title" className="mobile-dialog-panel max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl animate-fade-in-up">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="finish-round-title" className="text-lg font-black text-foreground">Encerrar a rodada?</h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Os pontos serao consolidados. Informe o PIX de quem vai receber o valor da pelada.
                </p>
              </div>
              <button onClick={() => setOpen(false)} disabled={loading} aria-label="Fechar" className="rounded-full p-2 text-muted hover:bg-surface-hover">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label htmlFor="payment-pix" className="mt-5 block text-xs font-bold uppercase tracking-wider text-muted">Chave PIX</label>
            <input
              id="payment-pix"
              value={pix}
              onChange={(event) => setPix(event.target.value)}
              placeholder="CPF, telefone, e-mail ou chave aleatoria"
              maxLength={200}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-accent"
            />

            <label htmlFor="payment-total" className="mt-4 block text-xs font-bold uppercase tracking-wider text-muted">Valor total da pelada</label>
            <div className="relative mt-2">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">R$</span>
              <input
                id="payment-total"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={paymentTotal}
                onChange={(event) => setPaymentTotal(event.target.value)}
                placeholder="0,00"
                className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-4 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>

            {error && <p role="alert" className="mt-3 rounded-lg bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={() => setOpen(false)} disabled={loading} className="rounded-xl border border-border py-3 text-sm font-bold text-foreground disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleFinish} disabled={loading} className="rounded-xl bg-danger py-3 text-sm font-bold text-white disabled:opacity-50">
                {loading ? "Encerrando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
