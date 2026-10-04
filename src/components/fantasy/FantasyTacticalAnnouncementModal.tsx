"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "@/components/icons";

export function FantasyTacticalAnnouncementModal({ scoringVersion = 5 }: { scoringVersion?: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const storageKey = scoringVersion >= 11 ? "fantasy_three_positions_v11_seen" : `fantasy_tactical_v${scoringVersion}_seen`;
  useEffect(() => { if (!localStorage.getItem(storageKey)) setIsOpen(true); }, [storageKey]);
  const close = () => { localStorage.setItem(storageKey, "true"); setIsOpen(false); };
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
    <div className="relative w-full max-w-lg rounded-3xl border border-accent/30 bg-[#07160d] p-6 text-foreground shadow-2xl">
      <button onClick={close} className="absolute right-4 top-4 rounded-full bg-white/10 p-2" aria-label="Fechar"><X className="h-4 w-4" /></button>
      <div className="flex items-center gap-3"><span className="rounded-xl bg-accent p-2 text-background"><Sparkles className="h-5 w-5" /></span><div><p className="text-[9px] font-black uppercase tracking-widest text-accent">Nova regra oficial</p><h2 className="font-athletic text-xl font-black uppercase">Cartola com três posições</h2></div></div>
      <p className="mt-4 text-sm leading-6 text-muted">ALA agora faz parte de ATA/ALA. Escolha <strong className="text-white">1 GOL + 3 DEF + 2 ATA</strong> ou <strong className="text-white">1 GOL + 2 DEF + 3 ATA</strong>.</p>
      <div className="mt-4 space-y-2 text-xs">
        <p className="rounded-xl border border-blue-500/25 bg-blue-950/20 p-3"><strong className="text-blue-300">DEF/VOL:</strong> gol +5, assistência +3, clean sheet +2 e −0,5 por gol sofrido.</p>
        <p className="rounded-xl border border-danger/25 bg-red-950/20 p-3"><strong className="text-danger">ATA/ALA:</strong> gol +4, assistência +2,5 e −0,5 por gol sofrido.</p>
        <p className="rounded-xl border border-accent/25 bg-accent/10 p-3"><strong className="text-accent">GOL:</strong> usa apenas scouts no gol; atuação +1, clean sheet +2 e −0,5 por gol sofrido.</p>
      </div>
      <button onClick={close} className="mt-5 w-full rounded-xl bg-accent py-3 text-xs font-black uppercase text-background">Entendi</button>
    </div>
  </div>;
}
