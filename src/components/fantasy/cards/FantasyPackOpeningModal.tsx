"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, X } from "@/components/icons";
import type { FantasyCardDefinition } from "@/lib/fantasy/cards/catalog";
import type { FantasyPackDTO } from "@/lib/actions/fantasy-cards";
import { claimPackCard, openPack } from "@/lib/actions/fantasy-cards";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { PackVideoOpening } from "./PackVideoOpening";
import { CardRevealStage } from "./CardRevealStage";

type Props = {
  pack: FantasyPackDTO;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type Stage = "SEALED" | "REVEALED" | "CONFIRMING" | "CLAIMED";

export function FantasyPackOpeningModal({ pack, isOpen, onClose, onSuccess }: Props) {
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<Stage>(
    pack.status === "opened" && pack.offers && pack.offers.length >= 2 ? "REVEALED" : "SEALED"
  );
  const [offers, setOffers] = useState<[FantasyCardDefinition, FantasyCardDefinition] | null>(
    pack.offers && pack.offers.length >= 2
      ? [pack.offers[0].card, pack.offers[1].card]
      : null
  );
  const [selectedCard, setSelectedCard] = useState<FantasyCardDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serverOffersPromiseRef = useRef<Promise<any> | null>(null);
  const [pending, startTransition] = useTransition();

  useDialogViewport(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen || typeof document === "undefined") return null;

  /**
   * Disparado no início da reprodução do vídeo de abertura do pacote.
   * Faz o fetch em background para que as cartas já estejam sorteadas e prontas quando o vídeo terminar.
   */
  function handleOpeningStart() {
    if (offers || serverOffersPromiseRef.current) return;
    setError(null);

    serverOffersPromiseRef.current = openPack(pack.id)
      .then((res) => {
        if (res.success && res.offers) {
          setOffers(res.offers);
          return res.offers;
        } else {
          setError(res.error || "Não foi possível abrir o pacote.");
          return null;
        }
      })
      .catch((err: any) => {
        setError(err.message || "Erro de conexão ao abrir pacote.");
        return null;
      });
  }

  /**
   * Disparado quando o vídeo de abertura do pacote termina (ou quando o usuário pula).
   */
  async function handleOpeningComplete() {
    if (offers) {
      setStage("REVEALED");
      return;
    }

    if (serverOffersPromiseRef.current) {
      const fetched = await serverOffersPromiseRef.current;
      if (fetched) {
        setOffers(fetched);
        setStage("REVEALED");
      } else {
        setStage("SEALED");
      }
    } else {
      // Fallback
      handleOpeningStart();
      if (serverOffersPromiseRef.current) {
        const fetched = await serverOffersPromiseRef.current;
        if (fetched) {
          setOffers(fetched);
          setStage("REVEALED");
        } else {
          setStage("SEALED");
        }
      }
    }
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
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/92 p-3 sm:p-4 backdrop-blur-md animate-fade-in touch-none overscroll-none"
      onClick={stage === "SEALED" || stage === "REVEALED" ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Abertura de Pacote BQ Cartola"
    >
      <div
        className="relative flex w-full max-w-lg max-h-[94vh] flex-col overflow-y-auto rounded-[2.5rem] border border-amber-400/40 bg-[#06160d] p-3.5 sm:p-6 shadow-[0_0_70px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto touch-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {error && (
          <div className="mb-4 rounded-xl bg-danger/20 border border-danger/40 p-2.5 text-center text-xs text-danger font-bold">
            {error}
          </div>
        )}

        {/* ESTÁGIO 1: ABERTURA COM O VÍDEO DO PACOTE BQ */}
        {stage === "SEALED" && (
          <PackVideoOpening
            roundNumber={pack.roundNumber}
            onStart={handleOpeningStart}
            onComplete={handleOpeningComplete}
          />
        )}

        {/* ESTÁGIO 2: REVELAÇÃO 3D DAS CARTAS COM ESCOLHA */}
        {stage === "REVEALED" && offers && (
          <CardRevealStage offers={offers} onSelectCard={handleSelectCard} />
        )}

        {/* ESTÁGIO 3: CONFIRMAÇÃO DA ESCOLHA */}
        {stage === "CONFIRMING" && selectedCard && (
          <div className="space-y-4 text-center py-4">
            <div className="text-5xl animate-bounce">{selectedCard.icon}</div>
            <div>
              <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-300">
                Confirmação Definitiva
              </span>
              <h2 className="mt-1 font-athletic text-2xl font-black uppercase italic text-white">
                Deseja ficar com {selectedCard.name}?
              </h2>
              <p className="mt-2 text-xs text-muted max-w-xs mx-auto">
                Esta carta será adicionada ao seu inventário permanente. A outra opção sorteada será descartada.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-3">
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

        {/* ESTÁGIO 4: RESGATADO COM SUCESSO */}
        {stage === "CLAIMED" && selectedCard && (
          <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center animate-fade-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20 text-success shadow-[0_0_30px_rgba(34,197,94,0.3)]">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h3 className="font-athletic text-xl font-black uppercase italic text-white">
              {selectedCard.name} Adicionada!
            </h3>
            <p className="text-xs text-muted max-w-xs mx-auto">
              A carta já está no seu inventário e pronta para ser ativada na próxima rodada do Cartola.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
