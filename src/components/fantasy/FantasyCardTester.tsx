"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Trash2,
  Users,
  X,
} from "@/components/icons";
import {
  distributePackToAllLineupUsers,
  giveMyAccountTestPack,
  resetMyAccountCards,
} from "@/lib/actions/fantasy-cards";
import { useDialogViewport } from "@/lib/useDialogViewport";

export function FantasyCardTester() {
  const [pending, startTransition] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useDialogViewport(confirmReset);

  function handleCreateTestPack() {
    setStatusMessage(null);
    startTransition(async () => {
      try {
        const res = await giveMyAccountTestPack();
        if (res.success) {
          setStatusMessage({
            type: "success",
            text: "🎁 1 Pacote de teste foi gerado para a sua conta com sucesso!",
          });
        } else {
          setStatusMessage({
            type: "error",
            text: res.error || "Erro ao gerar pacote de teste.",
          });
        }
      } catch (err: any) {
        setStatusMessage({
          type: "error",
          text: err.message || "Erro de conexão ao gerar pacote.",
        });
      }
    });
  }

  function handleDistributeToAll() {
    setStatusMessage(null);
    startTransition(async () => {
      try {
        const res = await distributePackToAllLineupUsers();
        if (res.success) {
          setStatusMessage({
            type: "success",
            text: `🎉 Sucesso! 1 pacote foi concedido para todos os ${res.awardedUsersCount} participantes que já escalaram no Cartola (Rodada ${res.roundNumber || ""})!`,
          });
        } else {
          setStatusMessage({
            type: "error",
            text: res.error || "Erro ao distribuir pacotes para os usuários.",
          });
        }
      } catch (err: any) {
        setStatusMessage({
          type: "error",
          text: err.message || "Erro de conexão ao distribuir pacotes.",
        });
      }
    });
  }

  function handleResetMyCards() {
    setStatusMessage(null);
    startTransition(async () => {
      try {
        const res = await resetMyAccountCards();
        setConfirmReset(false);
        if (res.success) {
          setStatusMessage({
            type: "success",
            text: `🗑️ Inventário zerado! Foram removidas ${res.deletedCardsCount ?? 0} cartas, ${res.deletedActivationsCount ?? 0} ativações e ${res.deletedPacksCount ?? 0} pacotes da sua conta.`,
          });
        } else {
          setStatusMessage({
            type: "error",
            text: res.error || "Erro ao zerar inventário de cartas.",
          });
        }
      } catch (err: any) {
        setConfirmReset(false);
        setStatusMessage({
          type: "error",
          text: err.message || "Erro de conexão ao zerar cartas.",
        });
      }
    });
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-surface to-emerald-500/15 p-5 sm:p-6 shadow-[0_0_40px_rgba(245,158,11,0.15)]">
      <div className="flex flex-col gap-4">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-500/20 text-amber-300 text-2xl shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              🃏
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-athletic text-xs font-black uppercase italic tracking-wider text-amber-300 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Simulador & Gestão V3
                </span>
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[8px] font-black uppercase text-accent">
                  Admin
                </span>
              </div>
              <h3 className="mt-0.5 font-athletic text-lg font-black uppercase italic text-white">
                Testes de Pacotes & Cartas Especiais
              </h3>
              <p className="text-xs text-muted">
                Zere seu inventário para um teste limpo ou distribua pacotes para todos os usuários que já escalaram.
              </p>
            </div>
          </div>

          <Link
            href="/cartola"
            className="hidden sm:inline-flex items-center justify-center gap-1.5 rounded-2xl border border-accent/40 bg-accent/15 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-accent hover:bg-accent/25 active:scale-95 transition-all shrink-0"
          >
            <span>Ir para o Cartola →</span>
          </Link>
        </div>

        {/* Botões de Ação */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
          {/* Botão 1: Zerar Minhas Cartas */}
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-xs font-black uppercase tracking-wider text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.15)] hover:bg-rose-500/25 active:scale-95 transition-all disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4 shrink-0 text-rose-400" />
            <span>Zerar Minhas Cartas</span>
          </button>

          {/* Botão 2: Dar Pacote p/ Todos que Escalaram */}
          <button
            type="button"
            onClick={handleDistributeToAll}
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-emerald-500/30 active:scale-95 transition-all disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0 text-emerald-300" />
            ) : (
              <Users className="h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <span>Pacote p/ Quem Escalou</span>
          </button>

          {/* Botão 3: Gerar 1 Pacote de Teste para Minha Conta */}
          <button
            type="button"
            onClick={handleCreateTestPack}
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-[#05130b] shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-75"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0 text-[#05130b]" />
            )}
            <span>+1 Pacote p/ Mim</span>
          </button>
        </div>

        {/* Link Mobile */}
        <Link
          href="/cartola"
          className="sm:hidden flex items-center justify-center gap-1.5 rounded-2xl border border-accent/40 bg-accent/15 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-accent hover:bg-accent/25 active:scale-95 transition-all"
        >
          <span>Ir para o Cartola →</span>
        </Link>
      </div>

      {/* Mensagem de Feedback */}
      {statusMessage && (
        <div
          className={`mt-4 rounded-2xl p-3.5 text-xs font-bold flex items-center gap-2.5 animate-fade-in ${
            statusMessage.type === "success"
              ? "bg-success/15 border border-success/30 text-success"
              : "bg-danger/15 border border-danger/30 text-danger"
          }`}
        >
          {statusMessage.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {statusMessage.type === "error" && <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{statusMessage.text}</span>
          {statusMessage.type === "success" && (
            <Link href="/cartola" className="shrink-0 underline font-black">
              Ver Cartola →
            </Link>
          )}
        </div>
      )}

      {/* Modal de Confirmação para Zerar Cartas */}
      {confirmReset && (
        <div
          className="mobile-dialog-backdrop bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-cards-title"
          onMouseDown={(event) => event.target === event.currentTarget && !pending && setConfirmReset(false)}
        >
          <div className="mobile-dialog-panel max-w-md rounded-[26px] border border-danger/30 bg-surface p-5 shadow-2xl animate-fade-in-up">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-danger/15 text-danger">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="reset-cards-title" className="text-lg font-black text-foreground">
                  Zerar cartas da sua conta?
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted">
                  Isso irá apagar todas as cartas do seu inventário pessoal, ativações da rodada e ofertas pendentes, deixando seu inventário zerado (0 cartas) para um teste limpo.
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmReset(false)}
                aria-label="Fechar"
                className="rounded-full p-2 text-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmReset(false)}
                className="h-12 rounded-xl border border-border text-sm font-black text-muted disabled:opacity-50 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleResetMyCards}
                className="h-12 rounded-xl bg-danger text-sm font-black text-white disabled:opacity-50 hover:brightness-110 flex items-center justify-center gap-2"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Zerando...</span>
                  </>
                ) : (
                  <span>Sim, zerar tudo</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
