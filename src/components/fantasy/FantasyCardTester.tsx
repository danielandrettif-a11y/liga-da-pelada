"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Sparkles, Trophy } from "@/components/icons";
import { giveMyAccountTestPack } from "@/lib/actions/fantasy-cards";

export function FantasyCardTester() {
  const [pending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleCreateTestPack() {
    setStatusMessage(null);
    startTransition(async () => {
      try {
        const res = await giveMyAccountTestPack();
        if (res.success) {
          setStatusMessage({
            type: "success",
            text: "🎁 Pacote de teste gerado com sucesso para a sua conta!",
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

  return (
    <section className="relative overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-surface to-emerald-500/15 p-5 sm:p-6 shadow-[0_0_40px_rgba(245,158,11,0.15)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-500/20 text-amber-300 text-2xl shadow-[0_0_20px_rgba(245,158,11,0.3)]">
            🃏
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-athletic text-xs font-black uppercase italic tracking-wider text-amber-300 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Simulador de Testes V3
              </span>
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[8px] font-black uppercase text-accent">
                Admin
              </span>
            </div>
            <h3 className="mt-0.5 font-athletic text-lg font-black uppercase italic text-white">
              Testar Pacotes e Cartas Especiais
            </h3>
            <p className="text-xs text-muted">
              Gere um pacote instantaneamente para a sua conta para experimentar a abertura, escolha e ativação.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={handleCreateTestPack}
            disabled={pending}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-[#05130b] shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-75"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Gerando...</span>
              </>
            ) : (
              <>
                <span>🎁 Gerar 1 Pacote de Teste</span>
              </>
            )}
          </button>

          <Link
            href="/cartola"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-2xl border border-accent/40 bg-accent/15 px-5 py-3 text-xs font-black uppercase tracking-wider text-accent hover:bg-accent/25 active:scale-95 transition-all"
          >
            <span>Ir para o Cartola →</span>
          </Link>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`mt-4 rounded-2xl p-3 text-xs font-bold flex items-center gap-2 ${
            statusMessage.type === "success"
              ? "bg-success/15 border border-success/30 text-success"
              : "bg-danger/15 border border-danger/30 text-danger"
          }`}
        >
          {statusMessage.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>{statusMessage.text}</span>
          {statusMessage.type === "success" && (
            <Link href="/cartola" className="ml-auto underline font-black">
              Abrir Agora →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
