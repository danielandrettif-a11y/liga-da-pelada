"use client";

import { useState } from "react";
import type { RankingExperienceData } from "@/lib/ranking";
import type { FriendlyStatsEntry } from "@/lib/actions/stats";
import { RankingExperience } from "./RankingExperience";
import { PlayerAvatar } from "./PlayerAvatar";
import { Football, Handshake, Medal, Target, Trophy } from "@/components/icons";
import Link from "next/link";

export function RankingHub({ data, friendlies, currentPlayerId }: { data: RankingExperienceData; friendlies: FriendlyStatsEntry[]; currentPlayerId: string | null }) {
  const [mode, setMode] = useState<"ranked" | "friendly">("ranked");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
        <button onClick={() => setMode("ranked")} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black ${mode === "ranked" ? "bg-accent text-background" : "text-muted"}`}><Trophy className="h-4 w-4" /> Ranked</button>
        <button onClick={() => setMode("friendly")} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black ${mode === "friendly" ? "bg-warning text-background" : "text-muted"}`}><Handshake className="h-4 w-4" /> Amistosos</button>
      </div>
      {mode === "ranked" ? <RankingExperience data={data} currentPlayerId={currentPlayerId} /> : (
        <div className="space-y-3">
          <div><h1 className="text-xl font-black text-foreground">Amistosos</h1><p className="text-xs text-muted">Estatísticas separadas, sem posição e sem pontos no Ranking</p></div>
          {friendlies.map((entry) => (
            <Link key={entry.player.id} href={`/jogadores/${entry.player.id}`} className="glass-card block p-4">
              <div className="flex items-center gap-3"><PlayerAvatar name={entry.player.name} avatarUrl={entry.player.avatar_url} className="h-12 w-12 rounded-full bg-surface text-sm font-black text-muted" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-foreground">{entry.player.name}</p><p className="text-[10px] text-warning">{entry.rounds} participações · {entry.games} jogos</p></div>{entry.bestGoalkeeper > 0 && <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-[9px] font-black text-warning"><Medal className="h-3 w-3" /> {entry.bestGoalkeeper}x</span>}</div>
              <div className="mt-3 grid grid-cols-6 gap-1 border-t border-border pt-3 text-center">
                {[['V', entry.wins], ['E', entry.draws], ['D', entry.losses], ['G', entry.goals], ['A', entry.assists], ['JG', entry.games]].map(([label, value]) => <div key={String(label)}><p className="text-sm font-black text-foreground">{value}</p><p className="text-[8px] font-bold text-muted">{label}</p></div>)}
              </div>
            </Link>
          ))}
          {friendlies.length === 0 && <div className="glass-card p-10 text-center"><Football className="mx-auto h-9 w-9 text-muted" /><p className="mt-3 text-sm font-black text-foreground">Nenhum amistoso finalizado</p><p className="mt-1 text-xs text-muted">As estatísticas amistosas aparecerão aqui.</p></div>}
        </div>
      )}
    </div>
  );
}

