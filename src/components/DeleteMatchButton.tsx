"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "@/components/icons";
import { deleteMatch } from "@/lib/actions/matches";
import { useDialogViewport } from "@/lib/useDialogViewport";

export function DeleteMatchButton({ matchId, matchNumber }: { matchId: string; matchNumber: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  useDialogViewport(open);

  const confirmDelete = () => {
    startTransition(async () => {
      setError(null);
      const result = await deleteMatch(matchId);
      if (!result.success) {
        setError(result.error || "Não foi possível apagar a partida.");
        return;
      }
      setOpen(false);
      router.refresh();
      if (result.warning) window.setTimeout(() => window.alert(result.warning), 0);
    });
  };

  return <>
    <button
      type="button"
      onClick={() => { setError(null); setOpen(true); }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-danger/25 bg-danger/10 text-danger transition-colors hover:bg-danger/20"
      aria-label={`Apagar partida ${matchNumber}`}
    >
      <Trash2 className="h-4 w-4" />
    </button>

    {open && (
      <div className="mobile-dialog-backdrop z-[99999] bg-black/85 p-4 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="delete-match-title" onMouseDown={(event) => event.target === event.currentTarget && !isPending && setOpen(false)}>
        <div className="w-full max-w-sm rounded-3xl border border-danger/30 bg-surface p-5 shadow-2xl animate-slide-up">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-danger">Excluir partida</p>
              <h2 id="delete-match-title" className="mt-1 text-lg font-black text-foreground">Apagar a partida {String(matchNumber).padStart(2, "0")}?</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="rounded-full p-1 text-muted hover:bg-surface-hover hover:text-foreground" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm leading-relaxed text-muted">Gols, assistências e escalações desta partida serão removidos. As estatísticas da rodada e do Cartola serão recalculadas.</p>
          {error && <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-bold text-danger">{error}</p>}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="rounded-xl border border-border px-3 py-3 text-xs font-black uppercase tracking-wide text-muted transition-colors hover:bg-surface-hover">Não, manter</button>
            <button type="button" onClick={confirmDelete} disabled={isPending} className="rounded-xl bg-danger px-3 py-3 text-xs font-black uppercase tracking-wide text-white transition-opacity disabled:opacity-60">{isPending ? "Apagando..." : "Sim, apagar"}</button>
          </div>
        </div>
      </div>
    )}
  </>;
}
