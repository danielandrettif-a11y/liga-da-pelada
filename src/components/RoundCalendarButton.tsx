"use client";

import { useState } from "react";
import { CalendarDays, Download, X } from "@/components/icons";
import { buildGoogleCalendarUrl, buildIcs, type PeladaCalendarEvent } from "@/lib/calendar";

export function RoundCalendarButton({ event }: { event: PeladaCalendarEvent }) {
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative z-30 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/30 bg-sky-400 text-[#04131a] shadow-[0_0_20px_rgba(56,189,248,.18)]" aria-label="Salvar pelada na agenda">
        <CalendarDays className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Salvar na agenda">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between border-b border-border p-5">
              <div><h2 className="text-lg font-black text-foreground">Salvar a pelada</h2><p className="mt-1 text-xs text-muted">Escolha onde adicionar o compromisso.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-surface p-2 text-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2 p-4">
              <button type="button" onClick={openGoogle} className="flex w-full items-center gap-3 rounded-xl bg-accent px-4 py-3.5 text-left text-sm font-black text-background"><CalendarDays className="h-5 w-5" /> Google Agenda</button>
              <button type="button" onClick={downloadIcs} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left text-sm font-black text-foreground"><Download className="h-5 w-5 text-accent" /> Apple Agenda / arquivo .ics</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
