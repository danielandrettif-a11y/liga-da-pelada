"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles, Trophy } from "@/components/icons";
import type { FantasyPackDTO } from "@/lib/actions/fantasy-cards";

const FantasyPackOpeningModal = dynamic(
  () => import("./FantasyPackOpeningModal").then((mod) => mod.FantasyPackOpeningModal),
  { ssr: false },
);

type Props = {
  packs: FantasyPackDTO[];
  onPackClaimed?: () => void;
};

export function FantasyPackClaimBanner({ packs, onPackClaimed }: Props) {
  const [selectedPack, setSelectedPack] = useState<FantasyPackDTO | null>(null);

  if (!packs || packs.length === 0) return null;

  const currentPack = packs[0];

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-amber-400/50 bg-gradient-to-r from-amber-500/20 via-[#07170e] to-emerald-500/20 p-4 sm:p-5 shadow-[0_0_35px_rgba(245,158,11,0.2)] animate-fade-in-up">
        {/* Fundo com iluminação */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-400/20 blur-2xl animate-pulse" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-accent/15 blur-2xl" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/20 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.3)] text-2xl">
              🎁
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-athletic text-xs font-black uppercase italic tracking-[0.2em] text-amber-300 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Recompensa Disponível
                </span>
                <span className="rounded-full bg-amber-500/25 border border-amber-400/40 px-2 py-0.5 text-[9px] font-black uppercase text-amber-300">
                  {packs.length} {packs.length === 1 ? "Pacote" : "Pacotes"}
                </span>
              </div>

              <h3 className="mt-0.5 font-athletic text-lg font-black uppercase italic text-white">
                {currentPack.roundNumber
                  ? `Pacote da Rodada ${String(currentPack.roundNumber).padStart(2, "0")}`
                  : "Pacote da Rodada Finalizada"}
              </h3>
              <p className="text-xs text-muted">
                Você participou da rodada! Abra agora para sortear 2 cartas e escolher 1 para o seu inventário.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedPack(currentPack)}
            className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-[#05130b] shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:brightness-110 active:scale-95 transition-all"
          >
            <span>Abrir Pacote</span>
            <span className="text-base">✨</span>
          </button>
        </div>
      </section>

      {/* Modal de Abertura */}
      {selectedPack && (
        <FantasyPackOpeningModal
          pack={selectedPack}
          isOpen={Boolean(selectedPack)}
          onClose={() => setSelectedPack(null)}
          onSuccess={() => {
            setSelectedPack(null);
            onPackClaimed?.();
          }}
        />
      )}
    </>
  );
}
