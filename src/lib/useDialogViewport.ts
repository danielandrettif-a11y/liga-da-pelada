"use client";

import { useEffect } from "react";

let activeLocks = 0;
let originalOverflow: string | null = null;
let originalHtmlOverflow: string | null = null;
let originalBodyPosition: string | null = null;
let originalBodyTop: string | null = null;
let originalBodyWidth: string | null = null;
let lockedScrollY = 0;

/**
 * Gerenciador singleton de bloqueio de rolagem para modais e drawers no iOS/Android/Desktop.
 * Usa contagem de referências para suportar múltiplos modais/drawers sem travar a página ao fechar.
 */
export function useDialogViewport(open: boolean) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const body = document.body;
    const html = document.documentElement;
    if (activeLocks === 0) {
      lockedScrollY = window.scrollY;
      originalOverflow = body.style.overflow;
      originalHtmlOverflow = html.style.overflow;
      originalBodyPosition = body.style.position;
      originalBodyTop = body.style.top;
      originalBodyWidth = body.style.width;
      body.style.overflow = "hidden";
      html.style.overflow = "hidden";
      // O overflow sozinho não bloqueia a página de forma confiável no Safari.
      body.style.position = "fixed";
      body.style.top = `-${lockedScrollY}px`;
      body.style.width = "100%";
    }
    activeLocks++;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) {
        body.style.overflow = originalOverflow ?? "";
        html.style.overflow = originalHtmlOverflow ?? "";
        body.style.position = originalBodyPosition ?? "";
        body.style.top = originalBodyTop ?? "";
        body.style.width = originalBodyWidth ?? "";
        window.scrollTo(0, lockedScrollY);
        originalOverflow = null;
        originalHtmlOverflow = null;
        originalBodyPosition = null;
        originalBodyTop = null;
        originalBodyWidth = null;
        lockedScrollY = 0;
      }
    };
  }, [open]);
}
