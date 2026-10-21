import { RankingHub } from "@/components/RankingHub";
import { getFantasyRanking } from "@/lib/actions/fantasy";
import { getRankingEssentialData, getRankingExperienceData } from "@/lib/actions/stats";
import { getCurrentAccount } from "@/lib/auth";
import { getSeasonTeamStandings } from "@/lib/actions/team-standings";

export const revalidate = 0;

export default async function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const params = await searchParams;
  const initialMode = params.mode === "fantasy" ? "fantasy" : params.mode === "teams" ? "teams" : "ranked";
  const initialView = params.period === "latest" || params.period === "month" ? params.period : "season";
  const allowedFilters = new Set(["general", "goals", "assists", "wins", "winRate", "awards", "overall", "overallDef", "overallAta", "overallGol"]);
  const initialFilter = typeof params.filter === "string" && allowedFilters.has(params.filter) ? params.filter : "general";
  const needsEnrichment = initialMode === "ranked" && !initialFilter.startsWith("overall");
  // Cada aba carrega apenas o próprio conjunto de dados. Antes, a abertura do
  // ranking esperava também Cartola e times, mesmo sem exibi-los.
  const [data, fantasyRanking, account, teamStandings] = await Promise.all([
    initialMode === "ranked"
      ? (needsEnrichment ? getRankingEssentialData() : getRankingExperienceData())
      : Promise.resolve(null),
    initialMode === "fantasy" ? getFantasyRanking() : Promise.resolve(null),
    getCurrentAccount(),
    initialMode === "teams" ? getSeasonTeamStandings() : Promise.resolve(null),
  ]);

  return (
    <RankingHub
      data={data}
      fantasyRanking={fantasyRanking}
      currentPlayerId={account.profile?.player_id || null}
      initialMode={initialMode}
      initialView={initialView}
      initialFilter={initialFilter}
      teamStandings={teamStandings}
      needsEnrichment={needsEnrichment}
    />
  );
}
