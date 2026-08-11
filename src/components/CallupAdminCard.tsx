"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, CheckCircle2, ChevronRight, Copy, Lock, X } from "@/components/icons";
import { closeCallup, lockCallupForRound, openCallup, type CallupWithEntries } from "@/lib/actions/callups";

export function CallupAdminCard({
  callup,
  playersPerTeam = 5,
  teamsPerRound = 3,
}: {
  callup: CallupWithEntries | null;
  playersPerTeam?: number;
  teamsPerRound?: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const confirmed = callup?.entries.filter((entry) => entry.status === "confirmed").length || 0;
  const capacity = callup?.capacity || playersPerTeam * teamsPerRound;
  const waitlistCapacity = callup?.waitlist_capacity ?? 3;

  async function create(formData: FormData) {
    setLoading(true); setError("");
    const result = await openCallup(formData);
    if (!result.success) setError(result.error || "Erro ao abrir convocação.");
    else router.refresh();
    setLoading(false);
  }

  async function close() {
    if (!callup || !confirm("Fechar esta convocação? A lista deixará de aparecer para todos.")) return;
    setLoading(true);
    const result = await closeCallup(callup.id);
    if (!result.success) setError(result.error || "Erro ao fechar convocação."); else router.refresh();
    setLoading(false);
  }

  async function buildRound() {
    if (!callup) return;
    setLoading(true); setError("");
    const result = await lockCallupForRound(callup.id);
    if (!result.success) { setError(result.error || "Erro ao bloquear lista."); setLoading(false); return; }
    router.push(`/admin/rodada?callup=${callup.id}`);
  }

  async function copy() {
    if (!callup) return;
    await navigator.clipboard.writeText(`⚽ Confirme sua presença na próxima pelada:\n${window.location.origin}/convocacao`);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">Convocação</h2>
      <div className="glass-card p-4">
        {error && <div className="mb-3 rounded-lg bg-danger/10 p-3 text-xs font-bold text-danger">{error}</div>}
        {!callup ? (
          <form action={create} className="space-y-3">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10"><CalendarPlus className="h-5 w-5 text-accent" /></div><div><p className="text-sm font-black text-foreground">Abrir convocação</p><p className="text-xs text-muted">{capacity} vagas e {waitlistCapacity} na fila</p></div></div>
            <input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground" />
            <select name="round_type" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground"><option value="official">Oficial (Ranked)</option><option value="friendly">Amistoso</option></select>
            <button disabled={loading} className="w-full rounded-xl bg-accent py-3 text-sm font-black text-background disabled:opacity-50">{loading ? "Abrindo..." : "Abrir convocação"}</button>
          </form>
        ) : (
          <div className="space-y-3">
            <Link href="/convocacao" className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10"><CheckCircle2 className="h-5 w-5 text-accent" /></div><div className="min-w-0 flex-1"><p className="text-sm font-black text-foreground">{callup.round_type === "friendly" ? "Amistoso" : "Rodada oficial"} · {confirmed}/{capacity}</p><p className="text-xs text-muted">{new Intl.DateTimeFormat("pt-BR").format(new Date(`${callup.date}T12:00:00`))} · {callup.status === "locked" ? "Lista bloqueada" : "Recebendo nomes"}</p></div><ChevronRight className="h-4 w-4 text-muted" /></Link>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={copy} className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-bold text-foreground">{copied ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}{copied ? "Copiado" : "Copiar convite"}</button>
              <button type="button" onClick={close} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border border-danger/30 py-2.5 text-xs font-bold text-danger"><X className="h-4 w-4" /> Fechar</button>
            </div>
            <button type="button" onClick={buildRound} disabled={loading || confirmed !== capacity} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-black text-background disabled:opacity-40"><Lock className="h-4 w-4" /> Montar rodada com os {capacity}</button>
          </div>
        )}
      </div>
    </section>
  );
}
