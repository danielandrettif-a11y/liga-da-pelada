"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, CheckCircle2, Copy, LockKeyhole } from "lucide-react";
import { setPlayerPayment, type PaymentPlayer, type PaymentRound } from "@/lib/actions/payments";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function PaymentChecklist({
  round,
  initialPlayers,
  canEdit,
}: {
  round: PaymentRound;
  initialPlayers: PaymentPlayer[];
  canEdit: boolean;
}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [showCompletedList, setShowCompletedList] = useState(false);
  const paidCount = useMemo(() => players.filter((player) => player.paid).length, [players]);
  const allPaid = players.length > 0 && paidCount === players.length;
  const total = Number(round.payment_total) || 0;
  const perPlayer = players.length > 0 ? total / players.length : 0;

  async function copyPix() {
    if (!round.payment_pix) return;
    const text = `Pagamento da pelada - Rodada ${round.number}\nValor por pessoa: ${currency.format(perPlayer)}\nPIX: ${round.payment_pix}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function togglePayment(playerId: string, paid: boolean) {
    if (!canEdit) return;
    const previous = players;
    setPlayers((current) => current.map((player) => player.id === playerId ? { ...player, paid } : player));
    setSavingId(playerId);
    setError("");
    const result = await setPlayerPayment(round.id, playerId, paid);
    if (!result.success) {
      setPlayers(previous);
      setError(result.error || "Não foi possível atualizar o pagamento.");
    }
    setSavingId(null);
  }

  if (allPaid && !showCompletedList) {
    return (
      <div className="glass-card flex min-h-72 flex-col items-center justify-center p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/15">
          <CheckCircle2 className="h-11 w-11 text-accent" />
        </div>
        <h2 className="mt-5 text-xl font-black text-foreground">Todo mundo pagou!</h2>
        <p className="mt-2 text-sm text-muted">Contas fechadas. Agora é só aguardar a próxima pelada.</p>
        {canEdit && (
          <button onClick={() => setShowCompletedList(true)} className="mt-5 text-xs font-bold text-muted underline hover:text-accent">
            Corrigir algum pagamento
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
        <div className="grid grid-cols-2 gap-3 border-b border-accent/20 pb-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted">Valor total</p>
            <p className="mt-1 text-lg font-black text-foreground">{currency.format(total)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-accent">Por pessoa</p>
            <p className="mt-1 text-lg font-black text-accent">{currency.format(perPlayer)}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-accent">PIX para pagamento</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="min-w-0 flex-1 break-all text-sm font-bold text-foreground">{round.payment_pix}</p>
          <button onClick={copyPix} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-black text-background">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-black text-foreground">Quem já pagou</h2>
          <p className="text-[11px] text-muted">{paidCount} de {players.length} pagamentos confirmados</p>
        </div>
        {!canEdit && (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-muted"><LockKeyhole className="h-3 w-3" /> Somente leitura</span>
        )}
      </div>

      {!canEdit && (
        <Link href="/login" className="block rounded-xl border border-accent/30 bg-accent/10 p-3 text-center text-xs font-bold text-accent">
          Entre na sua conta para marcar os pagamentos
        </Link>
      )}
      {error && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}

      <div className="glass-card overflow-hidden">
        {players.map((player, index) => (
          <label key={player.id} className={`flex items-center gap-3 p-3 ${index < players.length - 1 ? "border-b border-border" : ""} ${canEdit ? "cursor-pointer hover:bg-surface-hover" : ""}`}>
            <input
              type="checkbox"
              checked={player.paid}
              disabled={!canEdit || savingId === player.id}
              onChange={(event) => togglePayment(player.id, event.target.checked)}
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
            <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="h-10 w-10 shrink-0 rounded-full border border-border bg-surface-hover text-xs font-bold text-muted" />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-bold ${player.paid ? "text-accent" : "text-foreground"}`}>{player.name}</p>
              <PlayerProfileBadge profile={player.player_profile} />
            </div>
            <span className={`text-[10px] font-black uppercase ${player.paid ? "text-accent" : "text-muted"}`}>{player.paid ? "Pago" : "Pendente"}</span>
          </label>
        ))}
        {players.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum jogador nesta rodada.</p>}
      </div>
    </div>
  );
}
