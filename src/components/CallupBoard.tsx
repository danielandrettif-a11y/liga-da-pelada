"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2, Clock, Copy, Loader2, LogIn, Shield, UserPlus, X } from "@/components/icons";
import { adminAddCallupPlayer, adminRemoveCallupPlayer, joinActiveCallup, leaveActiveCallup, type CallupWithEntries } from "@/lib/actions/callups";
import type { Player } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";

type Props = {
  callup: CallupWithEntries;
  currentPlayerId: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  selectablePlayers: Player[];
};

export function CallupBoard({ callup, currentPlayerId, isAuthenticated, isAdmin, selectablePlayers }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const confirmed = callup.entries.filter((entry) => entry.status === "confirmed");
  const waitlist = callup.entries.filter((entry) => entry.status === "waitlist");
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
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/45 px-3 py-2.5">
        <span className="w-6 text-center text-xs font-black text-muted">{position}</span>
        <PlayerAvatar name={entry.player.name} avatarUrl={entry.player.avatar_url} className="h-9 w-9 rounded-full bg-surface text-xs font-black text-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{entry.player.name}</p>
          {entry.player.member_category === "guest" && <span className="text-[9px] font-black uppercase text-warning">Convidado</span>}
        </div>
        {isAdmin && callup.status === "open" && (
          <button onClick={() => run(`remove-${entry.id}`, () => adminRemoveCallupPlayer(callup.id, entry.player_id))} disabled={!!loading} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`Remover ${entry.player.name}`}>
            {loading === `remove-${entry.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 via-surface to-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[9px] font-black uppercase text-background">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-background" /> Convocação aberta
            </div>
            <h1 className="text-2xl font-black text-foreground">{callup.round_type === "friendly" ? "Amistoso" : "Rodada oficial"}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><Calendar className="h-4 w-4 text-accent" /> {new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date(`${callup.date}T12:00:00`))}</p>
          </div>
          <button onClick={copyInvite} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent" aria-label="Copiar convite">
            {loading === "copied" ? <CheckCircle2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-background/40 p-3"><p className="text-2xl font-black text-accent">{confirmed.length}/15</p><p className="text-[10px] font-bold uppercase text-muted">Confirmados</p></div>
          <div className="rounded-xl border border-border bg-background/40 p-3"><p className="text-2xl font-black text-warning">{waitlist.length}/3</p><p className="text-[10px] font-bold uppercase text-muted">Na fila</p></div>
        </div>
      </section>

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
          {loading === "join" ? "Confirmando..." : confirmed.length < 15 ? "Confirmar presença" : "Entrar na fila"}
        </button>
      ) : (
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-4 text-xs font-bold text-warning">Sua conta ainda não está vinculada a um jogador selecionável.</div>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1"><h2 className="text-xs font-black uppercase tracking-wider text-muted">Relacionados</h2><CheckCircle2 className="h-4 w-4 text-accent" /></div>
        <div className="glass-card space-y-2 p-3">
          {Array.from({ length: 15 }, (_, index) => confirmed[index]
            ? <EntryRow key={confirmed[index].id} entry={confirmed[index]} position={index + 1} />
            : <div key={index} className="flex h-[58px] items-center gap-3 rounded-xl border border-dashed border-border px-3 text-xs text-muted"><span className="w-6 text-center font-black">{index + 1}</span><span>Vaga disponível</span></div>)}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1"><h2 className="text-xs font-black uppercase tracking-wider text-muted">Banco de espera</h2><Clock className="h-4 w-4 text-warning" /></div>
        <div className="glass-card space-y-2 p-3">
          {Array.from({ length: 3 }, (_, index) => waitlist[index]
            ? <EntryRow key={waitlist[index].id} entry={waitlist[index]} position={index + 1} />
            : <div key={index} className="flex h-[58px] items-center gap-3 rounded-xl border border-dashed border-border px-3 text-xs text-muted"><span className="w-6 text-center font-black">{index + 1}</span><span>Fila livre</span></div>)}
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

