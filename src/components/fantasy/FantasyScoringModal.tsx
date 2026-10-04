"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@/components/icons";
import { useDialogViewport } from "@/lib/useDialogViewport";
import type { FantasySettings } from "@/lib/fantasy/config";

type Props = { isOpen: boolean; onClose: () => void; settings: FantasySettings };
type Tab = "positions" | "base" | "extras";

const RULES = [
  { scout: "Gol", attack: "+4,0", defense: "+5,0", goalkeeper: "+5,0 no gol" },
  { scout: "Assistência", attack: "+2,5", defense: "+3,0", goalkeeper: "+3,0 no gol" },
  { scout: "Gol sofrido", attack: "−0,5", defense: "−0,5", goalkeeper: "−0,5 no gol" },
  { scout: "Clean sheet", attack: "—", defense: "+2,0", goalkeeper: "+2,0" },
  { scout: "Atuação no gol", attack: "—", defense: "—", goalkeeper: "+1,0" },
  { scout: "Gol contra", attack: "−3,0", defense: "−3,0", goalkeeper: "−3,0 no gol" },
] as const;

export function FantasyScoringModal({ isOpen, onClose, settings }: Props) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("positions");
  useDialogViewport(isOpen, onClose);
  useEffect(() => setMounted(true), []);
  if (!isOpen || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="mobile-dialog-backdrop z-[99999] bg-black/90 backdrop-blur-md" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sistema de pontuação">
      <div className="relative my-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07160d] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="border-b border-white/10 bg-accent/10 p-5">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2" aria-label="Fechar"><X className="h-4 w-4" /></button>
          <p className="text-[9px] font-black uppercase tracking-[.2em] text-accent">Guia oficial · Coluna C</p>
          <h2 className="mt-1 font-athletic text-xl font-black uppercase text-white">Três posições</h2>
          <p className="mt-2 text-xs leading-5 text-muted">Cada vaga usa somente os scouts daquela função. Vitória, empate e derrota não dão pontos.</p>
          <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-black/50 p-1">
            {([["positions","Formações"],["base","Pontuação"],["extras","Extras"]] as const).map(([key,label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-lg py-2 text-[9px] font-black uppercase ${tab===key?"bg-accent text-background":"text-muted"}`}>{label}</button>)}
          </div>
        </header>
        <div className="mobile-dialog-scroll flex-1 space-y-4 overflow-y-auto p-5">
          {tab === "positions" && <>
            <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4 text-xs leading-5 text-foreground"><strong>Escolha um dos dois esquemas:</strong><br />1 GOL + 3 DEF/VOL + 2 ATA/ALA<br />1 GOL + 2 DEF/VOL + 3 ATA/ALA</div>
            <div className="grid gap-3">
              <article className="rounded-2xl border border-blue-500/25 bg-blue-950/20 p-4"><strong className="text-blue-300">DEF/VOL</strong><p className="mt-1 text-xs text-muted">Gol e assistência valem mais. Recebe +2 por clean sheet e perde 0,5 por gol sofrido pelo time.</p></article>
              <article className="rounded-2xl border border-danger/25 bg-red-950/20 p-4"><strong className="text-danger">ATA/ALA</strong><p className="mt-1 text-xs text-muted">Une atacantes e antigos alas. Pontua por gol e assistência e perde 0,5 por gol sofrido pelo time.</p></article>
              <article className="rounded-2xl border border-accent/25 bg-accent/10 p-4"><strong className="text-accent">GOL</strong><p className="mt-1 text-xs text-muted">A vaga é livre, mas considera apenas partidas e ações registradas enquanto o atleta estava no gol.</p></article>
            </div>
          </>}
          {tab === "base" && <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1.25fr_repeat(3,1fr)] bg-white/5 px-3 py-2 text-[8px] font-black uppercase text-muted"><span>Scout</span><span>ATA/ALA</span><span>DEF/VOL</span><span>GOL</span></div>
            {RULES.map((rule) => <div key={rule.scout} className="grid grid-cols-[1.25fr_repeat(3,1fr)] items-center border-t border-white/5 px-3 py-3 text-[10px]"><strong>{rule.scout}</strong><span>{rule.attack}</span><span>{rule.defense}</span><span>{rule.goalkeeper}</span></div>)}
          </div>}
          {tab === "extras" && <div className="space-y-3 text-xs leading-5 text-muted">
            <p className="rounded-2xl border border-warning/25 bg-warning/10 p-4"><strong className="text-warning">Capitão ×{settings.captainMultiplier.toFixed(1)}</strong><br />O adicional do capitão é aplicado sobre a pontuação final da vaga.</p>
            <p className="rounded-2xl border border-accent/25 bg-accent/10 p-4"><strong className="text-accent">Cartas e palpites continuam</strong><br />Os efeitos especiais são calculados separadamente e somados depois dos seis atletas.</p>
            <p className="rounded-2xl border border-white/10 p-4">Exemplo: um goleiro que perde por 0×2 recebe +1 pela atuação e −1 pelos gols sofridos, terminando com 0 ponto.</p>
          </div>}
        </div>
      </div>
    </div>, document.body,
  );
}
