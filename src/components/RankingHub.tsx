"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ClipboardList, Shirt, Trophy, Users } from "@/components/icons";
import type { RankingExperienceData } from "@/lib/ranking";
import type { FantasyRankingEntry } from "./fantasy/FantasyRankingList";
import { RankingExperience } from "./RankingExperience";
import { useUrlState } from "@/lib/useUrlState";
import type { SeasonTeamStanding } from "@/lib/season-team-standings";
import { TeamSeasonStandings } from "./TeamSeasonStandings";

const FantasyRankingList = dynamic(
  () => import("./fantasy/FantasyRankingList").then((module) => module.FantasyRankingList),
  { loading: () => <div className="h-72 animate-pulse rounded-3xl border border-border bg-surface" /> },
);

type RankingHubProps = {
  data: RankingExperienceData;
  fantasyRanking: FantasyRankingEntry[];
  currentPlayerId: string | null;
  initialMode: "ranked" | "teams" | "fantasy";
  initialView: "season" | "latest" | "month";
  initialFilter: string;
  teamStandings: SeasonTeamStanding[];
};

const RANKING_MODES = ["ranked", "teams", "fantasy"] as const;

export function RankingHub({ data, fantasyRanking, currentPlayerId, initialMode, initialView, initialFilter, teamStandings }: RankingHubProps) {
  const [mode, setMode] = useUrlState({ key: "mode", initialValue: initialMode, defaultValue: "ranked", allowedValues: RANKING_MODES });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Área de consulta">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ranked"}
          onClick={() => setMode("ranked")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[10px] font-black sm:text-xs ${mode === "ranked" ? "bg-accent text-background" : "text-muted"}`}
        >
          <Trophy className="h-4 w-4" /> Em Campo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "teams"}
          onClick={() => setMode("teams")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[10px] font-black sm:text-xs ${mode === "teams" ? "bg-accent text-background" : "text-muted"}`}
        >
          <Shirt className="h-4 w-4" /> Times
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "fantasy"}
          onClick={() => setMode("fantasy")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[10px] font-black sm:text-xs ${mode === "fantasy" ? "bg-accent text-background" : "text-muted"}`}
        >
          <ClipboardList className="h-4 w-4" /> Cartola
        </button>
        <Link href="/jogadores" role="tab" aria-selected="false" className="flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[10px] font-black text-muted sm:text-xs">
          <Users className="h-4 w-4" /> Elenco
        </Link>
      </div>

      {mode === "ranked" ? (
        <RankingExperience data={data} currentPlayerId={currentPlayerId} initialView={initialView} initialFilter={initialFilter} />
      ) : mode === "teams" ? (
        <TeamSeasonStandings standings={teamStandings} />
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
