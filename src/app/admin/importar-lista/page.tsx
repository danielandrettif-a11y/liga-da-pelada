import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { getSelectedLeague } from "@/lib/league-context";
import { GuestRosterImport } from "@/components/GuestRosterImport";

export const dynamic = "force-dynamic";

export default async function ImportListPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
  const [account, league] = await Promise.all([getCurrentAccount(), getSelectedLeague()]);
  if (!account.isAdmin || !league || league.role !== "admin") redirect("/lobby");
  const { data: members } = await account.client.from("league_members").select("players(name)").eq("league_id", league.id);
  const { error, created } = await searchParams;
  return <div className="space-y-5 py-5">
    <Link href="/admin/jogadores" className="text-sm font-bold text-accent">← Voltar ao elenco</Link>
    <div><p className="text-xs font-bold uppercase tracking-wider text-accent">{league.name}</p><h1 className="font-athletic text-2xl font-black uppercase text-white">Convocar lista em TXT</h1></div>
    <p className="text-sm text-muted">Cada nome vira um convidado com configuração inicial neutra. Você pode unir o perfil ao cadastro oficial depois. Havendo convocação aberta, eles entram nela também.</p>
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200">Não foi possível importar. Confira a lista e tente novamente.</p>}
    {created !== undefined && <p role="status" className="rounded-xl bg-accent/10 p-3 text-sm text-accent">{created} perfis criados. Nomes já existentes foram ignorados.</p>}
    <GuestRosterImport existingNames={(members || []).flatMap((member) => member.players?.map((player) => player.name) || [])} />
  </div>;
}
