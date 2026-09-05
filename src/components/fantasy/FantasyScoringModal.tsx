"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Crown,
  HelpCircle,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
} from "@/components/icons";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { type FantasySettings } from "@/lib/fantasy/config";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  settings: FantasySettings;
};

export function FantasyScoringModal({ isOpen, onClose, settings }: Props) {
  const [activeTab, setActiveTab] = useState<"positions" | "base" | "bonuses">("positions");
  const [mounted, setMounted] = useState(false);

  useDialogViewport(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="mobile-dialog-backdrop z-[99999] bg-black/90 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sistema de Pontuação do Cartola"
    >
      <div
        className="relative flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07160d] shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative border-b border-white/10 bg-gradient-to-r from-accent/15 via-black/40 to-emerald-950/40 p-5 sm:p-6 pb-4">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-background shadow-lg shadow-accent/30 font-black">
              ⚡
            </span>
            <div>
              <span className="rounded bg-accent/20 px-2 py-0.5 font-athletic text-[9px] font-black uppercase tracking-wider text-accent">
                Guia Oficial
              </span>
              <h2 className="font-athletic text-lg font-black uppercase italic tracking-tight text-white mt-0.5">
                Sistema de Pontuação
              </h2>
            </div>
          </div>

          <p className="mt-2 text-xs text-muted leading-relaxed">
            Primeiro vêm os oito scouts do que aconteceu em campo; depois, o bônus da vaga que você escolheu. O mesmo cálculo vale no ao vivo e no fechamento.
          </p>

          {/* Abas Internas */}
          <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-black/60 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab("positions")}
              className={`rounded-lg py-1.5 px-2 text-center text-[10px] font-black uppercase transition-all ${
                activeTab === "positions"
                  ? "bg-accent text-background shadow-sm"
                  : "text-muted hover:text-white"
              }`}
            >
              ⚡ Bônus de Posição
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("base")}
              className={`rounded-lg py-1.5 px-2 text-center text-[10px] font-black uppercase transition-all ${
                activeTab === "base"
                  ? "bg-accent text-background shadow-sm"
                  : "text-muted hover:text-white"
              }`}
            >
              ⚽ Scouts Básicos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("bonuses")}
              className={`rounded-lg py-1.5 px-2 text-center text-[10px] font-black uppercase transition-all ${
                activeTab === "bonuses"
                  ? "bg-accent text-background shadow-sm"
                  : "text-muted hover:text-white"
              }`}
            >
              👑 Capitão & Extras
            </button>
          </div>
        </div>

        {/* Conteúdo com Scroll */}
        <div
          className="mobile-dialog-scroll flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 touch-pan-y overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {/* ABA 1: BÔNUS POR POSIÇÃO */}
          {activeTab === "positions" && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-accent/30 bg-accent/10 p-3 text-xs text-emerald-100/90 leading-relaxed">
                💡 <strong>Como escalar:</strong> escolha 1 GOL, 2 DEF e complete com <strong>2 MEI/ALA + 1 ATA</strong> ou <strong>1 MEI/ALA + 2 ATA</strong>. DEF, MEI e ATA precisam coincidir com a tag oficial. A vaga GOL é livre: você aposta em quem deve atuar melhor no rodízio do gol.
              </div>

              {/* 1. Defensores (DEF) */}
              <div className="rounded-2xl border border-blue-500/25 bg-blue-950/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-300 font-black text-xs">
                      DEF
                    </span>
                    <span className="font-athletic text-sm font-black uppercase text-blue-200">
                      Zagueiro & Proteção
                    </span>
                  </div>
                  <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[9px] font-black text-blue-300">
                    Teto de +10
                  </span>
                </div>
                <div className="space-y-1 text-xs text-muted">
                  <div className="flex justify-between py-0.5 border-b border-white/5">
                    <span>🧱 0 gols sofridos jogando na linha:</span>
                    <strong className="text-accent font-black">+1.5 pts</strong>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-white/5">
                    <span>🛡️ Exatamente 1 gol sofrido na linha:</span>
                    <strong className="text-blue-300 font-black">+0.5 pt</strong>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>🏰 Muralha com 3+ clean sheets:</span>
                    <strong className="text-accent font-black">+3.0 pts uma vez</strong>
                  </div>
                </div>
              </div>

              {/* 2. Meias / Alas (MEI) */}
              <div className="rounded-2xl border border-warning/25 bg-yellow-950/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/20 text-warning font-black text-xs">
                      MEI
                    </span>
                    <span className="font-athletic text-sm font-black uppercase text-yellow-200">
                      Meia, Ala & Armação
                    </span>
                  </div>
                  <span className="rounded bg-warning/20 px-2 py-0.5 text-[9px] font-black text-warning">
                    Maestro da Rodada
                  </span>
                </div>
                <div className="space-y-1 text-xs text-muted">
                  <div className="flex justify-between py-0.5 border-b border-white/5">
                    <span>🎯 Assistência: +2.5 base +1 na vaga MEI</span>
                    <strong className="text-accent font-black">+3.5 pts / assist</strong>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-white/5">
                    <span>🪄 Bônus Maestro (2+ assistências):</span>
                    <strong className="text-warning font-black">+3.0 pts extras</strong>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>⚽ Gol marcado (scout base):</span>
                    <strong className="text-foreground font-black">+{settings.goalPoints.toFixed(1)} pts</strong>
                  </div>
                </div>
              </div>

              {/* 3. Atacantes (ATA) */}
              <div className="rounded-2xl border border-danger/25 bg-red-950/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/20 text-danger font-black text-xs">
                      ATA
                    </span>
                    <span className="font-athletic text-sm font-black uppercase text-red-200">
                      Atacante & Finalização
                    </span>
                  </div>
                  <span className="rounded bg-danger/20 px-2 py-0.5 text-[9px] font-black text-danger">
                    Artilheiro da Rodada
                  </span>
                </div>
                <div className="space-y-1 text-xs text-muted">
                  <div className="flex justify-between py-0.5 border-b border-white/5">
                    <span>⚽ Gol marcado (scout base):</span>
                    <strong className="text-accent font-black">+{settings.goalPoints.toFixed(1)} pts / gol</strong>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-white/5">
                    <span>🔥 Bônus Artilheiro (2+ gols):</span>
                    <strong className="text-danger font-black">+3.0 pts extras</strong>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>🎯 Assistência:</span>
                    <strong className="text-foreground font-black">+{settings.assistPoints.toFixed(1)} pts</strong>
                  </div>
                </div>
              </div>

              {/* 4. Goleiro no Rodízio (GOL) */}
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 font-black text-xs">
                      GOL
                    </span>
                    <span className="font-athletic text-sm font-black uppercase text-emerald-200">
                      Paredão no Rodízio
                    </span>
                  </div>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black text-emerald-300">
                    Qualquer Jogador
                  </span>
                </div>
                <div className="space-y-1 text-xs text-muted">
                  <div className="flex justify-between py-0.5 border-b border-white/5">
                    <span>🧤 Atuação real no gol (scout base):</span>
                    <strong className="text-accent font-black">+{settings.goalkeeperAppearancePoints.toFixed(1)} pts / jogo</strong>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-white/5">
                    <span>🧱 Clean sheet: escalado GOL e atuou no gol:</span>
                    <strong className="text-accent font-black">+4.0 pts / jogo</strong>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-white/5">
                    <span>🥅 Gol sofrido enquanto goleiro:</span>
                    <strong className="text-danger font-black">{settings.goalConcededPoints.toFixed(1)} pt / gol</strong>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>📌 Se não atuar no gol, não recebe o clean sheet:</span>
                    <strong className="text-foreground font-black">0.0 pt</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: SCOUTS BÁSICOS */}
          {activeTab === "base" && (
            <div className="space-y-3">
              <p className="text-xs text-muted leading-relaxed">
                Scouts são pontos do atleta e contam onde ele estiver escalado. O bônus de posição é separado e só depende da vaga correta.
              </p>

              <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden text-xs">
                <div className="grid grid-cols-2 p-3 border-b border-white/10 font-black uppercase text-[10px] text-muted">
                  <span>Ação / Evento</span>
                  <span className="text-right">Pontuação</span>
                </div>

                <div className="divide-y divide-white/5">
                  <div className="flex items-center justify-between p-3">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      ⚽ Gol Marcado
                    </span>
                    <span className="font-black text-accent">+{settings.goalPoints.toFixed(1)} pts</span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      🎯 Assistência (Passe para Gol)
                    </span>
                    <span className="font-black text-accent">+{settings.assistPoints.toFixed(1)} pts</span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      🏆 Vitória do Time
                    </span>
                    <span className="font-black text-success">+{settings.winPoints.toFixed(1)} pts</span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      ❌ Derrota do Time
                    </span>
                    <span className="font-black text-danger">{settings.lossPoints.toFixed(1)} pts</span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      🧤 Jogo como goleiro real
                    </span>
                    <span className="font-black text-accent">+{settings.goalkeeperAppearancePoints.toFixed(1)} pts / jogo</span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      🤝 Empate
                    </span>
                    <span className="font-black text-success">+{settings.drawPoints.toFixed(1)} pt</span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      🥅 Gol sofrido como goleiro real
                    </span>
                    <span className="font-black text-danger">{settings.goalConcededPoints.toFixed(1)} pt / gol</span>
                  </div>

                  <div className="flex items-center justify-between p-3">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      🧱 DEF jogando na linha (bônus da vaga)
                    </span>
                    <span className="font-black text-blue-300">+1.5 (SG) / +0.5 (1 sofrido), teto +10</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: CAPITÃO & EXTRAS */}
          {activeTab === "bonuses" && (
            <div className="space-y-3 text-xs">
              {/* Capitão */}
              <div className="rounded-2xl border border-yellow-400/30 bg-yellow-950/20 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-yellow-400/20 text-yellow-400">
                    <Crown className="h-4 w-4" />
                  </span>
                  <span className="font-athletic text-sm font-black uppercase text-yellow-300">
                    Braçadeira de Capitão (1.5x)
                  </span>
                </div>
                <p className="text-muted leading-relaxed">
                  O jogador escolhido como Capitão tem <strong>toda a sua pontuação da rodada multiplicada por 1.5x</strong>. Vale a pena apostar em zagueiros seguros, meias garçons ou atacantes goleadores!
                </p>
              </div>

              {/* Palpites */}
              <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20 text-accent">
                    <Target className="h-4 w-4" />
                  </span>
                  <span className="font-athletic text-sm font-black uppercase text-accent">
                    Palpites da Rodada
                  </span>
                </div>
                <p className="text-muted leading-relaxed">
                  Antes do mercado fechar, escolha quem será o <strong>Artilheiro</strong> e o <strong>Garçom</strong>. Cada acerto rende respectivamente <strong>+{settings.topScorerPredictionPoints.toFixed(1)}</strong> e <strong>+{settings.topAssistPredictionPoints.toFixed(1)} pts</strong>.
                </p>
              </div>

              {/* Cartas Especiais */}
              <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300">
                    🃏
                  </span>
                  <span className="font-athletic text-sm font-black uppercase text-purple-200">
                    Cartas & Desafios Especiais
                  </span>
                </div>
                <p className="text-muted leading-relaxed">
                  Abra pacotes no Cartola e ative cartas táticas no seu elenco (como <em>Paredão</em>, <em>Goleada</em> ou <em>Dupla Dinâmica</em>) para multiplicar pontos de ações específicas!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 bg-black/50 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.25)] transition-transform active:scale-95 hover:bg-accent/90"
          >
            Entendido, vamos jogar!
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
