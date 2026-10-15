import { getCurrentAccount } from "@/lib/auth";
import { getSelectedLeague } from "@/lib/league-context";
import { CopyLeagueInvite } from "./CopyLeagueInvite";

export async function LeagueInviteCard() {
  const [account, league] = await Promise.all([getCurrentAccount(), getSelectedLeague()]);
  if (!account.isAdmin || !league || league.role !== "admin") return null;
  const { data: token } = await account.client.rpc("get_league_invite", { p_league_id: league.id });
  if (!token) return null;
  return <div className="rounded-2xl border border-accent/25 bg-accent/5 p-4">
    <p className="text-sm font-bold text-white">Convide para {league.name}</p>
    <p className="mb-3 mt-1 text-xs text-muted">Quem abrir o link precisará da aprovação de um ADM.</p>
    <CopyLeagueInvite token={token} name={league.name} />
  </div>;
}
