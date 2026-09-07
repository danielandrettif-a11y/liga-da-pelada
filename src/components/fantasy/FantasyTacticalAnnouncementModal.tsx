"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Shield, Target, Trophy, Users, X, ChevronRight } from "@/components/icons";

export function FantasyTacticalAnnouncementModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("fantasy_tactical_v6_wing_seen");
    if (!seen) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("fantasy_tactical_v6_wing_seen", "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-accent/30 bg-[#07160d] p-5 sm:p-6 shadow-[0_25px_60px_rgba(0,0,0,0.9)] text-foreground">
        {/* Glow de fundo */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />

        {/* Botão fechar */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-muted hover:text-white hover:bg-white/20 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Cabeçalho */}
        <div className="flex items-center gap-2.5 mb-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-background shadow-lg shadow-accent/30">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <span className="rounded bg-accent/20 px-2 py-0.5 font-athletic text-[9px] font-black uppercase tracking-wider text-accent">
              Guia atualizado
            </span>
            <h2 className="font-athletic text-lg font-black uppercase italic tracking-tight text-white mt-0.5">
              Revolução Tática no Cartola!
            </h2>
          </div>
        </div>

        <p className="text-xs text-muted leading-relaxed mb-4">
          A partir da Rodada 4, ALA é uma posição própria. Escale <strong>1 GOL, 2 DEF</strong> e escolha entre as formações Equilibrada, Clássica, Pelas pontas ou Ofensiva. A vaga certa ativa o bônus BQ v6.
        </p>

        {/* Grid de Novidades */}
        <div className="space-y-2.5 mb-5 max-h-[320px] overflow-y-auto pr-1">
          {/* 1. Defensores */}
          <div className="flex items-start gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-blue-300">Zaga & Proteção (DEF)</span>
                <span className="font-black text-accent text-[10px]">+1,25 / +0,5 pts</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                Na vaga DEF, jogar na linha sem sofrer gol vale <strong>+1,25</strong>; sofrer exatamente um vale <strong>+0,5</strong>. Três clean sheets ativam Muralha (+2,5 uma vez), com teto de <strong>+8</strong>.
              </p>
            </div>
          </div>

          {/* 2. Meio */}
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/10 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
              <Target className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-warning">Armação & Passes (MEI)</span>
                <span className="font-black text-accent text-[10px]">+0,75 / assist</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                Na vaga MEI, cada assistência recebe <strong>+0,75</strong>. Com 2+ assistências, há <strong>+2,5</strong> de Maestro, respeitando o teto de +6.
              </p>
            </div>
          </div>

          {/* 3. Alas */}
          <div className="flex items-start gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-violet-300">Vai e Volta (ALA)</span>
                <span className="font-black text-accent text-[10px]">Teto +6</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                Gol, assistência e recomposição somam bônus. Duas ações ofensivas e duas defensivas ativam <strong>+2</strong> de Vai e Volta.
              </p>
            </div>
          </div>

          {/* 4. Atacantes */}
          <div className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger/10 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-danger/20 text-danger">
              <Trophy className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-danger">Finalização (ATA)</span>
                <span className="font-black text-accent text-[10px]">+0,5 / gol</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                Além dos 4,0 pts base, cada gol na vaga ATA recebe <strong>+0,5</strong>. Com 2+ gols, Artilheiro dá <strong>+2</strong>, com teto de +4.
              </p>
            </div>
          </div>

          {/* 5. Goleiros no Rodízio */}
          <div className="flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent/10 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-accent">Paredão no Rodízio (GOL)</span>
                <span className="font-black text-accent text-[10px]">+2,0 pres / +4,0 SG</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                Qualquer atleta pode ser a sua aposta. Quem <strong>realmente atuar no gol</strong> ganha +2 base e -1 por gol sofrido. Se você o escalou em GOL e ele não sofreu gol, ganha <strong>+4,0 pts por clean sheet</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Chamada para o perfil */}
        <div className="rounded-2xl border border-accent/35 bg-gradient-to-r from-accent/15 via-[#0c2415] to-surface p-3 mb-4">
          <p className="text-[11px] font-bold text-foreground leading-snug">
            ⚠️ <strong>Confira sua posição:</strong> antes do fechamento da Rodada 4, escolha entre DEF, MEI, ALA ou ATA. Depois disso, a posição fica travada na temporada; administradores podem corrigir exceções.
          </p>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <Link
            href="/meu-perfil"
            onClick={handleClose}
            className="flex w-full sm:flex-1 items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/20 px-4 py-2.5 text-xs font-black uppercase text-accent hover:bg-accent hover:text-background transition-all"
          >
            <span>Conferir Meu Perfil</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={handleClose}
            className="flex w-full sm:w-auto items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-xs font-black uppercase text-background shadow-md hover:bg-accent/90 transition-transform active:scale-95"
          >
            Entendido!
          </button>
        </div>
      </div>
    </div>
  );
}
