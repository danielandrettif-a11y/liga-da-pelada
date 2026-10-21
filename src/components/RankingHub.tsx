"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ClipboardList, Shirt, Trophy, Users } from "@/components/icons";
import type { RankingExperienceData } from "@/lib/ranking";
import type { FantasyRankingEntry } from "./fantasy/FantasyRankingList";
import { RankingExperience } from "./RankingExperience";
import type { SeasonTeamStanding } from "@/lib/season-team-standings";
import { TeamSeasonStandings } from "./TeamSeasonStandings";
import { getRankingEnrichmentForPlayers } from "@/lib/actions/stats";

const FantasyRankingList = dynamic(
  () => import("./fantasy/FantasyRankingList").then((module) => module.FantasyRankingList),
  { loading: () => <div className="h-72 animate-pulse rounded-3xl border border-border bg-surface" /> },
);

type RankingHubProps = {
  data: RankingExperienceData | null;
  fantasyRanking: FantasyRankingEntry[] | null;
  currentPlayerId: string | null;
  initialMode: "ranked" | "teams" | "fantasy";
  initialView: "season" | "latest" | "month";
  initialFilter: string;
  teamStandings: SeasonTeamStanding[] | null;
  needsEnrichment: boolean;
};

export function RankingHub({ data: initialData, fantasyRanking, currentPlayerId, initialMode, initialView, initialFilter, teamStandings, needsEnrichment }: RankingHubProps) {
  const mode = initialMode;
  const searchParams = useSearchParams();
  const modeHref = (nextMode: "ranked" | "teams" | "fantasy") => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextMode === "ranked") next.delete("mode");
    else next.set("mode", nextMode);
    return `/ranking${next.size ? `?${next.toString()}` : ""}`;
  };
  const [data, setData] = useState(initialData);
  const [loadingDetails, setLoadingDetails] = useState(needsEnrichment);

  useEffect(() => {
    setData(initialData);
    setLoadingDetails(needsEnrichment);
    if (!needsEnrichment) return;
    let active = true;
    const ids = [...new Set([
      ...(initialData?.general || []),
      ...(initialData?.monthly?.entries || []),
      ...(initialData?.latestRound?.entries || []),
    ].map((entry) => entry.player.id))];
    getRankingEnrichmentForPlayers(ids).then((enrichment) => {
      if (!active || !initialData || !Object.keys(enrichment).length) return;
      const enrich = (entries: typeof initialData.general) => entries.map((entry) => ({
        ...entry,
        ...(enrichment[entry.player.id] || {}),
      }));
      setData({
        ...initialData,
        general: enrich(initialData.general),
        monthly: initialData.monthly ? { ...initialData.monthly, entries: enrich(initialData.monthly.entries) } : null,
        latestRound: initialData.latestRound ? { ...initialData.latestRound, entries: enrich(initialData.latestRound.entries) } : null,
      });
    }).catch(() => {
      // A classificação essencial permanece disponível se os detalhes falharem.
    }).finally(() => {
      if (active) setLoadingDetails(false);
    });
    return () => { active = false; };
  }, [initialData, needsEnrichment]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Área de consulta">
        <Link
          href={modeHref("ranked")}
          prefetch={false}
          role="tab"
          aria-selected={mode === "ranked"}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[10px] font-black sm:text-xs ${mode === "ranked" ? "bg-accent text-background" : "text-muted"}`}
        >
          <Trophy className="h-4 w-4" /> Em Campo
        </Link>
        <Link
          href={modeHref("teams")}
          prefetch={false}
          role="tab"
          aria-selected={mode === "teams"}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[10px] font-black sm:text-xs ${mode === "teams" ? "bg-accent text-background" : "text-muted"}`}
        >
          <Shirt className="h-4 w-4" /> Times
        </Link>
        <Link
          href={modeHref("fantasy")}
          prefetch={false}
          role="tab"
          aria-selected={mode === "fantasy"}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[10px] font-black sm:text-xs ${mode === "fantasy" ? "bg-accent text-background" : "text-muted"}`}
        >
          <ClipboardList className="h-4 w-4" /> Cartola
        </Link>
        <Link href="/jogadores" role="tab" aria-selected="false" className="flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[10px] font-black text-muted sm:text-xs">
          <Users className="h-4 w-4" /> Elenco
        </Link>
      </div>

      {mode === "ranked" && data ? (
        <>
          {loadingDetails && <p role="status" className="text-center text-[11px] text-muted">Pontuação pronta · carregando cinturões e detalhes dos jogadores…</p>}
          <RankingExperience data={data} currentPlayerId={currentPlayerId} initialView={initialView} initialFilter={initialFilter} />
        </>
      ) : mode === "teams" ? (
        <TeamSeasonStandings standings={teamStandings || []} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-foreground">Ranking do Cartola</h1>
              <p className="text-xs text-muted">Classificação geral e patrimônio da temporada.</p>
            </div>
          </div>
          <FantasyRankingList ranking={fantasyRanking || []} />
        </div>
      )}
    </div>
  );
}
