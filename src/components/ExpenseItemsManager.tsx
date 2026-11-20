"use client";

import { useState, useTransition } from "react";
import { Plus, Save } from "@/components/icons";
import { saveAppFeeConfig, saveExpenseItem, setExpenseItemPaidInstallments, setExpenseItemStatus, type AppFeeConfig, type ExpenseItem, type PaymentRecipient } from "@/lib/actions/payments";

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function ExpenseItemsManager({ items, recipients, appFee }: { items: ExpenseItem[]; recipients: PaymentRecipient[]; appFee: AppFeeConfig }) {
  const activeRecipients = recipients.filter((item) => item.is_active);
  const defaultRecipient = activeRecipients[0]?.id || "";
  const [appFeeValue, setAppFeeValue] = useState(appFee.amountPerPlayer ? String(appFee.amountPerPlayer) : "");
  const [appFeeRecipientId, setAppFeeRecipientId] = useState(appFee.recipientId || defaultRecipient);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [installments, setInstallments] = useState("1");
  const [recipientId, setRecipientId] = useState(defaultRecipient);
  const [historicPaid, setHistoricPaid] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  function saveFixedFee() {
    start(async () => {
      const result = await saveAppFeeConfig(Number(appFeeValue || 0), appFeeRecipientId || null);
      setMessage(result.success ? (Number(appFeeValue || 0) > 0 ? "Custo do app salvo para as próximas peladas." : "Custo do app desativado.") : result.error || "Erro ao salvar o custo do app.");
    });
  }

  function saveHistoricInstallments(item: ExpenseItem) {
    const value = Number(historicPaid[item.id] ?? item.paid_installments_before_app);
    start(async () => {
      const result = await setExpenseItemPaidInstallments(item.id, value);
      setMessage(result.success ? "Parcelas pagas atualizadas." : result.error || "Erro ao atualizar.");
    });
  }

  return <div className="space-y-6">
    <section className="glass-card space-y-3 p-4">
      <div><h2 className="text-sm font-black text-foreground">Custo fixo do app</h2><p className="mt-1 text-xs leading-5 text-muted">Cobrado de cada jogador em toda pelada, sem parcelas.</p></div>
      <label className="block text-xs font-bold text-muted">Valor por jogador<div className="relative mt-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span><input aria-label="Valor do app por jogador" type="number" min="0" step="0.01" inputMode="decimal" value={appFeeValue} onChange={(event) => setAppFeeValue(event.target.value)} className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-3 text-sm text-foreground" /></div></label>
      <label className="block text-xs font-bold text-muted">PIX que recebe<select value={appFeeRecipientId} onChange={(event) => setAppFeeRecipientId(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground"><option value="">Escolha um destinatário</option>{activeRecipients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button disabled={pending || Number(appFeeValue || 0) < 0 || (Number(appFeeValue || 0) > 0 && !appFeeRecipientId)} onClick={saveFixedFee} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-black text-background disabled:opacity-40"><Save className="h-4 w-4" /> Salvar custo fixo</button>
    </section>

    <section className="glass-card space-y-3 p-4">
      <div><h2 className="text-sm font-black text-foreground">Cadastrar compra ou despesa</h2><p className="mt-1 text-xs leading-5 text-muted">O valor total é dividido em parcelas e rateado nas rodadas escolhidas.</p></div>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Bola nova" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground" />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descrição opcional" rows={2} className="w-full resize-none rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground" />
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2"><label className="text-xs font-bold text-muted">Valor total<input type="number" min="0.01" step="0.01" value={total} onChange={(event) => setTotal(event.target.value)} className="mt-1 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground" /></label><label className="text-xs font-bold text-muted">Parcelas<input type="number" min="1" max="120" value={installments} onChange={(event) => setInstallments(event.target.value)} className="mt-1 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground" /></label></div>
      <label className="block text-xs font-bold text-muted">PIX que recebe<select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground"><option value="">Escolha um destinatário</option>{activeRecipients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button disabled={pending || !name.trim() || !recipientId || Number(total) <= 0} onClick={() => start(async () => { const result = await saveExpenseItem({ name, description, totalAmount: Number(total), installmentCount: Number(installments), recipientId }); setMessage(result.success ? "Item cadastrado e pronto para usar." : result.error || "Erro ao salvar."); if (result.success) { setName(""); setDescription(""); setTotal(""); setInstallments("1"); } })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-black text-background disabled:opacity-40"><Plus className="h-4 w-4" /> Cadastrar item</button>
      {message && <p role="status" className="text-xs font-bold text-muted">{message}</p>}
    </section>

    <section><div className="mb-2"><h2 className="font-athletic text-xl font-black uppercase text-white">Itens da pelada</h2><p className="text-xs text-muted">Progresso e saldo transparentes para todos.</p></div><div className="space-y-3">{items.map((item) => <ExpenseItemCard key={item.id} item={item} pending={pending} historicValue={historicPaid[item.id] ?? String(item.paid_installments_before_app)} setHistoricValue={(value) => setHistoricPaid((current) => ({ ...current, [item.id]: value }))} saveHistoric={() => saveHistoricInstallments(item)} setMessage={setMessage} start={start} />)}{!items.length && <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">Nenhum item cadastrado.</p>}</div></section>
  </div>;
}

function ExpenseItemCard({ item, pending, historicValue, setHistoricValue, saveHistoric, setMessage, start }: { item: ExpenseItem; pending: boolean; historicValue: string; setHistoricValue: (value: string) => void; saveHistoric: () => void; setMessage: (value: string) => void; start: (callback: () => Promise<void>) => void }) {
  const remaining = Math.max(0, item.installment_count - item.paid_installments);
  const progress = Math.min(100, item.paid_installments / item.installment_count * 100);
  const registeredByApp = Math.max(0, item.paid_installments - item.paid_installments_before_app);
  return <article className="rounded-2xl border border-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-black text-white">{item.name}</h3><p className="mt-1 break-words text-xs text-muted">{money(item.total_amount)} · PIX de {item.recipient?.name || "destinatário"}</p></div><span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-[10px] font-black uppercase text-accent">{item.status === "active" ? "Ativo" : item.status === "completed" ? "Quitado" : "Arquivado"}</span></div>{item.description && <p className="mt-3 break-words text-xs leading-5 text-muted">{item.description}</p>}<div className="mt-4 h-2 overflow-hidden rounded-full bg-background"><div className="h-full bg-accent" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex flex-wrap justify-between gap-1 text-[11px] font-bold text-muted"><span>{item.paid_installments}/{item.installment_count} parcelas usadas</span><span>{remaining} restantes</span></div><p className="mt-1 text-[11px] text-muted">{item.paid_installments_before_app} já pagas antes do app · {registeredByApp} lançada{registeredByApp === 1 ? "" : "s"} no Transfermarket</p><div className="mt-4 rounded-xl border border-border bg-background/50 p-3"><label className="block text-xs font-black text-white">Parcelas já pagas antes do app</label><div className="mt-2 flex flex-col gap-2 min-[360px]:flex-row"><input aria-label={`Parcelas antigas pagas de ${item.name}`} type="number" min="0" max={item.installment_count - registeredByApp} step="1" value={historicValue} onChange={(event) => setHistoricValue(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white" /><button disabled={pending || Number(historicValue) === item.paid_installments_before_app} onClick={saveHistoric} className="flex items-center justify-center gap-1 rounded-lg border border-accent/40 px-3 py-2 text-xs font-black text-accent disabled:opacity-40"><Save className="h-3.5 w-3.5" /> Salvar</button></div></div>{item.status !== "completed" && <button disabled={pending} onClick={() => start(async () => { const result = await setExpenseItemStatus(item.id, item.status === "active" ? "archived" : "active"); setMessage(result.success ? "Item atualizado." : result.error || "Erro ao atualizar."); })} className="mt-3 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted">{item.status === "active" ? "Arquivar" : "Reativar"}</button>}</article>;
}
