import { RankingHub } from "@/components/RankingHub";
import { getFantasyRanking } from "@/lib/actions/fantasy";
import { getRankingExperienceData } from "@/lib/actions/stats";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

export default async function RankingPage() {
  const [data, fantasyRanking, account] = await Promise.all([
    getRankingExperienceData(),
    getFantasyRanking(),
    getCurrentAccount(),
  ]);

  return (
    <RankingHub
      data={data}
      fantasyRanking={fantasyRanking}
      currentPlayerId={account.profile?.player_id || null}
    />
  );
}
