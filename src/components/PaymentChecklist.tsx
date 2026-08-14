"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Copy, LockKeyhole, PencilLine, X } from "@/components/icons";
import { setPlayerPayment, updateRoundPaymentDetails, type PaymentPlayer, type PaymentRound } from "@/lib/actions/payments";
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
  canManagePayment,
}: {
  round: PaymentRound;
  initialPlayers: PaymentPlayer[];
  canEdit: boolean;
  canManagePayment: boolean;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState(initialPlayers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [showCompletedList, setShowCompletedList] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState({ pix: round.payment_pix || "", total: Number(round.payment_total) || 0 });
  const [draftPix, setDraftPix] = useState(paymentDetails.pix);
  const [draftTotal, setDraftTotal] = useState(String(paymentDetails.total || ""));
  const [editingPayment, setEditingPayment] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const paidCount = useMemo(() => players.filter((player) => player.paid).length, [players]);
  const allPaid = players.length > 0 && paidCount === players.length;
  const total = paymentDetails.total;
  const perPlayer = players.length > 0 ? total / players.length : 0;

  async function copyPix() {
    if (!paymentDetails.pix) return;
    const text = `Pagamento da pelada - Rodada ${round.number}\nValor por pessoa: ${currency.format(perPlayer)}\nPIX: ${paymentDetails.pix}`;
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

  async function savePaymentDetails() {
    setSavingDetails(true);
    setError("");
    const parsedTotal = Number(draftTotal.replace(",", "."));
    const result = await updateRoundPaymentDetails(round.id, draftPix, parsedTotal);
    if (!result.success) {
      setError(result.error || "Nao foi possivel atualizar os dados do PIX.");
    } else {
      setPaymentDetails({ pix: draftPix.trim(), total: parsedTotal });
      setEditingPayment(false);
      router.refresh();
    }
    setSavingDetails(false);
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
    } else {
      router.refresh();
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
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button onClick={() => setShowCompletedList(true)} className="text-xs font-bold text-muted underline hover:text-accent">
              Corrigir algum pagamento
            </button>
            {canManagePayment && (
              <button onClick={() => { setShowCompletedList(true); setEditingPayment(true); }} className="text-xs font-bold text-accent underline">
                Editar PIX e valor
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
        {canManagePayment && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-accent">Dados de cobrança</p>
            <button type="button" onClick={() => setEditingPayment((current) => !current)} className="flex items-center gap-1.5 rounded-lg border border-accent/25 px-2.5 py-1.5 text-[9px] font-black uppercase text-accent">
              {editingPayment ? <X className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
              {editingPayment ? "Cancelar" : "Editar"}
            </button>
          </div>
        )}
        {editingPayment && canManagePayment && (
          <div className="mb-4 grid gap-3 rounded-xl border border-accent/20 bg-background/50 p-3">
            <label className="text-[9px] font-black uppercase tracking-wider text-muted">Chave PIX
              <input value={draftPix} onChange={(event) => setDraftPix(event.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold normal-case text-foreground outline-none focus:border-accent" />
            </label>
            <label className="text-[9px] font-black uppercase tracking-wider text-muted">Valor total
              <input type="number" min="0.01" step="0.01" inputMode="decimal" value={draftTotal} onChange={(event) => setDraftTotal(event.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold normal-case text-foreground outline-none focus:border-accent" />
            </label>
            <button type="button" onClick={savePaymentDetails} disabled={savingDetails || !draftPix.trim() || Number(draftTotal.replace(",", ".")) <= 0} className="rounded-xl bg-accent py-2.5 text-xs font-black text-background disabled:opacity-50">
              {savingDetails ? "Salvando..." : "Salvar PIX e valor"}
            </button>
          </div>
        )}
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
          <p className="min-w-0 flex-1 break-all text-sm font-bold text-foreground">{paymentDetails.pix}</p>
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
              <PlayerProfileBadge profile={player.player_profile} isGoalkeeper={player.is_goalkeeper} />
            </div>
            <span className={`text-[10px] font-black uppercase ${player.paid ? "text-accent" : "text-muted"}`}>{player.paid ? "Pago" : "Pendente"}</span>
          </label>
        ))}
        {players.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum jogador nesta rodada.</p>}
      </div>
    </div>
  );
}
