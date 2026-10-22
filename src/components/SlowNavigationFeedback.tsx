"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DelayedPitchLoadingOverlay } from "@/components/DelayedPitchLoadingOverlay";

export function SlowNavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [navigating, setNavigating] = useState(false);
  const safetyTimer = useRef<number | null>(null);

  function stopFeedback() {
    setNavigating(false);
    if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    safetyTimer.current = null;
  }

  function startFeedback() {
    setNavigating(true);
    if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    safetyTimer.current = window.setTimeout(stopFeedback, 12_000);
  }

  useEffect(() => {
    stopFeedback();
  }, [pathname, query]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const current = `${window.location.pathname}${window.location.search}`;
      const next = `${destination.pathname}${destination.search}`;
      if (current === next) return;

      // O Link do Next cancela a navegação nativa antes de iniciar a troca de
      // rota. Por isso não usamos defaultPrevented como sinal de cancelamento.
      window.setTimeout(startFeedback, 0);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    };
  }, []);

  return (
    <DelayedPitchLoadingOverlay
      active={navigating}
      delayMs={450}
      title="Preparando a próxima tela"
      description="Organizando o campo para você…"
    />
  );
}
