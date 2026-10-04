import { RankingHub } from "@/components/RankingHub";
import { getFantasyRanking } from "@/lib/actions/fantasy";
import { getRankingExperienceData } from "@/lib/actions/stats";
import { getCurrentAccount } from "@/lib/auth";
import { getSeasonTeamStandings } from "@/lib/actions/team-standings";

export const revalidate = 0;

export default async function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const params = await searchParams;
  const initialMode = params.mode === "fantasy" ? "fantasy" : params.mode === "teams" ? "teams" : "ranked";
  const initialView = params.period === "latest" || params.period === "month" ? params.period : "season";
  const allowedFilters = new Set(["general", "goals", "assists", "wins", "winRate", "awards", "overall", "overallDef", "overallAta", "overallGol"]);
  const initialFilter = typeof params.filter === "string" && allowedFilters.has(params.filter) ? params.filter : "general";
  const [data, fantasyRanking, account, teamStandings] = await Promise.all([
    getRankingExperienceData(),
    getFantasyRanking(),
    getCurrentAccount(),
    getSeasonTeamStandings(),
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
    />
  );
}
