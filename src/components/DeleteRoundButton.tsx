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
      <div role="dialog" aria-modal="true" aria-label="Excluir rodada" className="mobile-dialog-panel max-w-md rounded-3xl border border-danger/30 bg-background p-5 shadow-2xl animate-fade-in-up">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black text-foreground">Excluir {round.round_type === "friendly" ? "Amistoso" : "Rodada"} {String(round.number).padStart(2, "0")}?</h2><p className="mt-1 text-xs text-muted">{round.date} · {round.playersCount} jogadores · {round.matchesCount} partidas</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-full bg-surface p-2 text-muted"><X className="h-4 w-4" /></button></div>
        <p className="mt-4 rounded-xl bg-danger/10 p-3 text-xs font-semibold leading-relaxed text-danger">Placares, gols, assistencias, estatisticas, pagamentos, auditoria, dados fisicos e premios desta rodada serao removidos definitivamente.</p>
        <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-muted">Digite EXCLUIR<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold text-foreground outline-none focus:border-danger" /></label>
        {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-border py-3 text-sm font-bold text-foreground">Cancelar</button><button type="button" disabled={loading || confirmation !== "EXCLUIR"} onClick={handleDelete} className="rounded-xl bg-danger py-3 text-sm font-black text-white disabled:opacity-40">{loading ? "Excluindo..." : "Apagar tudo"}</button></div>
      </div>
    </div>}
  </>;
}
