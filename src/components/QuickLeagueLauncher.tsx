"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus, Clock, Football, HelpCircle, Loader2, MapPin, X } from "@/components/icons";
import { createQuickLeague } from "@/app/lobby/actions";

function localDefaults() {
  const now = new Date();
  const rounded = new Date(now.getTime() + 15 * 60 * 1000);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 15) * 15, 0, 0);
  const date = `${rounded.getFullYear()}-${String(rounded.getMonth() + 1).padStart(2, "0")}-${String(rounded.getDate()).padStart(2, "0")}`;
  const time = `${String(rounded.getHours()).padStart(2, "0")}:${String(rounded.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button
    type="submit"
    disabled={pending}
    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-background shadow-[0_0_28px_rgba(204,255,0,.18)] disabled:opacity-60"
  >
    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
    {pending ? "Preparando sua partida..." : "Criar e adicionar jogadores"}
  </button>;
}

export function QuickLeagueLauncher({ error = false, cardClassName = "" }: { error?: boolean; cardClassName?: string }) {
  const [open, setOpen] = useState(error);
  const [showInfo, setShowInfo] = useState(false);
  const [defaults, setDefaults] = useState({ date: "", time: "" });

  function show() {
    setDefaults(localDefaults());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <>
    <button
      type="button"
      onClick={show}
      className={cardClassName || "flex min-h-[270px] w-full flex-col rounded-3xl border border-accent/35 bg-[linear-gradient(145deg,rgba(204,255,0,.12),rgba(4,34,18,.94)_58%,rgba(3,20,12,.98))] p-4 text-left shadow-[0_18px_45px_rgba(0,0,0,.24)] transition-transform active:scale-[.98]"}
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-background"><Football className="h-6 w-6" /></span>
      <span className="mt-4 block text-[9px] font-black uppercase tracking-[.16em] text-accent">Só o jogo de hoje</span>
      <span className="mt-1 flex items-start justify-between gap-2">
        <strong className="block font-athletic text-xl font-black uppercase leading-tight text-white">Partida rápida</strong>
        <span
          role="button"
          tabIndex={0}
          aria-label="Sobre a partida rápida"
          aria-expanded={showInfo}
          onClick={(event) => { event.stopPropagation(); setShowInfo((current) => !current); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              setShowInfo((current) => !current);
            }
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/20 text-muted"
        ><HelpCircle className="h-4 w-4" /></span>
      </span>
      {showInfo && <span className="mt-3 block rounded-xl border border-white/10 bg-black/25 p-2.5 text-[10px] leading-[1.5] text-muted">Convidados temporários, divisão de times, placar ao vivo e pagamentos.</span>}
      <span className="mt-auto flex min-h-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 px-2 text-center text-[10px] font-black uppercase tracking-wide text-accent">Configurar partida</span>
    </button>

    {open && <div className="mobile-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onMouseDown={(event) => {
      if (event.currentTarget === event.target) setOpen(false);
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="quick-match-title" className="mobile-dialog-panel mobile-dialog-scroll max-h-[min(90dvh,760px)] w-full max-w-lg overflow-y-auto rounded-3xl border border-accent/35 bg-[#07180f] p-5 shadow-[0_25px_90px_rgba(0,0,0,.7)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">Partida descartável</p>
            <h2 id="quick-match-title" className="mt-1 font-athletic text-3xl font-black uppercase text-white">Prepare o jogo</h2>
            <p className="mt-2 text-xs leading-5 text-muted">Esta sessão é privada. Só você opera o placar e cadastra os convidados.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-muted"><X className="h-5 w-5" /></button>
        </div>

        <form action={createQuickLeague} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-white"><span className="flex items-center gap-1.5"><CalendarPlus className="h-3.5 w-3.5 text-accent" /> Dia</span>
              <input name="date" type="date" required defaultValue={defaults.date} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-white" />
            </label>
            <label className="text-xs font-bold text-white"><span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-accent" /> Horário</span>
              <input name="start_time" type="time" required defaultValue={defaults.time} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-white" />
            </label>
          </div>
          <label className="block text-xs font-bold text-white"><span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-accent" /> Nome do campo <span className="font-normal text-muted">(opcional)</span></span>
            <input name="field_name" maxLength={80} placeholder="Ex.: Arena do bairro" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-white placeholder:text-muted/60" />
          </label>
          <label className="block text-xs font-bold text-white">Link do campo no mapa <span className="font-normal text-muted">(opcional)</span>
            <input name="map_url" type="url" placeholder="https://maps.app.goo.gl/..." className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-white placeholder:text-muted/60" />
          </label>
          {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-bold text-danger">Não foi possível preparar a partida. Confira os dados e confirme se as migrations 343 e 344 já foram aplicadas.</p>}
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-[10px] leading-5 text-muted">
            Sem ranking ou Cartola. Ao finalizar, o histórico e os pagamentos ficam disponíveis por até 7 dias; se todos pagarem, a exclusão acontece após 3 dias.
          </div>
          <SubmitButton />
        </form>
      </div>
    </div>}
  </>;
}
