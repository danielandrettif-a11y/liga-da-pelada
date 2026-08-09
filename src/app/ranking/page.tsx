import { RankingExperience } from "@/components/RankingExperience";
import { getCurrentAccount } from "@/lib/auth";
import { getRankingExperienceData } from "@/lib/actions/stats";

export const revalidate = 0;

export default async function RankingPage() {
  const [data, account] = await Promise.all([
    getRankingExperienceData(),
    getCurrentAccount(),
  ]);

  return (
    <RankingExperience
      data={data}
      currentPlayerId={account.profile?.player_id || null}
    />
  );
}
