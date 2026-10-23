"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, Copy, PencilLine, Save } from "@/components/icons";
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

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const recipientKey = (name: string, pix: string) => `${name}\u0000${pix}`;

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
  const [message, setMessage] = useState("");
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [editingItems, setEditingItems] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState(initialExpenseSelections.map((item) => item.expense_item_id));
  const [copiedList, setCopiedList] = useState(false);
  const [pending, start] = useTransition();
  const names = new Map(players.map((player) => [player.id, player.name]));
  const visible = canManage ? obligations : obligations.filter((item) => item.player_id === currentPlayerId);
  const recipients = new Map<string, PaymentObligation[]>();
  for (const item of visible) {
    const key = recipientKey(item.recipient_name, item.recipient_pix);
    recipients.set(key, [...(recipients.get(key) || []), item]);
  }
  const selectedSet = new Set(selectedExpenseIds);
  const installmentByItem = new Map(initialExpenseSelections.map((item) => [item.expense_item_id, item.installment_number]));

  function updatePayment(item: PaymentObligation, amount: number) {
    start(async () => {
      const result = await setPaymentObligationPaid(item.id, amount);
      if (result.success) {
        setObligations((rows) => rows.map((row) => row.id === item.id ? { ...row, amount_paid: amount, status: amount > row.amount_due ? "credit" : amount === row.amount_due ? "paid" : amount > 0 ? "partial" : "pending" } : row));
        setMessage("Pagamento atualizado.");
      } else setMessage(result.error || "Erro ao atualizar.");
    });
  }

  function toggleExpenseItem(id: string) {
    setSelectedExpenseIds((items) => items.includes(id) ? items.filter((itemId) => itemId !== id) : [...items, id]);
  }

  function saveExpensePlan() {
    start(async () => {
      const result = await syncRoundExpenseItems(roundId, selectedExpenseIds);
      if (result.success) {
        setEditingItems(false);
        setMessage("Itens da caixinha atualizados nesta rodada.");
        router.refresh();
      } else setMessage(result.error || "Não foi possível atualizar os itens.");
    });
  }

  async function copyPaymentList() {
    const text = buildDetailedPaymentWhatsAppMessage({ round, players, obligations });
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
    setCopiedList(true);
    window.setTimeout(() => setCopiedList(false), 2000);
  }

  return <section className="space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">Cobrança detalhada</p><h2 className="font-athletic text-xl font-black uppercase text-white">PIX por destinatário</h2><p className="mt-1 text-xs leading-5 text-muted">Cada compra vai direto para quem deve receber. Correções mostram saldo ou crédito sem apagar o histórico.</p></div>
      {canManage && <button type="button" onClick={copyPaymentList} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/35 bg-accent/10 px-3 py-2 text-[10px] font-black text-accent"><ClipboardList className="h-4 w-4" />{copiedList ? "Lista copiada" : "Copiar para WhatsApp"}</button>}
    </div>

    {canManage && <article className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">Caixinha desta rodada</p><h3 className="mt-1 font-black text-white">Itens que entram no rateio</h3><p className="mt-1 text-xs leading-5 text-muted">Adicione ou retire itens mesmo depois de finalizar a rodada. Os valores e saldos de cada jogador são recalculados.</p></div><button type="button" onClick={() => setEditingItems((value) => !value)} className="flex shrink-0 items-center gap-1 rounded-lg border border-accent/40 px-3 py-2 text-xs font-black text-accent"><PencilLine className="h-3.5 w-3.5" /> {editingItems ? "Fechar" : "Editar"}</button></div>
      {!editingItems && <div className="mt-3 flex flex-wrap gap-2">{expenseItems.filter((item) => selectedSet.has(item.id)).map((item) => <span key={item.id} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-white">{item.name} · parcela {installmentByItem.get(item.id) || item.paid_installments + 1}/{item.installment_count}</span>)}{!selectedExpenseIds.length && <p className="text-xs text-muted">Nenhum item da caixinha foi incluído nesta rodada.</p>}</div>}
      {editingItems && <div className="mt-4 space-y-2">{expenseItems.map((item) => {
        const selected = selectedSet.has(item.id);
        const unavailable = !selected && item.status !== "active";
        const nextInstallment = installmentByItem.get(item.id) || item.paid_installments + 1;
        return <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selected ? "border-accent/60 bg-background" : "border-border bg-background/50"} ${unavailable ? "cursor-not-allowed opacity-50" : ""}`}><input type="checkbox" checked={selected} disabled={unavailable || pending} onChange={() => toggleExpenseItem(item.id)} className="mt-0.5 h-4 w-4 accent-lime-400" /><span className="min-w-0 flex-1"><span className="block text-sm font-black text-white">{item.name}</span><span className="mt-1 block text-[11px] leading-4 text-muted">{money(item.total_amount)} · parcela {nextInstallment}/{item.installment_count}{item.status === "completed" ? " · quitado" : item.status === "archived" ? " · arquivado" : ""}</span></span></label>;
      })}{!expenseItems.length && <p className="rounded-xl border border-border bg-background/50 p-3 text-xs text-muted">Cadastre primeiro um item em Mais → Administração → Caixinha e despesas.</p>}<button type="button" disabled={pending} onClick={saveExpensePlan} className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-black text-background disabled:opacity-40"><Save className="h-4 w-4" /> Salvar itens desta rodada</button></div>}
    </article>}

    {[...recipients.entries()].map(([key, rows]) => {
      const [name, pix] = key.split("\u0000");
      const total = rows.reduce((sum, row) => sum + row.amount_due, 0);
      return <article key={key} className="rounded-2xl border border-accent/25 bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase text-muted">Pagar para</p><h3 className="text-base font-black text-white">{name}</h3><p className="mt-1 break-all text-xs text-muted">{pix}</p></div><button type="button" onClick={() => navigator.clipboard.writeText(pix)} aria-label={`Copiar PIX de ${name}`} className="rounded-xl bg-accent p-2.5 text-background"><Copy className="h-4 w-4" /></button></div><div className="mt-4 space-y-2">{rows.map((item) => {
        const balance = item.amount_due - item.amount_paid;
        const canEdit = canManage || item.player_id === currentPlayerId;
        const lines = chargeLines.filter((line) => line.player_id === item.player_id && line.recipient_name === item.recipient_name && line.recipient_pix === item.recipient_pix);
        return <div key={item.id} className="rounded-xl border border-border bg-background/60 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-white">{names.get(item.player_id) || "Jogador"}</p><p className="mt-1 text-[10px] text-muted">Devido {money(item.amount_due)} · pago {money(item.amount_paid)}</p></div><strong className={balance <= 0 ? "text-success" : "text-accent"}>{balance < 0 ? `Crédito ${money(-balance)}` : balance === 0 ? "Quitado" : `Falta ${money(balance)}`}</strong></div>{lines.length > 0 && <p className="mt-2 text-[10px] leading-4 text-muted">{lines.map((line) => `${line.label}: ${money(line.amount)}`).join(" · ")}</p>}{canEdit && <div className="mt-3 flex gap-2"><button disabled={pending} onClick={() => updatePayment(item, item.amount_due)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-black text-background disabled:opacity-40"><Check className="h-3.5 w-3.5" /> Marcar pago</button>{item.amount_paid > 0 && <button disabled={pending} onClick={() => updatePayment(item, 0)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted">Reabrir</button>}</div>}{canManage && <div className="mt-2 flex gap-2"><input aria-label={`Valor pago por ${names.get(item.player_id) || "jogador"}`} type="number" min="0" step="0.01" placeholder="Valor pago" value={corrections[item.id] || ""} onChange={(event) => setCorrections((current) => ({ ...current, [item.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-white" /><button disabled={pending || corrections[item.id] === undefined || Number(corrections[item.id]) < 0} onClick={() => updatePayment(item, Number(corrections[item.id]))} className="rounded-lg border border-accent/40 px-3 py-2 text-xs font-bold text-accent disabled:opacity-40">Corrigir</button></div>}</div>;
      })}</div><p className="mt-3 text-right text-xs font-black text-muted">Total deste PIX: <span className="text-white">{money(total)}</span></p></article>;
    })}
    {message && <p role="status" className="text-xs font-bold text-muted">{message}</p>}
  </section>;
}
