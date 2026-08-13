"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2, Clock, Copy, Loader2, LogIn, Shield, UserPlus, X } from "@/components/icons";
import { adminAddCallupPlayer, adminRemoveCallupPlayer, joinActiveCallup, leaveActiveCallup, type CallupWithEntries } from "@/lib/actions/callups";
import type { Player } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { StadiumLink } from "./StadiumLink";

type Props = {
  callup: CallupWithEntries;
  currentPlayerId: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  selectablePlayers: Player[];
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
};

export function CallupBoard({ callup, currentPlayerId, isAuthenticated, isAdmin, selectablePlayers, stadiumName, stadiumMapUrl }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const confirmed = callup.entries.filter((entry) => entry.status === "confirmed");
  const waitlist = callup.entries.filter((entry) => entry.status === "waitlist");
  const capacity = callup.capacity;
  const waitlistCapacity = callup.waitlist_capacity;
  const myEntry = callup.entries.find((entry) => entry.player_id === currentPlayerId);
  const availableToAdmin = selectablePlayers.filter((player) => !callup.entries.some((entry) => entry.player_id === player.id));

  async function run(key: string, action: () => Promise<{ success: boolean; error?: string }>) {
    setLoading(key);
    setError("");
    const result = await action();
    if (!result.success) setError(result.error || "Nao foi possivel atualizar a lista.");
    else router.refresh();
    setLoading("");
  }

  async function copyInvite() {
    const type = callup.round_type === "friendly" ? "amistoso" : "pelada oficial";
    const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${callup.date}T12:00:00`));
    const text = `⚽ Convocação aberta para ${type} em ${date}!\n\nConfirme sua presença: ${window.location.origin}/convocacao`;
    await navigator.clipboard.writeText(text);
    setLoading("copied");
    setTimeout(() => setLoading(""), 1600);
  }

  function EntryRow({ entry, position }: { entry: CallupWithEntries["entries"][number]; position: number }) {
    return (
      <div className="relative flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background/45 p-2 pr-8">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface text-[10px] font-black text-muted">{position}</span>
        <PlayerAvatar name={entry.player.name} avatarUrl={entry.player.avatar_url} className="h-8 w-8 shrink-0 rounded-full bg-surface text-[9px] font-black text-muted" />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[11px] font-black leading-3.5 text-foreground">{entry.player.name}</p>
          {entry.player.member_category === "guest" && <span className="text-[7px] font-black uppercase text-warning">Convidado</span>}
        </div>
        {isAdmin && callup.status === "open" && (
          <button onClick={() => run(`remove-${entry.id}`, () => adminRemoveCallupPlayer(callup.id, entry.player_id))} disabled={!!loading} className="absolute right-1 top-1 rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`Remover ${entry.player.name}`}>
            {loading === `remove-${entry.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          </button>
        )}
      </div>
    );
  }

  function EmptySlots({ start, total, label }: { start: number; total: number; label: string }) {
    if (total <= 0) return null;
    return (
      <div className="contents">
        {Array.from({ length: total }, (_, index) => (
          <div key={start + index} className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl border border-dashed border-border bg-background/20 px-2 py-2 text-[9px] text-muted">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface/60 font-black text-foreground/60">{start + index}</span>
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 overflow-x-clip pb-3">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 via-surface to-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[9px] font-black uppercase text-background">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-background" /> Convocação aberta
            </div>
            <h1 className="text-2xl font-black text-foreground">{callup.round_type === "friendly" ? "Amistoso" : "Rodada oficial"}</h1>
            <p className="mt-1 flex min-w-0 items-start gap-1.5 text-sm leading-5 text-muted"><Calendar className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date(`${callup.date}T12:00:00`))}</span></p>
          </div>
          <button onClick={copyInvite} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent" aria-label="Copiar convite">
            {loading === "copied" ? <CheckCircle2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>
        <div className="mt-5 grid min-w-0 grid-cols-2 gap-2.5">
          <div className="min-w-0 rounded-xl border border-border bg-background/40 p-3"><p className="text-2xl font-black text-accent">{confirmed.length}/{capacity}</p><p className="truncate text-[9px] font-bold uppercase text-muted">Confirmados</p></div>
          <div className="min-w-0 rounded-xl border border-border bg-background/40 p-3"><p className="text-2xl font-black text-warning">{waitlist.length}/{waitlistCapacity}</p><p className="truncate text-[9px] font-bold uppercase text-muted">Na fila</p></div>
        </div>
      </section>

      <StadiumLink name={stadiumName} mapUrl={stadiumMapUrl} />

      {error && <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-xs font-bold text-danger">{error}</div>}

      {callup.status === "locked" ? (
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-4 text-sm font-bold text-warning">Lista fechada pelo ADM. Os times estão sendo montados.</div>
      ) : !isAuthenticated ? (
        <Link href="/login?next=/convocacao" className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-black text-background"><LogIn className="h-5 w-5" /> Entrar para confirmar presença</Link>
      ) : myEntry ? (
        <button onClick={() => run("leave", () => leaveActiveCallup(callup.id))} disabled={!!loading} className="w-full rounded-xl border border-danger/35 py-3.5 text-sm font-black text-danger disabled:opacity-50">
          {loading === "leave" ? "Saindo..." : myEntry.status === "confirmed" ? "Desistir da vaga" : "Sair da fila"}
        </button>
      ) : currentPlayerId ? (
        <button onClick={() => run("join", () => joinActiveCallup(callup.id))} disabled={!!loading} className="w-full rounded-xl bg-accent py-3.5 text-sm font-black text-background disabled:opacity-50">
          {loading === "join" ? "Confirmando..." : confirmed.length < capacity ? "Confirmar presença" : "Entrar na fila"}
        </button>
      ) : (
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-4 text-xs font-bold text-warning">Sua conta ainda não está vinculada a um jogador selecionável.</div>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1"><h2 className="text-xs font-black uppercase tracking-wider text-muted">Relacionados</h2><CheckCircle2 className="h-4 w-4 text-accent" /></div>
        <div className="glass-card grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {confirmed.map((entry, index) => <EntryRow key={entry.id} entry={entry} position={index + 1} />)}
          <EmptySlots start={confirmed.length + 1} total={capacity - confirmed.length} label="Livre" />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1"><h2 className="text-xs font-black uppercase tracking-wider text-muted">Banco de espera</h2><Clock className="h-4 w-4 text-warning" /></div>
        <div className="glass-card grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {waitlist.map((entry, index) => <EntryRow key={entry.id} entry={entry} position={index + 1} />)}
          <EmptySlots start={waitlist.length + 1} total={waitlistCapacity - waitlist.length} label="Livre" />
        </div>
      </section>

      {isAdmin && callup.status === "open" && (
        <section className="glass-card p-4">
          <div className="mb-3 flex items-center gap-2"><Shield className="h-4 w-4 text-accent" /><h2 className="text-sm font-black text-foreground">Gestão do ADM</h2></div>
          <div className="flex gap-2">
            <select id="admin-callup-player" defaultValue="" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-3 text-xs text-foreground">
              <option value="" disabled>Adicionar jogador ou convidado</option>
              {availableToAdmin.map((player) => <option key={player.id} value={player.id}>{player.name}{player.member_category === "guest" ? " (convidado)" : ""}</option>)}
            </select>
            <button onClick={() => { const select = document.getElementById("admin-callup-player") as HTMLSelectElement; if (select?.value) run("add", () => adminAddCallupPlayer(callup.id, select.value)); }} disabled={!!loading} className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-background"><UserPlus className="h-5 w-5" /></button>
          </div>
        </section>
      )}
    </div>
  );
}
