import { getMatch } from "@/lib/actions/matches";
import { getLeagueConfig } from "@/lib/actions/league";
import { notFound } from "next/navigation";
import { MatchLiveBoard } from "@/components/MatchLiveBoard";

export const revalidate = 0;

export default async function PartidaAoVivoPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const match = await getMatch(id);

  if (!match) {
    notFound();
  }

  const league = await getLeagueConfig();
  const duration = league?.match_duration || 7;

  return (
    <MatchLiveBoard match={match} matchDuration={duration} />
  );
}
