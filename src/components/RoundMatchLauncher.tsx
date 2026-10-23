"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "@/components/icons";
import { MatchCreator } from "./MatchCreator";

type Props = {
  round: any;
  userId: string;
};

export function RoundMatchLauncher({ round, userId }: Props) {
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const openStartedAtRef = useRef<number | null>(null);
  const draftStorageKey = useMemo(
    () => `match-draft:${userId}:${round.league_id}:${round.id}:${round.matches?.length || 0}`,
    [round.id, round.league_id, round.matches?.length, userId],
  );

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || openStartedAtRef.current === null) return;
    const startedAt = openStartedAtRef.current;
    openStartedAtRef.current = null;
    window.requestAnimationFrame(() => {
      if (!navigator.sendBeacon) return;
      const payload = JSON.stringify({
        kind: "client_action",
        name: "open_match_setup_feedback",
        value: Math.round(performance.now() - startedAt),
        path: window.location.pathname,
        metadata: { local: true },
      });
      navigator.sendBeacon("/api/internal/observability", new Blob([payload], { type: "application/json" }));
    });
  }, [open]);

  function close() {
    if (!syncing) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          openStartedAtRef.current = performance.now();
          setOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-4 text-sm font-black uppercase tracking-wide text-background shadow-lg shadow-accent/20 transition-all hover:bg-accent-light active:scale-[0.98]"
      >
        <Plus className="h-5 w-5" strokeWidth={3} />
        Nova Partida
      </button>

      {open && (
        <div
          className="mobile-dialog-backdrop z-[100] bg-background/90 p-3 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Nova partida"
          onMouseDown={(event) => event.target === event.currentTarget && close()}
        >
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-accent/35 bg-[#06130b] shadow-2xl">
            <header className="flex shrink-0 items-start gap-3 border-b border-border bg-surface/80 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-xl text-background">⚽</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black text-foreground">Nova Partida</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">Rodada {String(round.number).padStart(2, "0")} · montagem local</p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={syncing}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted disabled:opacity-35"
                aria-label="Fechar nova partida"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="mobile-dialog-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
              <MatchCreator
                round={round}
                embedded
                onCancel={close}
                draftStorageKey={draftStorageKey}
                onSyncStateChange={setSyncing}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
