"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@/components/icons";
import { useDialogViewport } from "@/lib/useDialogViewport";
import type { EventWeather } from "@/lib/weather";

export function WeatherBadge({
  weather,
  locationName,
}: {
  weather?: EventWeather | null;
  locationName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useDialogViewport(open, () => setOpen(false));
  if (!weather) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="pointer-events-auto relative z-30 inline-flex items-center gap-1.5 rounded-xl border border-sky-300/25 bg-sky-400/10 px-2.5 py-1 text-[10px] font-bold text-sky-100 backdrop-blur-md transition-colors hover:bg-sky-400/20"
      >
        <span aria-hidden="true">🌧️</span>
        <span>{weather.label}</span>
        {weather.precipitationProbability !== null && <span>· {weather.precipitationProbability}%</span>}
        {weather.precipitationMm > 0 && <span>· {weather.precipitationMm.toLocaleString("pt-BR")} mm</span>}
        <span className="ml-0.5 text-[8px] text-sky-200/80 underline">Ver 7 dias</span>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="mobile-dialog-backdrop fixed inset-0 z-[99999] flex items-end bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <section className="mobile-dialog-panel flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] border border-sky-300/25 bg-[#06120f] shadow-2xl sm:rounded-[2rem]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h2 id={titleId} className="text-base font-black text-white">Previsão dos próximos 7 dias</h2>
                {locationName && <p className="mt-0.5 text-[10px] text-muted">{locationName}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white" aria-label="Fechar previsão">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="mobile-dialog-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              {weather.forecast?.length ? weather.forecast.map((day) => {
                const date = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
                  .format(new Date(`${day.date}T12:00:00`));
                return (
                  <div key={day.date} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-white/10 px-1 py-3 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-black capitalize text-white">{date}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-sky-100">{day.label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-sky-100">
                        {day.precipitationProbability === null ? "—" : `${day.precipitationProbability}%`}
                        {day.precipitationMm > 0 && ` · ${day.precipitationMm.toLocaleString("pt-BR")} mm`}
                      </p>
                      {day.temperatureMin !== null && day.temperatureMax !== null && (
                        <p className="mt-0.5 text-[10px] text-muted">{Math.round(day.temperatureMin)}° / {Math.round(day.temperatureMax)}°</p>
                      )}
                    </div>
                  </div>
                );
              }) : <p className="py-8 text-center text-sm text-muted">Previsão indisponível no momento.</p>}
            </div>
            <p className="border-t border-white/10 px-5 py-3 text-center text-[9px] text-muted">Dados meteorológicos: Open-Meteo</p>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

