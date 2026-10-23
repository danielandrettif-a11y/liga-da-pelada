"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { createLeague } from "@/app/lobby/actions";
import { LeagueTierSelector } from "@/components/LeagueTierSelector";
import { Loader2, Trophy, X } from "@/components/icons";

function SubmitButton() {
  const { pending } = useFormStatus();

  return <button
    type="submit"
    disabled={pending}
    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-background shadow-[0_0_28px_rgba(204,255,0,.18)] disabled:opacity-60"
  >
    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
    {pending ? "Criando sua pelada..." : "Criar minha pelada"}
  </button>;
}

export function PermanentLeagueLauncher({
  error,
  cardClassName,
}: {
  error?: string;
  cardClassName: string;
}) {
  const [open, setOpen] = useState(Boolean(error));

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
      onClick={() => setOpen(true)}
      className={cardClassName}
      aria-haspopup="dialog"
      aria-label="Criar pelada permanente nos modos Básico ou Completo"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-background"><Trophy className="h-6 w-6" /></span>
      <span className="mt-4 block text-[9px] font-black uppercase tracking-[.16em] text-accent">Seu clube, sempre ativo</span>
      <strong className="mt-1 block font-athletic text-xl font-black uppercase leading-tight text-white">Pelada permanente</strong>
      <span className="mt-3 block text-[11px] leading-[1.55] text-muted">Escolha o modo Básico ou Completo, monte o elenco e acompanhe todas as temporadas.</span>
      <span className="mt-auto flex min-h-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 px-2 text-center text-[10px] font-black uppercase tracking-wide text-accent">Configurar pelada</span>
    </button>

    {open && <div
      className="mobile-dialog-backdrop z-[100] bg-black/75 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setOpen(false);
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="permanent-league-title" className="mobile-dialog-panel flex max-w-lg flex-col rounded-3xl border border-accent/35 bg-[#07180f] shadow-[0_25px_90px_rgba(0,0,0,.7)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-5 pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">Pelada permanente</p>
            <h2 id="permanent-league-title" className="mt-1 font-athletic text-3xl font-black uppercase text-white">Crie seu clube</h2>
            <p className="mt-2 text-xs leading-5 text-muted">Escolha o modo, monte o elenco e mantenha o histórico de todas as temporadas.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-muted"><X className="h-5 w-5" /></button>
        </header>

        <form action={createLeague} className="mobile-dialog-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block text-sm font-bold text-white">Nome da pelada
            <input name="name" required minLength={3} maxLength={80} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-white" placeholder="Ex.: Pelada HG" />
          </label>
          <LeagueTierSelector />
          {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-pretty text-sm text-red-200">
            {error === "duplicate" ? "Já existe uma pelada com esse nome. Escolha um nome diferente." : "Não foi possível criar a pelada. Confira os dados e tente novamente."}
          </p>}
          <div className="mobile-dialog-footer sticky bottom-0 -mx-5 border-t border-white/10 bg-[#07180f]/95 px-5 pt-4 backdrop-blur-md">
            <SubmitButton />
          </div>
        </form>
      </section>
    </div>}
  </>;
}
