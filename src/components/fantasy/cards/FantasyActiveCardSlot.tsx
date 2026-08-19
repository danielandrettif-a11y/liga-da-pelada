"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Lock, Sparkles, Trash2, X } from "@/components/icons";
import { RARITY_CONFIG } from "@/lib/fantasy/cards/config";
import { getCardArtUrl } from "@/lib/fantasy/cards/card-assets";
import type { FantasyActiveCardDTO } from "@/lib/actions/fantasy-cards";
import { removeActiveCardForRound } from "@/lib/actions/fantasy-cards";
import { FantasyInventoryModal } from "./FantasyInventoryModal";

type Props = {
  roundId: string | null;
  activeCard: FantasyActiveCardDTO | null;
  isMarketOpen: boolean;
  onRefresh?: () => void;
  marketPlayers?: Array<{ id: string; name: string; price: number }>;
  lineupPlayers?: Array<{ id: string; name: string; price: number }>;
  captainPlayerId?: string | null;
};

export function FantasyActiveCardSlot({
  roundId,
  activeCard,
  isMarketOpen,
  onRefresh,
  marketPlayers = [],
  lineupPlayers = [],
  captainPlayerId = null,
}: Props) {
  const [showInventory, setShowInventory] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    if (!roundId) return;
    startTransition(async () => {
      await removeActiveCardForRound(roundId);
      onRefresh?.();
    });
  }

  if (!roundId) return null;

  return (
    <>
      <section className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🃏</span>
            <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
              Carta Especial da Rodada
            </h3>
          </div>
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-accent">
            Máx 1 por Rodada
          </span>
        </div>

        {activeCard ? (
          /* CARTA ATIVA CONFIGURADA */
          <div
            className={`flex flex-col gap-3 rounded-2xl border p-3.5 ${
              RARITY_CONFIG[activeCard.card.rarity].border
            } ${RARITY_CONFIG[activeCard.card.rarity].bg} shadow-md`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {getCardArtUrl(activeCard.card.slug) ? (
                  <div className="relative h-16 w-11 shrink-0 rounded-xl overflow-hidden border border-amber-400/40 shadow-lg">
                    <Image
                      src={getCardArtUrl(activeCard.card.slug)!}
                      alt={activeCard.card.name}
                      fill
                      unoptimized
                      sizes="50px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <span className="text-3xl shrink-0">{activeCard.card.icon}</span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`truncate text-sm font-black uppercase italic ${
                        RARITY_CONFIG[activeCard.card.rarity].text
                      }`}
                    >
                      {activeCard.card.name}
                    </h4>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[7px] font-black uppercase ${
                        RARITY_CONFIG[activeCard.card.rarity].badgeBg
                      }`}
                    >
                      {RARITY_CONFIG[activeCard.card.rarity].label}
                    </span>
                    {!isMarketOpen && (
                      <span className="rounded bg-black/40 px-1.5 py-0.2 text-[7px] font-black text-warning flex items-center gap-0.5">
                        <Lock className="h-2.5 w-2.5 inline" /> Travada
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted leading-tight">
                    {activeCard.card.description}
                  </p>
                </div>
              </div>

              {/* Ações (Trocar / Remover) */}
              {isMarketOpen && (
                <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setShowInventory(true)}
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-white hover:bg-white/20 transition-colors"
                  >
                    Trocar
                  </button>
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={pending}
                    className="rounded-xl border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-danger hover:bg-danger/20 transition-colors"
                    title="Remover carta ativa"
                    aria-label="Remover carta ativa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* DESTAQUE DO JOGADOR SELECIONADO NA CARTA */}
            {(activeCard.targetPlayerId || activeCard.targetPlayer2Id || activeCard.targetPrediction) && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs">
                {activeCard.targetPlayerId && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-accent font-black">🎯 Jogador Selecionado:</span>
                    <span className="font-black text-foreground underline decoration-accent/50 underline-offset-2">
                      {activeCard.targetPlayerName ||
                        marketPlayers.find((p) => p.id === activeCard.targetPlayerId)?.name ||
                        "Jogador escolhido"}
                    </span>
                  </div>
                )}
                {activeCard.targetPlayer2Id && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted font-bold">&</span>
                    <span className="font-black text-foreground underline decoration-accent/50 underline-offset-2">
                      {activeCard.targetPlayer2Name ||
                        marketPlayers.find((p) => p.id === activeCard.targetPlayer2Id)?.name ||
                        "2º Jogador"}
                    </span>
                  </div>
                )}
                {activeCard.targetPrediction && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-warning font-black">🔮 Palpite:</span>
                    <span className="font-black text-foreground">
                      {activeCard.targetPrediction === "TOP_SCORER"
                        ? "Artilheiro da Rodada"
                        : activeCard.targetPrediction === "TOP_ASSIST"
                        ? "Líder de Assistências"
                        : "Cumprir Desafio"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* NENHUMA CARTA ATIVA */
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-white/20 bg-black/20 p-3.5">
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground">Nenhuma carta ativa</p>
              <p className="text-[10px] text-muted">
                Ative uma carta do seu inventário para ganhar bônus exclusivos nesta rodada.
              </p>
            </div>

            {isMarketOpen && (
              <button
                type="button"
                onClick={() => setShowInventory(true)}
                className="shrink-0 flex items-center gap-1 rounded-xl bg-accent px-3 py-2 text-[10px] font-black uppercase tracking-wider text-background shadow-[0_0_15px_rgba(204,255,0,0.2)] hover:brightness-110 active:scale-95 transition-all"
              >
                <Sparkles className="h-3 w-3" />
                <span>Escolher Carta</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* Modal de Inventário */}
      <FantasyInventoryModal
        isOpen={showInventory}
        onClose={() => setShowInventory(false)}
        roundId={roundId}
        isMarketOpen={isMarketOpen}
        marketPlayers={marketPlayers}
        lineupPlayers={lineupPlayers}
        captainPlayerId={captainPlayerId}
        onCardActivated={() => {
          onRefresh?.();
        }}
      />
    </>
  );
}
