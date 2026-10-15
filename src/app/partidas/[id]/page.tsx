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
  const [match, league, account] = await Promise.all([
    getMatch(id),
    getLeagueConfig(),
    getCurrentAccount(),
  ]);

  if (!match) {
    notFound();
  }

  // O histórico de correções só aparece para ADM após o encerramento.
  // Evita consultar auditoria em toda atualização do placar ao vivo.
  const auditLog = match.status === "finished" && account.isAdmin
    ? await getFinishedMatchAudit(id)
    : [];

  const duration = league?.match_duration || 7;

  return (
    <MatchLiveBoard match={match} matchDuration={duration} canManage={account.isAdmin} auditLog={auditLog} />
  );
}
