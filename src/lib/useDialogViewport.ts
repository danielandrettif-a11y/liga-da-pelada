"use client";

import { useEffect } from "react";

/** Impede que a página atrás do diálogo role no iOS/Android e restaura 100% ao fechar. */
export function useDialogViewport(open: boolean) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousTouchAction = body.style.touchAction;

    body.style.overflow = "hidden";
    body.style.touchAction = "none";

    return () => {
      body.style.overflow = previousOverflow || "";
      body.style.touchAction = previousTouchAction || "";
    };
  }, [open]);
}
