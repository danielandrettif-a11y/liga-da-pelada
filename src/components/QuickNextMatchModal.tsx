"use client";

import { X } from "@/components/icons";
import { MatchCreator } from "./MatchCreator";

type Props = {
  suggestion: any;
  onClose: () => void;
};

export function QuickNextMatchModal({ suggestion, onClose }: Props) {
  const rotation = suggestion.rotation;
  return (
    <div className="mobile-dialog-backdrop z-[100] bg-background/90 p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Próxima partida">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-accent/35 bg-[#06130b] shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-border bg-surface/80 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-xl text-background">⚡</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-foreground">Próxima partida pronta</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{rotation.reasonLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted" aria-label="Fechar início rápido">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="mobile-dialog-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
          <MatchCreator
            round={suggestion.round}
            initialTeamIds={[rotation.teamAId, rotation.teamBId]}
            quickStart
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
