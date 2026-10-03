"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ClipboardList, Copy, LockKeyhole, PencilLine, X } from "@/components/icons";
import { setPlayerPayment, updateRoundPaymentDetails, type PaymentPlayer, type PaymentRound } from "@/lib/actions/payments";
import { calculateRoundPaymentAmounts } from "@/lib/paymentStatus";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function ExtraChargeEditor({
  title,
  description,
  total,
  setTotal,
  selectedIds,
  setSelectedIds,
  players,
}: {
  title: string;
  description: string;
  total: string;
  setTotal: (value: string) => void;
  selectedIds: string[];
  setSelectedIds: (value: string[]) => void;
  players: PaymentPlayer[];
}) {
  return (
    <fieldset className="rounded-xl border border-border bg-background/60 p-3">
      <legend className="px-1 text-[10px] font-black uppercase tracking-wider text-accent">{title}</legend>
      <p className="mb-3 text-[10px] leading-4 text-muted">{description}</p>
      <label className="text-[9px] font-black uppercase tracking-wider text-muted">Valor total do extra
        <input type="number" min="0" step="0.01" inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold normal-case text-foreground outline-none focus:border-accent" />
      </label>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase text-muted">Quem vai pagar</span>
        <div className="flex gap-2 text-[9px] font-bold text-accent">
          <button type="button" onClick={() => setSelectedIds(players.map((player) => player.id))}>Todos</button>
          <button type="button" onClick={() => setSelectedIds([])}>Nenhum</button>
        </div>
      </div>
      <div className="mt-2 grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto">
        {players.map((player) => (
          <label key={player.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 px-2 py-2 text-[10px] font-bold text-foreground">
            <input type="checkbox" checked={selectedIds.includes(player.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, player.id] : selectedIds.filter((id) => id !== player.id))} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
            <span className="truncate">{player.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PaymentChecklist({
  round,
  initialPlayers,
  canEdit,
  canManagePayment,
  currentPlayerId,
}: {
  round: PaymentRound;
  initialPlayers: PaymentPlayer[];
  canEdit: boolean;
  canManagePayment: boolean;
  currentPlayerId: string | null;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState(initialPlayers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPaymentList, setCopiedPaymentList] = useState(false);
  const [error, setError] = useState("");
  const [showCompletedList, setShowCompletedList] = useState(false);
  const allPlayerIds = initialPlayers.map((player) => player.id);
  const [paymentDetails, setPaymentDetails] = useState({
    pix: round.payment_pix || "",
    total: Number(round.payment_total) || 0,
    extraTimeTotal: Number(round.payment_extra_time_total) || 0,
    extraTimePlayerIds: round.payment_extra_time_player_ids || [],
    ballFundTotal: Number(round.payment_ball_fund_total) || 0,
    ballFundPlayerIds: round.payment_ball_fund_player_ids || [],
  });
  const [draftPix, setDraftPix] = useState(paymentDetails.pix);
  const [draftTotal, setDraftTotal] = useState(String(paymentDetails.total || ""));
  const [draftExtraTimeTotal, setDraftExtraTimeTotal] = useState(String(paymentDetails.extraTimeTotal || ""));
  const [draftExtraTimePlayerIds, setDraftExtraTimePlayerIds] = useState(paymentDetails.extraTimePlayerIds.length ? paymentDetails.extraTimePlayerIds : allPlayerIds);
  const [draftBallFundTotal, setDraftBallFundTotal] = useState(String(paymentDetails.ballFundTotal || ""));
  const [draftBallFundPlayerIds, setDraftBallFundPlayerIds] = useState(paymentDetails.ballFundPlayerIds.length ? paymentDetails.ballFundPlayerIds : allPlayerIds);
  const [editingPayment, setEditingPayment] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const paidCount = useMemo(() => players.filter((player) => player.paid).length, [players]);
  const allPaid = players.length > 0 && paidCount === players.length;
  const breakdown = useMemo(() => calculateRoundPaymentAmounts({
    playerIds: players.map((player) => player.id),
    baseTotal: paymentDetails.total,
    extraTimeTotal: paymentDetails.extraTimeTotal,
    extraTimePlayerIds: paymentDetails.extraTimePlayerIds,
    ballFundTotal: paymentDetails.ballFundTotal,
    ballFundPlayerIds: paymentDetails.ballFundPlayerIds,
  }), [players, paymentDetails]);
  const currentPlayerTotal = currentPlayerId ? breakdown.amountByPlayer[currentPlayerId] : null;
  const averageTotalPerPlayer = players.length > 0 ? breakdown.grandTotal / players.length : 0;
  const highlightedTotal = currentPlayerTotal ?? averageTotalPerPlayer;

  async function copyPix() {
    if (!paymentDetails.pix) return;
    const text = paymentDetails.pix;
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

  async function copyPaymentList() {
    const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" })
      .format(new Date(`${round.date}T12:00:00`));
    const text = [
      `⚽ *Pelada BQ – ${date}*`,
      "",
      ...players.map((player, index) => `${player.paid ? "✅" : "❌"} ${index + 1}. ${player.name} — ${currency.format(breakdown.amountByPlayer[player.id] || 0)}`),
    ].join("\n");

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
    setCopiedPaymentList(true);
    window.setTimeout(() => setCopiedPaymentList(false), 2000);
  }

  async function savePaymentDetails() {
    setSavingDetails(true);
    setError("");
    const parsedTotal = Number(draftTotal.replace(",", "."));
    const parsedExtraTimeTotal = Number(draftExtraTimeTotal.replace(",", ".") || 0);
    const parsedBallFundTotal = Number(draftBallFundTotal.replace(",", ".") || 0);
    const result = await updateRoundPaymentDetails({
      roundId: round.id,
      paymentPix: draftPix,
      paymentTotal: parsedTotal,
      extraTimeTotal: parsedExtraTimeTotal,
      extraTimePlayerIds: draftExtraTimePlayerIds,
      ballFundTotal: parsedBallFundTotal,
      ballFundPlayerIds: draftBallFundPlayerIds,
    });
    if (!result.success) {
      setError(result.error || "Nao foi possivel atualizar os dados do PIX.");
    } else {
      const next = result.details!;
      const nextBreakdown = calculateRoundPaymentAmounts({
        playerIds: players.map((player) => player.id),
        baseTotal: next.total,
        extraTimeTotal: next.extraTimeTotal,
        extraTimePlayerIds: next.extraTimePlayerIds,
        ballFundTotal: next.ballFundTotal,
        ballFundPlayerIds: next.ballFundPlayerIds,
      });
      setPlayers((current) => current.map((player) => ({
        ...player,
        paid: player.paid && (nextBreakdown.amountByPlayer[player.id] || 0) <= (breakdown.amountByPlayer[player.id] || 0),
      })));
      setPaymentDetails(next);
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
            <ExtraChargeEditor title="Tempo extra" description="O valor será dividido somente entre quem ficou jogando e somado à parte normal." total={draftExtraTimeTotal} setTotal={setDraftExtraTimeTotal} selectedIds={draftExtraTimePlayerIds} setSelectedIds={setDraftExtraTimePlayerIds} players={players} />
            <ExtraChargeEditor title="Caixinha da bola" description="O valor semanal será dividido entre os selecionados. Desmarque quem não vai participar." total={draftBallFundTotal} setTotal={setDraftBallFundTotal} selectedIds={draftBallFundPlayerIds} setSelectedIds={setDraftBallFundPlayerIds} players={players} />
            <button type="button" onClick={savePaymentDetails} disabled={savingDetails || !draftPix.trim() || Number(draftTotal.replace(",", ".")) <= 0} className="rounded-xl bg-accent py-2.5 text-xs font-black text-background disabled:opacity-50">
              {savingDetails ? "Salvando..." : "Salvar cobrança completa"}
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 border-b border-accent/20 pb-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted">Total a receber</p>
            <p className="mt-1 text-lg font-black text-foreground">{currency.format(breakdown.grandTotal)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-accent">{currentPlayerTotal != null ? "Seu total" : "Total por pessoa"}</p>
            <p className="mt-1 text-lg font-black text-accent">{currency.format(highlightedTotal)}</p>
          </div>
        </div>
        <div className="mt-3 space-y-1 text-[10px] font-bold text-muted">
          <p>Valor normal da pelada: <span className="text-foreground">{currency.format(paymentDetails.total)}</span></p>
          {paymentDetails.extraTimeTotal > 0 && <p>Tempo extra: <span className="text-foreground">{currency.format(paymentDetails.extraTimeTotal)}</span> dividido entre {paymentDetails.extraTimePlayerIds.length}</p>}
          {paymentDetails.ballFundTotal > 0 && <p>Caixinha da bola: <span className="text-foreground">{currency.format(paymentDetails.ballFundTotal)}</span> dividido entre {paymentDetails.ballFundPlayerIds.length}</p>}
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-accent">PIX para pagamento</p>
        {round.payment_recipient_name && <p className="mt-1 text-xs font-bold text-foreground">Recebedor: {round.payment_recipient_name}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 break-all text-sm font-bold text-foreground">{paymentDetails.pix}</p>
          <button onClick={copyPix} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-black text-background">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "PIX copiado" : "Copiar PIX"}
          </button>
          <button onClick={copyPaymentList} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/35 bg-background/60 px-3 py-2 text-xs font-black text-accent hover:bg-accent/10">
            {copiedPaymentList ? <Check className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
            {copiedPaymentList ? "Lista copiada" : "Copiar lista"}
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
              <p className="mt-1 text-[9px] font-bold leading-4 text-muted">
                Pelada {currency.format(breakdown.baseByPlayer[player.id] || 0)}
                {breakdown.extraTimeByPlayer[player.id] > 0 && <> · Tempo extra {currency.format(breakdown.extraTimeByPlayer[player.id])}</>}
                {breakdown.ballFundByPlayer[player.id] > 0 && <> · Caixinha {currency.format(breakdown.ballFundByPlayer[player.id])}</>}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[8px] font-black uppercase tracking-wider text-muted">Total</p>
              <p className="text-xs font-black text-foreground">{currency.format(breakdown.amountByPlayer[player.id] || 0)}</p>
              <span className={`text-[9px] font-black uppercase ${player.paid ? "text-accent" : "text-muted"}`}>{player.paid ? "Pago" : "Pendente"}</span>
            </div>
          </label>
        ))}
        {players.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum jogador nesta rodada.</p>}
      </div>
    </div>
  );
}
