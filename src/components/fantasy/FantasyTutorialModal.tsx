"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Crown,
  HelpCircle,
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
  useDialogViewport(isOpen);

  if (!isOpen) return null;

  const steps = [
    {
      icon: <Users className="h-8 w-8 text-accent" />,
      tag: "Passo 1 de 4",
      title: "Monte seu Quinteto Ideal",
      description:
        "Você tem um orçamento em C$ (Cartoletas) para escalar 5 jogadores. Analise os preços, as médias de pontos e as últimas partidas para montar a melhor estratégia.",
    },
    {
      icon: <Crown className="h-8 w-8 text-yellow-400" />,
      tag: "Passo 2 de 4",
      title: "Defina o seu Capitão",
      description:
        "Toque na coroa ao lado de um dos seus 5 jogadores escalados para torná-lo Capitão. A pontuação dele será multiplicada na rodada!",
    },
    {
      icon: <Target className="h-8 w-8 text-warning" />,
      tag: "Passo 3 de 4",
      title: "Palpites e Desafio da Rodada",
      description:
        "Aposte em quem será o Artilheiro e o Garçom da rodada. Cumpra também o Desafio da Rodada sorteado para acumular muitos pontos extras.",
    },
    {
      icon: <TrendingUp className="h-8 w-8 text-emerald-400" />,
      tag: "Passo 4 de 4",
      title: "Valorize seu Patrimônio",
      description:
        "Jogadores que superam as expectativas valorizam e aumentam seu caixa C$. Se jogarem mal, desvalorizam. Venda na alta e compre na baixa para enriquecer seu time!",
    },
  ];

  const current = steps[step - 1];

  return (
    <div
      className="mobile-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Tutorial do Cartola"
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
        <div className="flex items-center gap-1.5 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i === step ? "bg-accent" : i < step ? "bg-accent/40" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Ícone */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_30px_rgba(204,255,0,0.15)]">
          {current.icon}
        </div>

        <div className="mt-4 text-center">
          <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-accent">
            {current.tag}
          </span>
          <h2 className="mt-1 font-athletic text-2xl font-black uppercase italic leading-tight text-white">
            {current.title}
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {current.description}
          </p>
        </div>

        {/* Ações */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-muted hover:text-white transition-colors"
            >
              Anterior
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-3 text-xs font-bold text-muted hover:text-white transition-colors"
            >
              Pular
            </button>
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.2)] transition-transform active:scale-95"
            >
              Próximo <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.2)] transition-transform active:scale-95"
            >
              <CheckCircle2 className="h-4 w-4" /> Entendido, vamos jogar!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
