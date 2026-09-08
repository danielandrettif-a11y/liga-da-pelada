"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Sparkles, X, ChevronRight } from "@/components/icons";

export function CallupTacticalAlertModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("callup_tactical_alert_r2_seen");
    if (!seen) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("callup_tactical_alert_r2_seen", "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-accent/40 bg-[#07170e] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] text-foreground">
        {/* Glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />

        {/* Botão fechar */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full bg-white/10 p-1.5 text-muted hover:text-white transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Ícone e Título */}
        <div className="flex items-center gap-3 mb-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-background shadow-lg shadow-accent/30">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <span className="rounded bg-accent/20 px-2 py-0.5 font-athletic text-[9px] font-black uppercase text-accent">
              Importante · A partir da Rodada 02
            </span>
            <h3 className="font-athletic text-base font-black uppercase italic tracking-tight text-white mt-0.5">
              Atenção à sua Posição no Perfil!
            </h3>
          </div>
        </div>

        {/* Descrição */}
        <p className="text-xs text-muted leading-relaxed mb-4">
          A partir da próxima rodada, o Cartola calcula <strong>bônus táticos exclusivos</strong> para a sua posição real em campo:
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-athletic font-black text-blue-400 text-[10px]">DEF</span>
            <span className="text-muted text-[11px]">Bônus de Zaga (+2 se não tomar gol / +1 se levar só 1)</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
            <span className="rounded bg-warning/20 px-1.5 py-0.5 font-athletic font-black text-warning text-[10px]">MEI/ALA</span>
            <span className="text-muted text-[11px]">Bônus de Garçom (+4,5 pts por assistência)</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
            <span className="rounded bg-danger/20 px-1.5 py-0.5 font-athletic font-black text-danger text-[10px]">ATA</span>
            <span className="text-muted text-[11px]">Bônus de Matador (+6,0 pts por gol)</span>
          </div>
        </div>

        <p className="text-[11px] font-bold text-accent mb-5 leading-snug">
          👉 Acesse <strong>Meu Perfil</strong> e confira se a sua tag está configurada corretamente para você e quem te escalar pontuarem certo!
        </p>

        {/* Ações */}
        <div className="flex items-center gap-2">
          <Link
            href="/meu-perfil"
            onClick={handleClose}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-xs font-black uppercase text-background shadow-md hover:bg-accent/90 transition-transform active:scale-95"
          >
            <span>Ver Meu Perfil</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-muted hover:text-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
