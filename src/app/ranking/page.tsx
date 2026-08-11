import { RankingHub } from "@/components/RankingHub";
import { getCurrentAccount } from "@/lib/auth";
import { getFriendlyStats, getRankingExperienceData } from "@/lib/actions/stats";

export const revalidate = 0;

export default async function RankingPage() {
  const [data, friendlies, account] = await Promise.all([
    getRankingExperienceData(),
    getFriendlyStats(),
    getCurrentAccount(),
  ]);

  return (
    <RankingHub
      data={data}
      friendlies={friendlies}
      currentPlayerId={account.profile?.player_id || null}
    />
  );
}
