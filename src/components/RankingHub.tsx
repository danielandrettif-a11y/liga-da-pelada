"use client";

import { useState } from "react";
import { ClipboardList, Trophy } from "@/components/icons";
import type { RankingExperienceData } from "@/lib/ranking";
import { FantasyRankingList, type FantasyRankingEntry } from "./fantasy/FantasyRankingList";
import { RankingExperience } from "./RankingExperience";

type RankingHubProps = {
  data: RankingExperienceData;
  fantasyRanking: FantasyRankingEntry[];
  currentPlayerId: string | null;
};

export function RankingHub({ data, fantasyRanking, currentPlayerId }: RankingHubProps) {
  const [mode, setMode] = useState<"ranked" | "fantasy">("ranked");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setMode("ranked")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black ${mode === "ranked" ? "bg-accent text-background" : "text-muted"}`}
        >
          <Trophy className="h-4 w-4" /> Ranked
        </button>
        <button
          type="button"
          onClick={() => setMode("fantasy")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black ${mode === "fantasy" ? "bg-accent text-background" : "text-muted"}`}
        >
          <ClipboardList className="h-4 w-4" /> Ranking Cartola
        </button>
      </div>

      {mode === "ranked" ? (
        <RankingExperience data={data} currentPlayerId={currentPlayerId} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-foreground">Ranking do Cartola</h1>
              <p className="text-xs text-muted">Classificação geral e patrimônio da temporada.</p>
            </div>
            <span className="rounded-full bg-warning px-2 py-1 text-[8px] font-black uppercase tracking-wider text-background">Beta</span>
          </div>
          <FantasyRankingList ranking={fantasyRanking} />
        </div>
      )}
    </div>
  );
}
