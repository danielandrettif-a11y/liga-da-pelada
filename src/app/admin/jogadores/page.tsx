import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserPlus } from "@/components/icons";
import { AdminRosterDirectory } from "@/components/AdminRosterDirectory";
import { RosterSeenMarker } from "@/components/RosterSeenMarker";
import { getPlayers } from "@/lib/actions/players";
import { getCurrentAccount } from "@/lib/auth";

export const revalidate = 0;

export default async function AdminJogadoresPage() {
  const account = await getCurrentAccount();
  if (!account.isAdmin) redirect("/");
  const [players, { data: adminProfiles }] = await Promise.all([
    getPlayers(),
    account.client.from("account_profiles").select("player_id").eq("role", "admin").not("player_id", "is", null),
  ]);
  const adminPlayerIds = (adminProfiles || []).map((profile) => profile.player_id).filter((id): id is string => Boolean(id));

  return (
    <div className="space-y-6">
      <RosterSeenMarker />
      <div className="flex items-center gap-3">
        <Link href="/mais" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover"><ArrowLeft className="h-5 w-5 text-muted" /></Link>
        <div className="min-w-0 flex-1"><h1 className="text-xl font-black text-foreground">Gerenciar Elenco</h1><p className="mt-0.5 text-xs text-muted">{players.length} pessoas cadastradas</p></div>
        <Link href="/admin/jogadores/novo" className="flex shrink-0 items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs font-black text-background"><UserPlus className="h-4 w-4" /><span className="hidden min-[390px]:inline">Nova pessoa</span></Link>
      </div>
      <AdminRosterDirectory players={players} adminPlayerIds={adminPlayerIds} />
    </div>
  );
}
