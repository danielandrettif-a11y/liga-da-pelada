"use client";

import { useEffect, useRef } from "react";

let activeLocks = 0;
let originalOverflow: string | null = null;
let originalHtmlOverflow: string | null = null;
let lockedScrollY = 0;
const dialogStack: symbol[] = [];

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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
export function useDialogViewport(open: boolean, onClose?: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const body = document.body;
    const html = document.documentElement;
    const token = Symbol("dialog");
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let dialog: HTMLElement | null = null;
    dialogStack.push(token);

    const focusFrame = window.requestAnimationFrame(() => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      dialog = dialogs.item(dialogs.length - 1);
      if (!dialog) return;
      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!firstFocusable && !dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      (firstFocusable || dialog).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== token) return;
      if (event.key === "Escape" && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
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
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      const tokenIndex = dialogStack.lastIndexOf(token);
      if (tokenIndex >= 0) dialogStack.splice(tokenIndex, 1);
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
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open]);
}
