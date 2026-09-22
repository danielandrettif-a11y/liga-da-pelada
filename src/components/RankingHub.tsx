"use client";

import dynamic from "next/dynamic";
import { ClipboardList, Trophy } from "@/components/icons";
import type { RankingExperienceData } from "@/lib/ranking";
import type { FantasyRankingEntry } from "./fantasy/FantasyRankingList";
import { RankingExperience } from "./RankingExperience";
import { useUrlState } from "@/lib/useUrlState";

const FantasyRankingList = dynamic(
  () => import("./fantasy/FantasyRankingList").then((module) => module.FantasyRankingList),
  { loading: () => <div className="h-72 animate-pulse rounded-3xl border border-border bg-surface" /> },
);

type RankingHubProps = {
  data: RankingExperienceData;
  fantasyRanking: FantasyRankingEntry[];
  currentPlayerId: string | null;
  initialMode: "ranked" | "fantasy";
  initialView: "season" | "latest" | "month";
  initialFilter: string;
};

const RANKING_MODES = ["ranked", "fantasy"] as const;

export function RankingHub({ data, fantasyRanking, currentPlayerId, initialMode, initialView, initialFilter }: RankingHubProps) {
  const [mode, setMode] = useUrlState({ key: "mode", initialValue: initialMode, defaultValue: "ranked", allowedValues: RANKING_MODES });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Tipo de ranking">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ranked"}
          onClick={() => setMode("ranked")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black ${mode === "ranked" ? "bg-accent text-background" : "text-muted"}`}
        >
          <Trophy className="h-4 w-4" /> Em Campo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "fantasy"}
          onClick={() => setMode("fantasy")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black ${mode === "fantasy" ? "bg-accent text-background" : "text-muted"}`}
        >
          <ClipboardList className="h-4 w-4" /> Cartola
        </button>
      </div>

      {mode === "ranked" ? (
        <RankingExperience data={data} currentPlayerId={currentPlayerId} initialView={initialView} initialFilter={initialFilter} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-foreground">Ranking do Cartola</h1>
              <p className="text-xs text-muted">Classificação geral e patrimônio da temporada.</p>
            </div>
          </div>
          <FantasyRankingList ranking={fantasyRanking} />
        </div>
      )}
    </div>
  );
}
