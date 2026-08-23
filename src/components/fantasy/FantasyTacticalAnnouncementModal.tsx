"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Shield, Target, Trophy, Users, X, ChevronRight } from "@/components/icons";

export function FantasyTacticalAnnouncementModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("fantasy_tactical_v3_r2_seen");
    if (!seen) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("fantasy_tactical_v3_r2_seen", "true");
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
              A partir da Rodada 02
            </span>
            <h2 className="font-athletic text-lg font-black uppercase italic tracking-tight text-white mt-0.5">
              Revolução Tática no Cartola!
            </h2>
          </div>
        </div>

        <p className="text-xs text-muted leading-relaxed mb-4">
          O Cartola evoluiu para uma <strong>formação tática real (1-2-1-2)</strong> com bônus de pontuação exclusivos para cada posição da pelada.
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
                <span className="font-black text-accent text-[10px]">+4,0 / +2,0 pts</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                <strong>Clean Sheet Regressivo:</strong> Ganha <strong>+4,0 pts</strong> se a zaga não tomar gol e <strong>+2,0 pts</strong> se tomar só 1 gol. Zaga consistente garante pontuação alta!
              </p>
            </div>
          </div>

          {/* 2. Meio / Ala */}
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/10 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
              <Target className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-warning">Armação & Passes (MEI/ALA)</span>
                <span className="font-black text-accent text-[10px]">+4,0 pts / assist + bônus</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                Assistência valorizada a <strong>+4,0 pts</strong> e ganha <strong>+3,0 pts extras</strong> de Maestro da Rodada se der 2 ou mais assistências!
              </p>
            </div>
          </div>

          {/* 3. Atacantes */}
          <div className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger/10 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-danger/20 text-danger">
              <Trophy className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-danger">Finalização (ATA)</span>
                <span className="font-black text-accent text-[10px]">5,0 pts / gol + bônus</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                Gol vale <strong>5,0 pts</strong> e ganha <strong>+3,0 pts extras</strong> de Artilheiro se fizer 2 ou mais gols na rodada!
              </p>
            </div>
          </div>

          {/* 4. Goleiros no Rodízio */}
          <div className="flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent/10 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-accent">Paredão no Rodízio (GOL)</span>
                <span className="font-black text-accent text-[10px]">+3,0 pres / +4,0 SG</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                Qualquer atleta na vaga de GOL ganha <strong>+3,0 pts</strong> por partida agarrada, <strong>+4,0 pts</strong> sem sofrer gol e <strong>imunidade total de derrota</strong> na trave!
              </p>
            </div>
          </div>
        </div>

        {/* Chamada para o perfil */}
        <div className="rounded-2xl border border-accent/35 bg-gradient-to-r from-accent/15 via-[#0c2415] to-surface p-3 mb-4">
          <p className="text-[11px] font-bold text-foreground leading-snug">
            ⚠️ <strong>Atualize sua Posição no Perfil:</strong> Vá em <em>Meu Perfil</em> e garanta que sua tag (DEF, MEI/ALA ou ATA) está correta para pontuar com os bônus!
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
