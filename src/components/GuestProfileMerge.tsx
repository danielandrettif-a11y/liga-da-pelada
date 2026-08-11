"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Loader2 } from "@/components/icons";
import type { Player } from "@/lib/types";
import { mergeGuestWithRegistered } from "@/lib/actions/registrations";
import { PlayerAvatar } from "./PlayerAvatar";

export function GuestProfileMerge({ guest, candidates }: { guest: Player; candidates: Player[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => candidates.find((candidate) => candidate.id === selectedId), [candidates, selectedId]);

  async function merge() {
    if (!selected) return;
    const confirmed = window.confirm(`Unir o convidado ${guest.name} com a conta de ${selected.name}? O perfil automático será removido e esta ação não pode ser desfeita.`);
    if (!confirmed) return;
    setLoading(true);
    setError("");
    const result = await mergeGuestWithRegistered(guest.id, selected.id);
    if (!result.success) {
      setError(result.error || "Não foi possível unir os perfis.");
      setLoading(false);
      return;
    }
    router.push(`/admin/jogadores/${guest.id}/editar`);
    router.refresh();
  }

  return (
    <section className="glass-card space-y-4 border-warning/25 p-5">
      <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10"><ArrowLeftRight className="h-5 w-5 text-warning" /></div><div><h2 className="text-sm font-black text-foreground">Unir com conta cadastrada</h2><p className="mt-1 text-xs leading-5 text-muted">Transfere o login e consolida todo o histórico no perfil deste convidado.</p></div></div>
      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-warning">
        <option value="">Escolha a conta oficial</option>
        {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
      {selected && <div className="flex items-center gap-3 rounded-xl border border-border bg-background/45 p-3"><PlayerAvatar name={selected.name} avatarUrl={selected.avatar_url} className="h-11 w-11 rounded-full bg-surface text-xs font-black text-muted" /><div className="min-w-0"><p className="truncate text-sm font-black text-foreground">{selected.name}</p><p className="text-[10px] text-muted">Conta cadastrada · perfil que será removido após a união</p></div></div>}
      {error && <p className="rounded-lg bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}
      <button type="button" onClick={merge} disabled={!selected || loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-warning py-3.5 text-sm font-black text-background disabled:opacity-40">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? "Unindo perfis..." : "Confirmar união"}</button>
      {candidates.length === 0 && <p className="text-center text-[10px] text-muted">Nenhuma conta oficial disponível para união.</p>}
    </section>
  );
}
