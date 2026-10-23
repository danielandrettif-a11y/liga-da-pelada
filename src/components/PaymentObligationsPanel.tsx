"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ClipboardList, Copy, LockKeyhole, PencilLine, Save, X } from "@/components/icons";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";
import { buildDetailedPaymentWhatsAppMessage } from "@/lib/payment-whatsapp";
import {
  setPaymentObligationPaid,
  syncRoundExpenseItems,
  type ExpenseItem,
  type PaymentChargeLine,
  type PaymentObligation,
  type PaymentPlayer,
  type PaymentRound,
  type RoundExpenseSelection,
} from "@/lib/actions/payments";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  initialObligations: PaymentObligation[];
  players: PaymentPlayer[];
  currentPlayerId: string | null;
  canManage: boolean;
  roundId: string;
  expenseItems: ExpenseItem[];
  initialExpenseSelections: RoundExpenseSelection[];
  chargeLines: PaymentChargeLine[];
  round: PaymentRound;
};

export function PaymentObligationsPanel({ initialObligations, players, currentPlayerId, canManage, roundId, expenseItems, initialExpenseSelections, chargeLines, round }: Props) {
  const router = useRouter();
  const [obligations, setObligations] = useState(initialObligations);
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const [showCompletedList, setShowCompletedList] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState(initialExpenseSelections.map((item) => item.expense_item_id));
  const [pending, startTransition] = useTransition();

  const rowsByPlayer = useMemo(() => {
    const map = new Map<string, PaymentObligation[]>();
    for (const obligation of obligations) map.set(obligation.player_id, [...(map.get(obligation.player_id) || []), obligation]);
    return map;
  }, [obligations]);
  const visiblePlayers = canManage ? players : players.filter((player) => player.id === currentPlayerId);
  const playerTotals = useMemo(() => new Map(visiblePlayers.map((player) => {
    const rows = rowsByPlayer.get(player.id) || [];
    return [player.id, {
      due: rows.reduce((sum, row) => sum + Number(row.amount_due || 0), 0),
      paid: rows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0),
      complete: rows.length > 0 && rows.every((row) => Number(row.amount_paid) >= Number(row.amount_due)),
    }];
  })), [rowsByPlayer, visiblePlayers]);
  const paidCount = visiblePlayers.filter((player) => playerTotals.get(player.id)?.complete).length;
  const allPaid = visiblePlayers.length > 0 && paidCount === visiblePlayers.length;
  const visibleObligations = canManage ? obligations : obligations.filter((row) => row.player_id === currentPlayerId);
  const totalDue = visibleObligations.reduce((sum, row) => sum + Number(row.amount_due || 0), 0);
  const currentTotal = currentPlayerId ? playerTotals.get(currentPlayerId)?.due : null;
  const recipients = [...new Map(visibleObligations.map((row) => [`${row.recipient_name}\u0000${row.recipient_pix}`, { name: row.recipient_name, pix: row.recipient_pix }])).values()];
  const selectedSet = new Set(selectedExpenseIds);
  const installmentByItem = new Map(initialExpenseSelections.map((item) => [item.expense_item_id, item.installment_number]));

  async function copyText(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1800);
  }

  function copyPaymentList() {
    return copyText(buildDetailedPaymentWhatsAppMessage({ round, players, obligations }), "list");
  }

  async function togglePlayer(playerId: string, paid: boolean) {
    const rows = rowsByPlayer.get(playerId) || [];
    if (!rows.length || (!canManage && playerId !== currentPlayerId)) return;
    const previous = obligations;
    setPendingPlayerId(playerId);
    setMessage("");
    setObligations((current) => current.map((row) => row.player_id === playerId ? {
      ...row,
      amount_paid: paid ? row.amount_due : 0,
      status: paid ? "paid" : "pending",
    } : row));
    const results = await Promise.all(rows.map((row) => setPaymentObligationPaid(row.id, paid ? row.amount_due : 0)));
    const failed = results.find((result) => !result.success);
    if (failed) {
      setObligations(previous);
      setMessage(failed.error || "Não foi possível atualizar o pagamento.");
    } else {
      setMessage(paid ? "Pagamento confirmado." : "Pagamento reaberto.");
      router.refresh();
    }
    setPendingPlayerId(null);
  }

  function toggleExpenseItem(id: string) {
    setSelectedExpenseIds((items) => items.includes(id) ? items.filter((itemId) => itemId !== id) : [...items, id]);
  }

  function saveExpensePlan() {
    startTransition(async () => {
      const result = await syncRoundExpenseItems(roundId, selectedExpenseIds);
      if (result.success) {
        setEditingItems(false);
        setMessage("Itens da caixinha atualizados nesta rodada.");
        router.refresh();
      } else setMessage(result.error || "Não foi possível atualizar os itens.");
    });
  }

  if (allPaid && !showCompletedList) {
    return <div className="glass-card flex min-h-72 flex-col items-center justify-center p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/15"><CheckCircle2 className="h-11 w-11 text-accent" /></div>
      <h2 className="mt-5 text-xl font-black text-foreground">Todo mundo pagou!</h2>
      <p className="mt-2 text-sm text-muted">Contas fechadas. Todos os pagamentos desta rodada foram confirmados.</p>
      <button onClick={() => setShowCompletedList(true)} className="mt-5 text-xs font-bold text-accent underline">Ver checklist e corrigir</button>
    </div>;
  }

  return <section className="space-y-4">
    <article className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[9px] font-black uppercase tracking-widest text-accent">Resumo da cobrança</p><p className="mt-1 text-lg font-black text-foreground">{currency.format(totalDue)}</p>{currentTotal != null && <p className="mt-1 text-[10px] font-bold text-muted">Seu total: <span className="text-accent">{currency.format(currentTotal)}</span></p>}</div>
        {canManage && <button type="button" onClick={copyPaymentList} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/35 bg-background/60 px-3 py-2 text-[10px] font-black text-accent">{copied === "list" ? <Check className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}{copied === "list" ? "Lista copiada" : "Copiar para WhatsApp"}</button>}
      </div>
      <div className="mt-3 space-y-2 border-t border-accent/20 pt-3">
        {recipients.map((recipient, index) => <div key={`${recipient.name}-${recipient.pix}`} className="flex items-center gap-2 rounded-xl bg-background/50 px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-black text-foreground">PIX de {recipient.name}</p><p className="truncate text-[10px] text-muted">{recipient.pix}</p></div><button type="button" onClick={() => copyText(recipient.pix, `pix-${index}`)} className="rounded-lg bg-accent p-2 text-background" aria-label={`Copiar PIX de ${recipient.name}`}>{copied === `pix-${index}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button></div>)}
      </div>
    </article>

    {canManage && <article className="rounded-2xl border border-border bg-surface p-3">
      <button type="button" onClick={() => setEditingItems((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left"><span><span className="block text-xs font-black text-foreground">Itens da caixinha</span><span className="mt-0.5 block text-[10px] text-muted">{selectedExpenseIds.length} item(ns) incluído(s) nesta rodada</span></span><span className="flex items-center gap-1 text-[10px] font-black text-accent">{editingItems ? <X className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}{editingItems ? "Fechar" : "Editar"}</span></button>
      {!editingItems && selectedExpenseIds.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{expenseItems.filter((item) => selectedSet.has(item.id)).map((item) => <span key={item.id} className="rounded-full border border-border bg-background px-2 py-1 text-[9px] font-bold text-muted">{item.name} · {installmentByItem.get(item.id) || item.paid_installments + 1}/{item.installment_count}</span>)}</div>}
      {editingItems && <div className="mt-3 space-y-2 border-t border-border pt-3">{expenseItems.map((item) => {
        const selected = selectedSet.has(item.id);
        const unavailable = !selected && item.status !== "active";
        return <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selected ? "border-accent/60 bg-accent/5" : "border-border bg-background/50"} ${unavailable ? "cursor-not-allowed opacity-50" : ""}`}><input type="checkbox" checked={selected} disabled={unavailable || pending} onChange={() => toggleExpenseItem(item.id)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" /><span className="min-w-0 flex-1"><span className="block text-sm font-black text-foreground">{item.name}</span><span className="mt-1 block text-[10px] text-muted">{currency.format(item.total_amount)} · parcela {installmentByItem.get(item.id) || item.paid_installments + 1}/{item.installment_count}</span></span></label>;
      })}{!expenseItems.length && <p className="rounded-xl border border-border bg-background/50 p-3 text-xs text-muted">Nenhum item cadastrado na caixinha.</p>}<button type="button" disabled={pending} onClick={saveExpensePlan} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-xs font-black text-background disabled:opacity-40"><Save className="h-4 w-4" /> Salvar itens</button></div>}
    </article>}

    <div className="flex items-end justify-between"><div><h2 className="text-sm font-black text-foreground">Quem já pagou</h2><p className="text-[11px] text-muted">{paidCount} de {visiblePlayers.length} pagamentos confirmados</p></div>{!canManage && <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-muted"><LockKeyhole className="h-3 w-3" /> Seu pagamento</span>}</div>
    {message && <p role="status" className={`rounded-xl p-3 text-xs font-bold ${message.includes("Não") ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"}`}>{message}</p>}

    <div className="glass-card overflow-hidden">
      {visiblePlayers.map((player, index) => {
        const totals = playerTotals.get(player.id) || { due: 0, paid: 0, complete: false };
        const lines = chargeLines.filter((line) => line.player_id === player.id);
        const canToggle = canManage || player.id === currentPlayerId;
        return <label key={player.id} className={`flex items-center gap-3 p-3 ${index < visiblePlayers.length - 1 ? "border-b border-border" : ""} ${canToggle ? "cursor-pointer hover:bg-surface-hover" : ""}`}><input type="checkbox" checked={totals.complete} disabled={!canToggle || pendingPlayerId !== null || totals.due <= 0} onChange={(event) => togglePlayer(player.id, event.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" /><PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="h-10 w-10 shrink-0 rounded-full border border-border bg-surface-hover text-xs font-bold text-muted" /><div className="min-w-0 flex-1"><p className={`truncate text-sm font-bold ${totals.complete ? "text-accent" : "text-foreground"}`}>{player.name}</p><PlayerProfileBadge profile={player.player_profile} isGoalkeeper={player.is_goalkeeper} />{lines.length > 0 && <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-muted">{lines.map((line) => `${line.label} ${currency.format(line.amount)}`).join(" · ")}</p>}</div><div className="shrink-0 text-right"><p className="text-[8px] font-black uppercase tracking-wider text-muted">Total</p><p className="text-xs font-black text-foreground">{currency.format(totals.due)}</p><span className={`text-[9px] font-black uppercase ${totals.complete ? "text-accent" : totals.paid > 0 ? "text-warning" : "text-muted"}`}>{pendingPlayerId === player.id ? "Salvando…" : totals.complete ? "Pago" : totals.paid > 0 ? "Parcial" : "Pendente"}</span></div></label>;
      })}
      {visiblePlayers.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum jogador nesta rodada.</p>}
    </div>
  </section>;
}
