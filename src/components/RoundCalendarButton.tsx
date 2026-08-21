"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Download, X } from "@/components/icons";
import { buildGoogleCalendarUrl, buildIcs, type PeladaCalendarEvent } from "@/lib/calendar";
import { useDialogViewport } from "@/lib/useDialogViewport";

export function RoundCalendarButton({
  event,
  className,
  variant = "accent",
}: {
  event: PeladaCalendarEvent;
  className?: string;
  variant?: "accent" | "sky" | "glass";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useDialogViewport(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  function openGoogle() {
    window.open(buildGoogleCalendarUrl(event, window.location.origin), "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  function downloadIcs() {
    const ics = buildIcs(event, window.location.origin);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pelada-bq-${event.date}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  const baseStyle =
    variant === "sky"
      ? "border-sky-300/30 bg-sky-400 text-[#04131a] shadow-[0_0_20px_rgba(56,189,248,.18)]"
      : variant === "glass"
      ? "border-white/10 bg-black/40 text-muted hover:text-accent hover:border-accent/40"
      : "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 shadow-sm";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${baseStyle}`}
        title="Salvar na agenda"
        aria-label="Salvar pelada na agenda"
      >
        <CalendarDays className="h-4 w-4" />
      </button>

      {mounted && open && typeof document !== "undefined" && createPortal(
        <div
          className="mobile-dialog-backdrop z-[99999] bg-black/90 backdrop-blur-md animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Salvar na agenda"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-6 shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-border/50 pb-4">
              <div>
                <h2 className="text-base font-black text-foreground">Salvar na Agenda</h2>
                <p className="mt-0.5 text-xs text-muted">Escolha onde adicionar o compromisso.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={openGoogle}
                className="flex w-full items-center gap-3 rounded-xl bg-accent px-4 py-3.5 text-left text-xs font-black uppercase tracking-wider text-background shadow-[0_0_15px_rgba(204,255,0,0.2)] transition-transform active:scale-95"
              >
                <CalendarDays className="h-5 w-5" /> Google Agenda
              </button>
              <button
                type="button"
                onClick={downloadIcs}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left text-xs font-black uppercase tracking-wider text-foreground hover:bg-surface/80 transition-colors"
              >
                <Download className="h-5 w-5 text-accent" /> Apple Agenda / Arquivo .ics
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
