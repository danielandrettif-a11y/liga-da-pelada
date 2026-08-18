"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { RARITY_CONFIG } from "@/lib/fantasy/cards/config";
import type { FantasyCardDefinition } from "@/lib/fantasy/cards/catalog";
import { getCardArtUrl } from "@/lib/fantasy/cards/card-assets";
import { Sparkles } from "@/components/icons";

type Props = {
  offers: [FantasyCardDefinition, FantasyCardDefinition];
  onSelectCard: (card: FantasyCardDefinition) => void;
};

export function CardRevealStage({ offers, onSelectCard }: Props) {
  const [flippedCards, setFlippedCards] = useState<boolean[]>([false, false]);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Revela a primeira carta após 250ms e a segunda após 550ms
    const t1 = setTimeout(() => {
      setFlippedCards((prev) => [true, prev[1]]);
    }, 300);

    const t2 = setTimeout(() => {
      setFlippedCards([true, true]);
    }, 650);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  function handleImageError(slug: string) {
    setImageErrors((prev) => ({ ...prev, [slug]: true }));
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Título de Instrução */}
      <div className="text-center">
        <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-300 flex items-center justify-center gap-1">
          <Sparkles className="h-3 w-3 text-amber-400" /> Escolha 1 de 2
        </span>
        <h2 className="font-athletic text-2xl font-black uppercase italic text-white">
          Cartas Sorteadas
        </h2>
        <p className="text-[11px] text-muted max-w-xs mx-auto">
          Toque na carta que deseja guardar no seu inventário. A outra será descartada.
        </p>
      </div>

      {/* Grid das 2 Cartas com Perspectiva 3D */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
        {offers.map((card, idx) => {
          const rarityInfo = RARITY_CONFIG[card.rarity];
          const isFlipped = flippedCards[idx];
          const customArtUrl = getCardArtUrl(card.slug);
          const hasImage = customArtUrl && !imageErrors[card.slug];

          return (
            <div
              key={card.slug + idx}
              className={`card-perspective-container ${
                idx === 0 ? "animate-card-float-1" : "animate-card-float-2"
              }`}
            >
              <div
                className={`relative w-full h-[320px] card-3d-flipper ${
                  isFlipped ? "is-flipped" : ""
                }`}
              >
                {/* COSTAS DA CARTA (Backface) */}
                <div className="card-face card-face-back absolute inset-0 rounded-3xl border-2 border-amber-400/60 bg-gradient-to-br from-[#0c2417] via-[#05130b] to-black p-4 flex flex-col items-center justify-between shadow-2xl overflow-hidden">
                  <div className="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(#CCFF00_1px,transparent_1px)] [background-size:12px_12px]" />
                  <div className="w-full text-center">
                    <span className="font-athletic text-[9px] font-bold uppercase tracking-[0.2em] text-amber-400">
                      LIGA DA PELADA
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-500/20 text-3xl shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                      ⚽
                    </div>
                    <span className="mt-2 font-athletic text-lg font-black italic text-white">BQ CARD</span>
                  </div>

                  <div className="w-full text-center border-t border-white/10 pt-1">
                    <span className="text-[8px] text-muted uppercase tracking-widest font-mono">
                      SPECIAL ABILITY
                    </span>
                  </div>
                </div>

                {/* FRENTE DA CARTA (Frontface - Com Arte Customizada ou Design Vetorial) */}
                <button
                  type="button"
                  onClick={() => onSelectCard(card)}
                  className={`card-face card-face-front absolute inset-0 group flex flex-col justify-between rounded-3xl border-2 ${
                    rarityInfo.border
                  } ${rarityInfo.bg} p-4 text-left shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                    rarityInfo.glow
                  } overflow-hidden`}
                >
                  {/* Se tiver imagem customizada aprovada */}
                  {hasImage ? (
                    <div className="relative w-full h-full flex flex-col justify-between">
                      <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-white/10">
                        <Image
                          src={customArtUrl!}
                          alt={card.name}
                          fill
                          sizes="(max-width: 640px) 100vw, 50vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={() => handleImageError(card.slug)}
                        />
                        <div className="absolute top-2 right-2 z-10">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase shadow-md ${rarityInfo.badgeBg}`}
                          >
                            {rarityInfo.icon} {rarityInfo.label}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <h3 className={`font-athletic text-base font-black uppercase italic ${rarityInfo.text}`}>
                          {card.name}
                        </h3>
                        <p className="text-[11px] text-muted leading-tight line-clamp-2 mt-0.5">
                          {card.description}
                        </p>
                      </div>

                      <div className="mt-2 pt-2 border-t border-white/10 text-center">
                        <span className="block w-full rounded-xl bg-white/10 py-1.5 text-[10px] font-black uppercase tracking-wider text-white group-hover:bg-accent group-hover:text-background transition-colors">
                          Escolher esta carta →
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Renderização Vetorial Premium (Fallback padrão de alta fidelidade) */
                    <div className="flex flex-col justify-between h-full">
                      <div>
                        {/* Topo: Ícone e Badge */}
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-3xl drop-shadow-md">{card.icon}</span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase shadow-sm ${rarityInfo.badgeBg}`}
                          >
                            {rarityInfo.icon} {rarityInfo.label}
                          </span>
                        </div>

                        {/* Nome da Carta */}
                        <h3 className={`mt-3 font-athletic text-lg font-black uppercase italic ${rarityInfo.text}`}>
                          {card.name}
                        </h3>

                        {/* Descrição do Efeito */}
                        <p className="mt-1.5 text-xs text-slate-200 leading-relaxed font-sans">
                          {card.description}
                        </p>
                      </div>

                      {/* Tag de Requisito de Alvo */}
                      <div className="my-2">
                        {card.requiresTarget === "SINGLE_PLAYER" && (
                          <span className="inline-block rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] text-muted">
                            🎯 Requer 1 jogador da escalação
                          </span>
                        )}
                        {card.requiresTarget === "DUO_PLAYERS" && (
                          <span className="inline-block rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] text-muted">
                            👥 Requer 2 jogadores da escalação
                          </span>
                        )}
                        {card.requiresTarget === "PREDICTION_TYPE" && (
                          <span className="inline-block rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] text-muted">
                            🔮 Requer palpite da rodada
                          </span>
                        )}
                      </div>

                      {/* Botão de Escolha */}
                      <div className="pt-2 border-t border-white/10 text-center">
                        <span className="block w-full rounded-xl bg-white/10 py-2 text-[10px] font-black uppercase tracking-wider text-white group-hover:bg-accent group-hover:text-background transition-colors shadow-sm">
                          Escolher esta carta →
                        </span>
                      </div>
                    </div>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
