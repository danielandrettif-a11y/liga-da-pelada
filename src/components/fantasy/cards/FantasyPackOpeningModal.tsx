"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, Sparkles, X } from "@/components/icons";
import { RARITY_CONFIG } from "@/lib/fantasy/cards/config";
import type { FantasyCardDefinition } from "@/lib/fantasy/cards/catalog";
import type { FantasyPackDTO } from "@/lib/actions/fantasy-cards";
import { claimPackCard, openPack } from "@/lib/actions/fantasy-cards";
import { useDialogViewport } from "@/lib/useDialogViewport";

type Props = {
  pack: FantasyPackDTO;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function FantasyPackOpeningModal({ pack, isOpen, onClose, onSuccess }: Props) {
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<"READY" | "OPENING" | "REVEALED" | "CONFIRMING" | "CLAIMED">(
    pack.status === "opened" && pack.offers.length >= 2 ? "REVEALED" : "READY"
  );
  const [offers, setOffers] = useState<[FantasyCardDefinition, FantasyCardDefinition] | null>(
    pack.offers && pack.offers.length >= 2
      ? [pack.offers[0].card, pack.offers[1].card]
      : null
  );
  const [selectedCard, setSelectedCard] = useState<FantasyCardDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useDialogViewport(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen || typeof document === "undefined") return null;

  function handleStartOpen() {
    setError(null);
    setStage("OPENING");

    startTransition(async () => {
      try {
        const res = await openPack(pack.id);
        if (res.success && res.offers) {
          // Pequeno timeout para animação de abertura fluida
          setTimeout(() => {
            setOffers(res.offers!);
            setStage("REVEALED");
          }, 800);
        } else {
          setError(res.error || "Não foi possível abrir o pacote.");
          setStage("READY");
        }
      } catch (err: any) {
        setError(err.message || "Erro de conexão ao abrir pacote.");
        setStage("READY");
      }
    });
  }

  function handleSelectCard(card: FantasyCardDefinition) {
    setSelectedCard(card);
    setStage("CONFIRMING");
  }

  function handleConfirmClaim() {
    if (!selectedCard) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await claimPackCard(pack.id, selectedCard.slug);
        if (res.success) {
          setStage("CLAIMED");
          setTimeout(() => {
            onSuccess();
          }, 1400);
        } else {
          setError(res.error || "Não foi possível resgatar a carta.");
        }
      } catch (err: any) {
        setError(err.message || "Erro de conexão ao escolher carta.");
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in touch-none overscroll-none"
      onClick={stage !== "OPENING" ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Abertura de Pacote Cartola"
    >
      <div
        className="relative flex w-full max-w-lg max-h-[90vh] flex-col overflow-y-auto rounded-[2.5rem] border border-amber-400/40 bg-[#06160d] p-5 sm:p-7 shadow-[0_0_70px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão Fechar */}
        {stage !== "OPENING" && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* ESTÁGIO 1: PACOTE FECHADO */}
        {stage === "READY" && (
          <div className="flex flex-col items-center text-center py-6 space-y-4">
            <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/30 to-black p-4 shadow-[0_0_40px_rgba(245,158,11,0.4)] text-5xl animate-bounce">
              🎁
            </div>

            <div>
              <span className="font-athletic text-xs font-black uppercase italic tracking-[0.2em] text-amber-300">
                Recompensa de Participação
              </span>
              <h2 className="mt-1 font-athletic text-2xl font-black uppercase italic text-white">
                {pack.roundNumber ? `Pacote da Rodada ${pack.roundNumber}` : "Pacote da Rodada"}
              </h2>
              <p className="mt-2 text-xs text-muted max-w-xs mx-auto">
                Ao abrir, duas cartas especiais serão sorteadas. Você poderá escolher apenas uma para o seu inventário.
              </p>
            </div>

            {error && <p className="text-xs text-danger font-bold">{error}</p>}

            <button
              type="button"
              onClick={handleStartOpen}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 py-4 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:brightness-110 active:scale-95 transition-all"
            >
              Abrir Pacote Agora ✨
            </button>
          </div>
        )}

        {/* ESTÁGIO 2: ANIMAÇÃO DE ABERTURA */}
        {stage === "OPENING" && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 text-4xl animate-spin">
              ✨
            </div>
            <p className="font-athletic text-lg font-black uppercase italic text-amber-300 animate-pulse">
              Sorteando suas cartas...
            </p>
          </div>
        )}

        {/* ESTÁGIO 3: DUAS CARTAS REVELADAS */}
        {stage === "REVEALED" && offers && (
          <div className="space-y-4">
            <div className="text-center">
              <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-300">
                Escolha 1 de 2
              </span>
              <h2 className="font-athletic text-xl font-black uppercase italic text-white">
                Cartas Sorteadas
              </h2>
              <p className="text-[11px] text-muted">
                Toque na carta que deseja guardar no seu inventário. A outra será descartada.
              </p>
            </div>

            {error && <p className="text-xs text-danger font-bold text-center">{error}</p>}

            {/* Grid das 2 Cartas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {offers.map((card, idx) => {
                const rarityInfo = RARITY_CONFIG[card.rarity];
                return (
                  <button
                    key={card.slug + idx}
                    type="button"
                    onClick={() => handleSelectCard(card)}
                    className={`group relative flex flex-col justify-between rounded-3xl border-2 ${rarityInfo.border} ${rarityInfo.bg} p-4 text-left shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${rarityInfo.glow}`}
                  >
                    <div>
                      {/* Topo da Carta */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-2xl">{card.icon}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${rarityInfo.badgeBg}`}
                        >
                          {rarityInfo.icon} {rarityInfo.label}
                        </span>
                      </div>

                      {/* Nome e Descrição */}
                      <h3 className={`mt-3 font-athletic text-base font-black uppercase italic ${rarityInfo.text}`}>
                        {card.name}
                      </h3>
                      <p className="mt-1.5 text-xs text-muted leading-relaxed">
                        {card.description}
                      </p>
                    </div>

                    {/* Botão de Escolha */}
                    <div className="mt-4 pt-3 border-t border-white/10 text-center">
                      <span className="block w-full rounded-xl bg-white/10 py-2 text-[10px] font-black uppercase tracking-wider text-white group-hover:bg-accent group-hover:text-background transition-colors">
                        Escolher esta carta →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ESTÁGIO 4: CONFIRMAÇÃO DE ESCOLHA */}
        {stage === "CONFIRMING" && selectedCard && (
          <div className="space-y-4 text-center py-2">
            <div className="text-4xl">{selectedCard.icon}</div>
            <div>
              <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-300">
                Confirmação Definitiva
              </span>
              <h2 className="mt-0.5 font-athletic text-xl font-black uppercase italic text-white">
                Deseja ficar com {selectedCard.name}?
              </h2>
              <p className="mt-2 text-xs text-muted max-w-xs mx-auto">
                Esta carta será adicionada ao seu inventário permanente. A outra opção sorteada será descartada.
              </p>
            </div>

            {error && <p className="text-xs text-danger font-bold">{error}</p>}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStage("REVEALED")}
                disabled={pending}
                className="flex-1 rounded-2xl border border-white/10 py-3.5 text-xs font-bold text-muted hover:text-white transition-colors"
              >
                Voltar
              </button>

              <button
                type="button"
                onClick={handleConfirmClaim}
                disabled={pending}
                className="flex-2 flex items-center justify-center gap-1.5 rounded-2xl bg-accent py-3.5 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_25px_rgba(204,255,0,0.3)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-80"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Confirmar Escolha</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ESTÁGIO 5: RESGATADO COM SUCESSO */}
        {stage === "CLAIMED" && selectedCard && (
          <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center animate-fade-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20 text-success shadow-[0_0_30px_rgba(34,197,94,0.3)]">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h3 className="font-athletic text-xl font-black uppercase italic text-white">
              {selectedCard.name} Adicionada!
            </h3>
            <p className="text-xs text-muted">
              A carta já está no seu inventário e pronta para ser ativada na próxima rodada.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
