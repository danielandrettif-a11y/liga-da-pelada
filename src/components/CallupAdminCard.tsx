"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, CheckCircle2, ChevronRight, Clock, Copy, Lock, MapPin, Stadium as StadiumIcon, X } from "@/components/icons";
import { closeCallup, openCallup, type CallupWithEntries } from "@/lib/actions/callups";
import type { Stadium } from "@/lib/types";

export function CallupAdminCard({
  callup,
  stadiums = [],
  playersPerTeam = 5,
  teamsPerRound = 3,
}: {
  callup: CallupWithEntries | null;
  stadiums?: Stadium[];
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
    setLoading(true);
    setError("");
    const result = await openCallup(formData);
    if (!result.success) setError(result.error || "Erro ao abrir convocação.");
    else router.refresh();
    setLoading(false);
  }

  async function close() {
    if (!callup || !confirm("Fechar esta convocação? A lista deixará de aparecer para todos.")) return;
    setLoading(true);
    const result = await closeCallup(callup.id);
    if (!result.success) setError(result.error || "Erro ao fechar convocação.");
    else router.refresh();
    setLoading(false);
  }

  async function buildRound() {
    if (!callup) return;
    router.push(callup.round_id ? `/admin/rodada?round=${callup.round_id}&mount=1` : `/admin/rodada?callup=${callup.id}`);
  }

  async function copy() {
    if (!callup) return;
    const type = callup.round_type === "friendly" ? "Amistoso" : "Pelada Oficial (Ranked)";
    const dateFormatted = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })
      .format(new Date(`${callup.date}T12:00:00`));
    const time = callup.start_time ? callup.start_time.slice(0, 5) : "08:00";
    const venueText = callup.stadium_name ? `\n📍 Local: ${callup.stadium_name}` : "";
    const mapText = callup.stadium_map_url ? `\n🗺️ Como chegar: ${callup.stadium_map_url}` : "";

    const text = `⚽ Convocação aberta para ${type}!\n📅 Data: ${dateFormatted}\n⏰ Horário: ${time}${venueText}${mapText}\n\n👉 Confirme sua presença: ${window.location.origin}/convocacao`;

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">Convocação</h2>
      <div className="glass-card min-w-0 overflow-hidden p-4">
        {error && <div className="mb-3 rounded-lg bg-danger/10 p-3 text-xs font-bold text-danger">{error}</div>}
        {!callup ? (
          <form action={create} className="min-w-0 space-y-3 overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <CalendarPlus className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">Abrir convocação</p>
                <p className="text-xs text-muted">{capacity} vagas e {waitlistCapacity} na fila</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="w-full min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Data</label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground [appearance:none]"
                />
              </div>

              <div className="w-full min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Horário da pelada</label>
                <input
                  type="time"
                  name="start_time"
                  required
                  defaultValue="08:00"
                  className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground [appearance:none]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Campo / Estádio</label>
              <select
                name="stadium_id"
                defaultValue={stadiums[0]?.id || ""}
                className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground"
              >
                {stadiums.length > 0 ? (
                  stadiums.map((stadium) => (
                    <option key={stadium.id} value={stadium.id}>
                      {stadium.name} {stadium.address ? `(${stadium.address})` : ""}
                    </option>
                  ))
                ) : (
                  <option value="">Estádio Padrão da Liga</option>
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label className="mb-1 block text-[10px] font-bold uppercase text-muted">Tipo de Rodada</label>
              <select
                name="round_type"
                className="block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground"
              >
                <option value="official">Oficial (Ranked)</option>
                <option value="friendly">Amistoso</option>
              </select>
            </div>

            <button
              disabled={loading}
              className="w-full rounded-xl bg-accent py-3 text-sm font-black text-background transition-transform active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? "Abrindo..." : "Abrir convocação"}
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <Link href="/convocacao" className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                <CheckCircle2 className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-foreground">
                  {callup.round_type === "friendly" ? "Amistoso" : "Rodada oficial"} · {confirmed}/{capacity}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Clock className="h-3.5 w-3.5 text-accent shrink-0" />
                  <span>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${callup.date}T12:00:00`))} às {callup.start_time?.slice(0, 5) || "08:00"}</span>
                  {callup.stadium_name && <span>· {callup.stadium_name}</span>}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted shrink-0" />
            </Link>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-bold text-foreground hover:bg-surface-hover"
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado p/ WhatsApp!" : "Copiar convite"}
              </button>
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border border-danger/30 py-2.5 text-xs font-bold text-danger hover:bg-danger/10"
              >
                <X className="h-4 w-4" /> Fechar
              </button>
            </div>

            <button
              type="button"
              onClick={buildRound}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-black text-background disabled:opacity-40"
            >
              <Lock className="h-4 w-4" />
              {callup.round_id ? "Retomar pré-lista" : `Criar pré-lista (${confirmed}/${capacity})`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
