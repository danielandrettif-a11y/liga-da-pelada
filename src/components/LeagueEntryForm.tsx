"use client";

import { useFormStatus } from "react-dom";
import { ChevronRight } from "@/components/icons";
import { enterLeague } from "@/app/lobby/actions";
import { DelayedPitchLoadingOverlay } from "@/components/DelayedPitchLoadingOverlay";

function EntrySubmit({ leagueName, accentColor }: { leagueName: string; accentColor: string }) {
  const { pending } = useFormStatus();

  return <>
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-black text-background disabled:cursor-wait disabled:opacity-80"
      style={{ backgroundColor: accentColor }}
    >
      {pending ? "Entrando…" : "Entrar no clube"}
      <ChevronRight className="h-4 w-4" />
    </button>
    <DelayedPitchLoadingOverlay
      active={pending}
      title={`Entrando em ${leagueName}`}
      description="Preparando o vestiário e a próxima rodada…"
    />
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
