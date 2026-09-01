"use client";

import { useEffect } from "react";

let activeLocks = 0;
let originalOverflow: string | null = null;
let originalHtmlOverflow: string | null = null;
let lockedScrollY = 0;

function preventBackgroundTouch(event: TouchEvent) {
  // Em navegadores móveis, um gesto pode começar em um nó de texto ou SVG.
  // O composedPath preserva o elemento rolável pai nesses casos e evita que o
  // bloqueio do fundo cancele a rolagem interna do modal.
  const isInsideScrollableDialog = event.composedPath().some((target) =>
    target instanceof Element && Boolean(target.closest(".mobile-dialog-scroll")),
  );
  if (isInsideScrollableDialog) return;
  event.preventDefault();
}

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
      body.style.overflow = "hidden";
      html.style.overflow = "hidden";
      // Evita mover o body com position:fixed. No Safari/PWA isso deslocava
      // portais abertos após o scroll e deixava uma camada invisível sobre o app.
      document.addEventListener("touchmove", preventBackgroundTouch, { passive: false });
    }
    activeLocks++;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) {
        body.style.overflow = originalOverflow ?? "";
        html.style.overflow = originalHtmlOverflow ?? "";
        document.removeEventListener("touchmove", preventBackgroundTouch);
        window.scrollTo(0, lockedScrollY);
        originalOverflow = null;
        originalHtmlOverflow = null;
        lockedScrollY = 0;
      }
    };
  }, [open]);
}
