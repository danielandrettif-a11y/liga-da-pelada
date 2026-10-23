"use client";

import { X } from "@/components/icons";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { MatchCreator } from "./MatchCreator";

type Props = {
  suggestion: any;
  onClose: () => void;
};

export function QuickNextMatchModal({ suggestion, onClose }: Props) {
  useDialogViewport(true, onClose);
  const rotation = suggestion.rotation;
  return (
    <div
      className="mobile-dialog-backdrop z-[9999] bg-background/90 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Próxima partida"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="mobile-dialog-panel flex max-w-lg flex-col rounded-3xl border border-accent/35 bg-[#06130b] shadow-2xl animate-fade-in-up"
        style={{ maxHeight: "min(82dvh, 48rem)" }}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border bg-surface/80 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-xl text-background">⚡</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-foreground">Próxima partida pronta</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{rotation.reasonLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background/70 text-muted transition-colors hover:border-accent/50 hover:text-foreground" aria-label="Fechar próxima partida">
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
