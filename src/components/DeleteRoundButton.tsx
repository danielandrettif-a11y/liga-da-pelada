"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "@/components/icons";
import { deleteRound } from "@/lib/actions/rounds";
import { useDialogViewport } from "@/lib/useDialogViewport";

export function DeleteRoundButton({ round, redirectTo }: { round: { id: string; number: number; round_type: string; date: string; playersCount: number; matchesCount: number }; redirectTo?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useDialogViewport(open);

  async function handleDelete() {
    setLoading(true);
    setError("");
    const result = await deleteRound(round.id, confirmation);
    if (!result.success) {
      setError(result.error || "Nao foi possivel excluir a rodada.");
      setLoading(false);
      return;
    }
    setOpen(false);
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return <>
    <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); }} className="rounded-xl border border-danger/25 p-2.5 text-danger transition-colors hover:bg-danger/10" aria-label="Excluir rodada"><Trash2 className="h-4 w-4" /></button>
    {open && <div className="mobile-dialog-backdrop bg-black/75 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !loading && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Excluir rodada" className="mobile-dialog-panel flex max-w-md flex-col rounded-3xl border border-danger/30 bg-background shadow-2xl animate-fade-in-up">
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border p-3 sm:p-5"><div className="min-w-0"><h2 className="text-sm font-black leading-tight text-foreground sm:text-lg">Excluir {round.round_type === "friendly" ? "Amistoso" : "Rodada"} {String(round.number).padStart(2, "0")}?</h2><p className="mt-1 break-words text-[10px] leading-3.5 text-muted">{round.date} · {round.playersCount} jogadores · {round.matchesCount} partidas</p></div><button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-full bg-surface p-2 text-muted"><X className="h-4 w-4" /></button></div>
        <div className="mobile-dialog-scroll flex-1 space-y-2.5 p-3 sm:space-y-3 sm:p-5"><p className="rounded-xl bg-danger/10 p-2.5 text-[10px] font-semibold leading-4 text-danger sm:p-3 sm:text-xs sm:leading-5">Todos os dados desta rodada serão removidos definitivamente: placares, scouts, pagamentos e prêmios.</p>
        {round.round_type !== "friendly" && <p className="rounded-xl border border-warning/25 bg-warning/10 p-2.5 text-[10px] font-semibold leading-4 text-warning sm:p-3 sm:text-xs sm:leading-5">O Cartola será restaurado e cartas apenas reservadas voltarão ao inventário.</p>}
        <label className="block text-[10px] font-black uppercase tracking-wider text-muted">Digite EXCLUIR<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="EXCLUIR" className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold text-foreground outline-none focus:border-danger placeholder:text-muted/40" /></label>
        {error && <p className="break-words text-xs font-semibold text-danger">{error}</p>}</div>
        <div className="mobile-dialog-footer grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-background p-3 sm:gap-3 sm:p-4"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-border px-2 py-2.5 text-xs font-bold text-foreground sm:py-3 sm:text-sm">Cancelar</button><button type="button" disabled={loading || confirmation.trim().toUpperCase() !== "EXCLUIR"} onClick={handleDelete} className="rounded-xl bg-danger px-2 py-2.5 text-xs font-black text-white disabled:opacity-40 sm:py-3 sm:text-sm">{loading ? "Excluindo..." : "Apagar tudo"}</button></div>
      </div>
    </div>}
  </>;
}
