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
    }, 250);

    const t2 = setTimeout(() => {
      setFlippedCards([true, true]);
    }, 550);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  function handleImageError(slug: string) {
    setImageErrors((prev) => ({ ...prev, [slug]: true }));
  }

  return (
    <div className="space-y-4 animate-fade-in w-full">
      {/* TÍTULO DE INSTRUÇÃO */}
      <div className="text-center">
        <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-amber-300 flex items-center justify-center gap-1">
          <Sparkles className="h-3 w-3 text-amber-400" /> Escolha 1 de 2
        </span>
        <h2 className="font-athletic text-xl sm:text-2xl font-black uppercase italic text-white">
          Cartas Sorteadas
        </h2>
        <p className="text-[11px] text-muted max-w-xs mx-auto">
          Toque na carta que deseja guardar no seu inventário. A outra será descartada.
        </p>
      </div>

      {/* GRID LADO A LADO (2 COLUNAS SEMPRE: MOBILE E DESKTOP) */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 pt-1 w-full max-w-md mx-auto">
        {offers.map((card, idx) => {
          const rarityInfo = RARITY_CONFIG[card.rarity];
          const isFlipped = flippedCards[idx];
          const customArtUrl = getCardArtUrl(card.slug);
          const hasImage = customArtUrl && !imageErrors[card.slug];

          return (
            <div
              key={card.slug + idx}
              className={`card-perspective-container w-full ${
                idx === 0 ? "animate-card-float-1" : "animate-card-float-2"
              }`}
            >
              <div
                className={`relative w-full h-[360px] sm:h-[400px] card-3d-flipper ${
                  isFlipped ? "is-flipped" : ""
                }`}
              >
                {/* COSTAS DA CARTA (Backface Colecionável BQ) */}
                <div className="card-face card-face-back absolute inset-0 rounded-2xl sm:rounded-3xl border-2 border-amber-400/60 bg-gradient-to-br from-[#0c2417] via-[#05130b] to-black p-3.5 flex flex-col items-center justify-between shadow-2xl overflow-hidden">
                  <div className="pointer-events-none absolute inset-0 opacity-20 bg-[radial-gradient(#CCFF00_1px,transparent_1px)] [background-size:10px_10px]" />
                  
                  {/* Topo Verso */}
                  <div className="w-full text-center border-b border-amber-400/30 pb-1">
                    <span className="font-athletic text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300">
                      LIGA DA PELADA
                    </span>
                  </div>

                  {/* Centro Verso */}
                  <div className="flex flex-col items-center justify-center my-auto">
                    <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/30 to-black text-3xl sm:text-4xl shadow-[0_0_25px_rgba(245,158,11,0.35)]">
                      ⚽
                    </div>
                    <span className="mt-2 font-athletic text-base sm:text-lg font-black italic tracking-wider text-white">
                      BQ CARD
                    </span>
                    <span className="font-athletic text-[8px] font-bold uppercase tracking-[0.15em] text-accent">
                      CARTOLA V3
                    </span>
                  </div>

                  {/* Rodapé Verso */}
                  <div className="w-full text-center border-t border-white/10 pt-1">
                    <span className="text-[8px] text-muted uppercase tracking-widest font-mono">
                      SPECIAL ABILITY
                    </span>
                  </div>
                </div>

                {/* FRENTE DA CARTA (FRENTE ESTILO CARD GAME ESPORTIVO PREMIUM) */}
                <button
                  type="button"
                  onClick={() => onSelectCard(card)}
                  className={`card-face card-face-front absolute inset-0 group flex flex-col justify-between rounded-2xl sm:rounded-3xl border-2 ${
                    rarityInfo.border
                  } ${
                    rarityInfo.bg
                  } p-2.5 sm:p-3 text-left shadow-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.97] ${
                    rarityInfo.glow
                  } overflow-hidden`}
                >
                  {/* Textura sutil de fundo */}
                  <div className="pointer-events-none absolute inset-0 opacity-15 bg-[radial-gradient(rgba(255,255,255,0.15)_1px,transparent_1px)] [background-size:8px_8px]" />

                  {/* SEÇÃO 1: CABEÇALHO DO CARD COM RARIDADE */}
                  <div className="relative z-10 flex items-center justify-between gap-1 border-b border-white/10 pb-1.5">
                    <span className="text-xl sm:text-2xl drop-shadow-md">{card.icon}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider shadow-sm ${rarityInfo.badgeBg}`}
                    >
                      {rarityInfo.icon} {rarityInfo.label}
                    </span>
                  </div>

                  {/* SEÇÃO 2: ÁREA VISUAL CENTRAL (ARTE OU EMBLEMA DA CARTA) */}
                  <div className="relative z-10 my-auto flex flex-col items-center justify-center py-1">
                    {hasImage ? (
                      /* Imagem Customizada */
                      <div className="relative w-full h-28 sm:h-32 rounded-xl overflow-hidden border border-white/15 shadow-inner">
                        <Image
                          src={customArtUrl!}
                          alt={card.name}
                          fill
                          sizes="(max-width: 640px) 50vw, 220px"
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={() => handleImageError(card.slug)}
                        />
                      </div>
                    ) : (
                      /* Emblema Vetorial Estilo Card Game */
                      <div className="relative flex flex-col items-center justify-center w-full py-1">
                        <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border-2 border-white/15 bg-gradient-to-br from-white/10 via-black/40 to-black/80 text-3xl sm:text-4xl shadow-[0_0_20px_rgba(0,0,0,0.6)] group-hover:rotate-3 transition-transform">
                          {card.icon}
                          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-transparent via-white/10 to-transparent" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SEÇÃO 3: NOME DA CARTA E HABILIDADE */}
                  <div className="relative z-10 space-y-1">
                    {/* Placa do Nome */}
                    <div className="rounded-lg bg-black/40 border border-white/10 py-1 px-1.5 text-center backdrop-blur-sm">
                      <h3
                        className={`font-athletic text-xs sm:text-sm font-black uppercase italic tracking-wide truncate ${rarityInfo.text}`}
                      >
                        {card.name}
                      </h3>
                    </div>

                    {/* Descrição Compacta */}
                    <p className="text-[10px] sm:text-[11px] text-slate-200 leading-tight line-clamp-3 font-sans text-center min-h-[2.5rem]">
                      {card.description}
                    </p>

                    {/* Tag de Alvo se houver */}
                    {card.requiresTarget === "SINGLE_PLAYER" && (
                      <span className="block text-center rounded bg-white/5 border border-white/10 py-0.5 text-[8px] text-muted">
                        🎯 1 Jogador
                      </span>
                    )}
                    {card.requiresTarget === "DUO_PLAYERS" && (
                      <span className="block text-center rounded bg-white/5 border border-white/10 py-0.5 text-[8px] text-muted">
                        👥 2 Jogadores
                      </span>
                    )}
                    {card.requiresTarget === "PREDICTION_TYPE" && (
                      <span className="block text-center rounded bg-white/5 border border-white/10 py-0.5 text-[8px] text-muted">
                        🔮 Palpite
                      </span>
                    )}
                  </div>

                  {/* SEÇÃO 4: BOTÃO DE ESCOLHA NO RODAPÉ */}
                  <div className="relative z-10 mt-1 pt-1.5 border-t border-white/10 text-center">
                    <span className="block w-full rounded-xl bg-white/15 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-white group-hover:bg-accent group-hover:text-background transition-all shadow-md">
                      Escolher →
                    </span>
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
