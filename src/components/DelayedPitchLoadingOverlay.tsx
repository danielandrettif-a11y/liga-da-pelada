"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function DelayedPitchLoadingOverlay({
  active,
  delayMs = 450,
  title = "Carregando a próxima jogada",
  description = "Só mais um instante…",
}: {
  active: boolean;
  delayMs?: number;
  title?: string;
  description?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  if (!mounted || !visible || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100000] grid place-items-center bg-black/75 px-6 backdrop-blur-md animate-fade-in" role="status" aria-live="polite" aria-label={title}>
      <div className="w-full max-w-xs text-center">
        <div className="league-entry-pitch mx-auto" aria-hidden="true">
          <span className="league-entry-pitch__line" />
          <span className="league-entry-pitch__circle" />
          <span className="league-entry-pitch__player league-entry-pitch__player--one" />
          <span className="league-entry-pitch__player league-entry-pitch__player--two" />
          <span className="league-entry-pitch__player league-entry-pitch__player--three" />
          <span className="league-entry-pitch__ball">⚽</span>
        </div>
        <p className="mt-5 font-athletic text-2xl font-black uppercase text-white">{title}</p>
        <p className="mt-2 text-sm text-white/65">{description}</p>
      </div>
    </div>,
    document.body,
  );
}
