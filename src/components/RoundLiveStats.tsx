"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "@/components/icons";

type Player = { id: string; name: string; nickname?: string | null; avatar_url?: string | null };
type MatchEvent = { player_id?: string | null; assist_player_id?: string | null; is_own_goal?: boolean | null };

export function RoundLiveStats({ matches, players }: { matches: Array<{ status: string; match_events?: MatchEvent[] | null }>; players: Player[] }) {
  const hasLiveMatch = matches.some((match) => match.status === "live");
  const [expanded, setExpanded] = useState(hasLiveMatch);
  const { entries, goals, assists } = useMemo(() => {
    const totals = new Map<string, { goals: number; assists: number }>();
    let goalTotal = 0;
    let assistTotal = 0;
    for (const match of matches) {
      for (const event of match.match_events || []) {
        if (event.player_id && !event.is_own_goal) {
          const current = totals.get(event.player_id) || { goals: 0, assists: 0 };
          current.goals += 1;
          totals.set(event.player_id, current);
          goalTotal += 1;
        }
        if (event.assist_player_id && !event.is_own_goal) {
          const current = totals.get(event.assist_player_id) || { goals: 0, assists: 0 };
          current.assists += 1;
          totals.set(event.assist_player_id, current);
          assistTotal += 1;
        }
      }
    }
    const playerById = new Map(players.map((player) => [player.id, player]));
    return {
      goals: goalTotal,
      assists: assistTotal,
      entries: [...totals.entries()]
        .map(([playerId, totals]) => ({ player: playerById.get(playerId), ...totals }))
        .filter((entry) => entry.player)
        .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.player!.name.localeCompare(b.player!.name, "pt-BR")),
    };
  }, [matches, players]);

  return (
    <section className="overflow-hidden rounded-2xl border border-accent/25 bg-surface/80 shadow-[0_0_22px_rgba(190,255,0,0.04)]">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-lg">⚽</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-black text-foreground">Estatísticas da rodada {hasLiveMatch && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-accent">Ao vivo</span>}</span>
          <span className="mt-0.5 block text-[11px] font-bold text-muted">{goals} gol{goals === 1 ? "" : "s"} · {assists} assistência{assists === 1 ? "" : "s"}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <div className="border-t border-border px-4 pb-4 pt-3">
        {entries.length === 0 ? <p className="py-2 text-center text-xs text-muted">Ainda sem gols registrados nesta rodada.</p> : <>
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted">Gols e assistências por jogador</p>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {entries.map(({ player, goals: playerGoals, assists: playerAssists }) => player && <div key={player.id} className="flex items-center gap-3 rounded-xl bg-background/35 px-2.5 py-2">
              {player.avatar_url ? <img src={player.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover text-[10px] font-black text-muted">{player.name.slice(0, 2).toUpperCase()}</span>}
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">{player.nickname || player.name}</span>
              <span className="rounded-lg bg-accent/10 px-2 py-1 text-[10px] font-black text-accent">{playerGoals} G</span>
              <span className="rounded-lg bg-info/10 px-2 py-1 text-[10px] font-black text-info">{playerAssists} A</span>
            </div>)}
          </div>
        </>}
      </div>}
    </section>
  );
}
