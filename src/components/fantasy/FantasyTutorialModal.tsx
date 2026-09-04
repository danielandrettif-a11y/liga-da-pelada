"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronRight,
  Crown,
  HelpCircle,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
} from "@/components/icons";

import { useDialogViewport } from "@/lib/useDialogViewport";

export function FantasyTutorialModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1);
  const [mounted, setMounted] = useState(false);
  useDialogViewport(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  const steps = [
    {
      icon: <Users className="h-8 w-8 text-accent" />,
      tag: "Passo 1 de 5",
      title: "Monte seu Time Ideal",
      description:
        "Você tem um orçamento em C$ (Cartoletas) para escalar seus jogadores. Analise os preços, as médias de pontos e as últimas partidas para montar a melhor estratégia.",
    },
    {
      icon: <Crown className="h-8 w-8 text-yellow-400" />,
      tag: "Passo 2 de 5",
      title: "Defina o seu Capitão",
      description:
        "Toque na coroa ao lado de um dos seus jogadores escalados para torná-lo Capitão. A pontuação dele será multiplicada na rodada!",
    },
    {
      icon: <Sparkles className="h-8 w-8 text-accent" />,
      tag: "Passo 3 de 5 · Bônus de Posição",
      title: "Esquemas & Bônus de Posição",
      description:
        "Com 6 atletas, escolha 1 GOL, 2 DEF e complete com 2 MEI/ALA + 1 ATA ou 1 MEI/ALA + 2 ATA.\n\n• 🛡️ DEF: +1,5 por clean sheet de linha, +0,5 com exatamente 1 gol sofrido, Muralha +3 com 3+ clean sheets e teto +10.\n• 🪄 MEI: assistência vale +2,5 base; na vaga MEI recebe +1 e 2+ assistências dão +3 de Maestro.\n• 🎯 ATA: gol vale +4; 2+ gols na vaga ATA dão +3 de Artilheiro.\n• 🧤 GOL: atuação real vale +2 e gol sofrido -1; o +4 de clean sheet só vem quando ele realmente atuou no gol sem sofrer gol.",
    },
    {
      icon: <Target className="h-8 w-8 text-warning" />,
      tag: "Passo 4 de 5",
      title: "Palpites e Desafio da Rodada",
      description:
        "Aposte em quem será o Artilheiro e o Garçom da rodada. Cumpra também o Desafio da Rodada sorteado para acumular muitos pontos extras.",
    },
    {
      icon: <TrendingUp className="h-8 w-8 text-emerald-400" />,
      tag: "Passo 5 de 5",
      title: "Valorize seu Patrimônio",
      description:
        "Jogadores que superam as expectativas valorizam e aumentam seu caixa C$. Se jogarem mal, desvalorizam. Venda na alta e compre na baixa para enriquecer seu time!",
    },
  ];

  const current = steps[step - 1];

  return createPortal(
    <div
      className="mobile-dialog-backdrop z-[99999] bg-black/90 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial do Cartola"
    >
      <div
        className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-6 shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fechar */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Fechar tutorial"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Indicador de Passos */}
        <div className="flex items-center gap-1.5 mb-3.5 pr-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i === step ? "bg-accent shadow-[0_0_8px_rgba(204,255,0,0.5)]" : i < step ? "bg-accent/40" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Ícone */}
        <div className="mx-auto mt-1 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_20px_rgba(204,255,0,0.15)]">
          {current.icon}
        </div>

        <div className="mt-3 text-center">
          <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-accent">
            {current.tag}
          </span>
          <h2 className="mt-0.5 font-athletic text-xl font-black uppercase italic leading-tight text-white">
            {current.title}
          </h2>
          <p className="mt-2.5 text-xs leading-relaxed text-muted">
            {current.description}
          </p>
        </div>

        {/* Ações */}
        <div className="mt-5 flex items-center justify-between gap-2.5 pt-3 border-t border-border/40">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-muted hover:text-white transition-colors"
            >
              Anterior
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-muted hover:text-white transition-colors"
            >
              Pular
            </button>
          )}

          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.25)] transition-transform active:scale-95"
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.25)] transition-transform active:scale-95"
            >
              <CheckCircle2 className="h-4 w-4" /> Vamos jogar!
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
