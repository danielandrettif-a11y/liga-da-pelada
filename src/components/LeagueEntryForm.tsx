"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { ChevronRight } from "@/components/icons";
import { enterLeague } from "@/app/lobby/actions";

function EntrySubmit({ leagueName, accentColor }: { leagueName: string; accentColor: string }) {
  const { pending } = useFormStatus();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return <>
    <button
      type="submit"
      disabled={pending}
      aria-describedby={pending ? "league-entry-status" : undefined}
      className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-black text-background disabled:cursor-wait disabled:opacity-80"
      style={{ backgroundColor: accentColor }}
    >
      {pending ? "Entrando…" : "Entrar no clube"}
      <ChevronRight className="h-4 w-4" />
    </button>
    {mounted && pending && createPortal(
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 px-6 backdrop-blur-md" role="status" aria-live="polite">
        <div className="w-full max-w-xs text-center">
          <div className="league-entry-pitch mx-auto" aria-hidden="true">
            <span className="league-entry-pitch__line" />
            <span className="league-entry-pitch__circle" />
            <span className="league-entry-pitch__player league-entry-pitch__player--one" />
            <span className="league-entry-pitch__player league-entry-pitch__player--two" />
            <span className="league-entry-pitch__player league-entry-pitch__player--three" />
            <span className="league-entry-pitch__ball">⚽</span>
          </div>
          <p id="league-entry-status" className="mt-5 font-athletic text-2xl font-black uppercase text-white">Entrando em {leagueName}</p>
          <p className="mt-2 text-sm text-white/65">Preparando o vestiário e a próxima rodada…</p>
        </div>
      </div>,
      document.body,
    )}
  </>;
}

export function LeagueEntryForm({ leagueId, leagueName, accentColor }: {
  leagueId: string;
  leagueName: string;
  accentColor: string;
}) {
  return <form action={enterLeague} className="p-3">
    <input type="hidden" name="league_id" value={leagueId} />
    <EntrySubmit leagueName={leagueName} accentColor={accentColor} />
  </form>;
}
