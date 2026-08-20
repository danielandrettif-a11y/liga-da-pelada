"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Search, Sparkles } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import type { ManagedAccount } from "@/lib/actions/admins";
import { grantFantasyPackToUser } from "@/lib/actions/fantasy-cards";

export function FantasyPackGiftManager({ accounts }: { accounts: ManagedAccount[] }) {
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const filtered = useMemo(() => accounts.filter((account) =>
    (account.player?.name || "Conta sem jogador").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))), [accounts, query]);

  function submit() {
    setMessage("");
    startTransition(async () => {
      const result = await grantFantasyPackToUser(selectedUserId);
      setMessage(result.success ? "Pacote enviado! Ele já aparece no Cartola da pessoa." : result.error || "Não foi possível enviar.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pessoa" className="h-12 w-full rounded-2xl border border-border bg-surface pl-10 pr-4 text-sm text-foreground outline-none focus:border-accent" />
      </div>

      <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
        {filtered.map((account) => {
          const selected = selectedUserId === account.userId;
          const name = account.player?.name || "Conta sem jogador vinculado";
          return (
            <button key={account.userId} type="button" onClick={() => setSelectedUserId(account.userId)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${selected ? "border-accent bg-accent/10" : "border-border bg-surface hover:bg-surface-hover"}`}>
              <PlayerAvatar name={name} avatarUrl={account.player?.avatarUrl} className="h-11 w-11 rounded-full border border-white/10 bg-background text-xs font-black text-accent" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-foreground">{name}</span><span className="text-[10px] uppercase tracking-wider text-muted">{account.role === "admin" ? "Administrador" : "Jogador"}</span></span>
              {selected && <CheckCircle2 className="h-5 w-5 text-accent" />}
            </button>
          );
        })}
      </div>

      {message && <p className={`rounded-xl border p-3 text-xs font-bold ${message.startsWith("Pacote enviado") ? "border-accent/30 bg-accent/10 text-accent" : "border-danger/30 bg-danger/10 text-danger"}`}>{message}</p>}

      <button type="button" disabled={!selectedUserId || pending} onClick={submit} className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-black uppercase text-background disabled:opacity-40">
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} Enviar pacote
      </button>
    </div>
  );
}
