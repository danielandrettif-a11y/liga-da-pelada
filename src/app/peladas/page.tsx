import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { getMyLeagues } from "@/lib/league-context";
import { joinOpenLeague } from "@/app/lobby/actions";

export const dynamic = "force-dynamic";

type OpenLeague = { league_id: string; league_name: string; league_slug: string; feature_tier: string };

export default async function DiscoverLeaguesPage({ searchParams }: {
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const { user, client } = await getCurrentAccount();
  if (!user) redirect("/login?next=/peladas");
  const { q, error } = await searchParams;
  const query = String(q || "").trim().slice(0, 80);
  const [{ data: leagues, error: discoveryError }, myLeagues] = await Promise.all([
    client.rpc("find_open_leagues", { p_query: query }),
    getMyLeagues(),
  ]);
  const joinedIds = new Set(myLeagues.map((league) => league.id));

  return <div className="space-y-6 py-5">
    <div><Link href="/lobby" className="text-xs font-black text-accent">← Voltar ao lobby</Link><h1 className="mt-3 font-athletic text-3xl font-black uppercase text-white">Descobrir peladas</h1><p className="mt-2 text-sm text-muted">Peladas abertas aparecem aqui. As privadas só podem ser acessadas por convite ou pelo ADM.</p></div>
    <form action="/peladas" method="GET" className="flex gap-2">
      <input name="q" defaultValue={query} maxLength={80} placeholder="Nome da pelada" aria-label="Nome da pelada" className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white" />
      <button className="rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Buscar</button>
    </form>
    {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">Não foi possível entrar nessa pelada. Atualize a lista e tente novamente.</p>}
    {discoveryError ? <p role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">A descoberta estará disponível depois da atualização do banco de dados.</p>
      : (leagues as OpenLeague[] || []).length ? <div className="space-y-3">{(leagues as OpenLeague[]).map((league) => <article key={league.league_id} className="rounded-2xl border border-accent/25 bg-surface p-4">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-athletic text-xl font-black text-white">{league.league_name}</h2><p className="mt-1 text-xs text-muted">Aberta · {league.feature_tier === "basic" ? "Básica" : "Completa"}</p></div><span className="rounded-full bg-accent/10 px-3 py-1 text-[10px] font-black uppercase text-accent">Aberta</span></div>
        {joinedIds.has(league.league_id) ? <p className="mt-4 text-xs font-bold text-accent">Você já participa desta pelada.</p> : <form action={joinOpenLeague} className="mt-4"><input type="hidden" name="league_id" value={league.league_id} /><button className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Entrar na pelada</button></form>}
      </article>)}</div> : <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">Nenhuma pelada aberta encontrada. Você também pode pedir um link de convite para uma pelada privada.</div>}
  </div>;
}
