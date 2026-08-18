"use client";

import { useEffect } from "react";

let activeLocks = 0;
let originalOverflow: string | null = null;
let originalTouchAction: string | null = null;

/**
 * Gerenciador singleton de bloqueio de rolagem para modais e drawers no iOS/Android/Desktop.
 * Usa contagem de referências para suportar múltiplos modais/drawers sem travar a página ao fechar.
 */
export function useDialogViewport(open: boolean) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const body = document.body;
    if (activeLocks === 0) {
      originalOverflow = body.style.overflow;
      originalTouchAction = body.style.touchAction;
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    }
    activeLocks++;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) {
        body.style.overflow = originalOverflow ?? "";
        body.style.touchAction = originalTouchAction ?? "";
        originalOverflow = null;
        originalTouchAction = null;
      }
    };
  }, [open]);
}
