"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Sparkles, X, ChevronRight } from "@/components/icons";

export function CallupTacticalAlertModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("callup_tactical_alert_column_c_seen");
    if (!seen) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("callup_tactical_alert_column_c_seen", "true");
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
              Novo sistema · Coluna C
            </span>
            <h3 className="font-athletic text-base font-black uppercase italic tracking-tight text-white mt-0.5">
              Agora são duas funções de linha
            </h3>
          </div>
        </div>

        {/* Descrição */}
        <p className="text-xs text-muted leading-relaxed mb-4">
          O perfil ALA foi unido ao ataque. Ranked, Cartola e OVR agora usam <strong>GOL, DEF/VOL e ATA/ALA</strong> com a mesma base de pontuação:
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-athletic font-black text-blue-400 text-[10px]">DEF/VOL</span>
            <span className="text-muted text-[11px]">Gol +5, assistência +3, clean sheet +2 e −0,5 por gol sofrido</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
            <span className="rounded bg-danger/20 px-1.5 py-0.5 font-athletic font-black text-danger text-[10px]">ATA/ALA</span>
            <span className="text-muted text-[11px]">Gol +4, assistência +2,5 e −0,5 por gol sofrido</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
            <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 font-athletic font-black text-emerald-300 text-[10px]">GOL</span>
            <span className="text-muted text-[11px]">Somente scouts no gol: atuação +1, clean sheet +2 e −0,5 por gol sofrido</span>
          </div>
        </div>

        <p className="text-[11px] font-bold text-accent mb-5 leading-snug">
          👉 Confira no <strong>Meu Perfil</strong> se você está marcado como DEF/VOL ou ATA/ALA.
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
