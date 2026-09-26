import { getFinishedMatchAudit, getMatch } from "@/lib/actions/matches";
import { getLeagueConfig } from "@/lib/actions/league";
import { notFound } from "next/navigation";
import { MatchLiveBoard } from "@/components/MatchLiveBoard";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

export default async function PartidaAoVivoPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const [match, league, account, auditLog] = await Promise.all([
    getMatch(id),
    getLeagueConfig(),
    getCurrentAccount(),
    getFinishedMatchAudit(id),
  ]);

  if (!match) {
    notFound();
  }

  const duration = league?.match_duration || 7;

  return (
    <MatchLiveBoard match={match} matchDuration={duration} canManage={account.isAdmin} auditLog={auditLog} />
  );
}
