import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { getMyLeagues } from "@/lib/league-context";
import {
  enterLeague,
  joinOpenLeague,
  requestClosedLeague,
} from "@/app/lobby/actions";

export const dynamic = "force-dynamic";

type DiscoverableLeague = {
  league_id: string;
  league_name: string;
  league_slug: string;
  feature_tier: "basic" | "complete";
  visibility: "private" | "open";
};

export default async function DiscoverLeaguesPage({ searchParams }: {
  searchParams: Promise<{ q?: string; error?: string; requested?: string }>;
}) {
  const { user, client } = await getCurrentAccount();
  if (!user) redirect("/login?next=/peladas");
  const { q, error, requested } = await searchParams;
  const query = String(q || "").trim().slice(0, 80);

  const [{ data: leagues, error: discoveryError }, myLeagues, { data: requests }] = await Promise.all([
    client.rpc("find_leagues", { p_query: query }),
    getMyLeagues(),
    client.from("league_join_requests")
      .select("league_id")
      .eq("user_id", user.id)
      .eq("status", "pending"),
  ]);
  const joinedIds = new Set(myLeagues.map((league) => league.id));
  const pendingIds = new Set((requests || []).map((request) => request.league_id));
  const catalog = (leagues || []) as DiscoverableLeague[];

  return <div className="space-y-6 py-5">
    <div>
      <Link href="/lobby" className="text-xs font-black text-accent">← Voltar ao lobby</Link>
      <p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-accent">Comunidade</p>
      <h1 className="mt-1 font-athletic text-3xl font-black uppercase text-white">Encontre sua pelada</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Todas as peladas ativas aparecem aqui. Entre imediatamente nas abertas ou solicite aprovação nas fechadas.
      </p>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-accent/25 bg-accent/10 p-3">
        <p className="text-xs font-black uppercase text-accent">Pelada aberta</p>
        <p className="mt-1 text-[11px] leading-4 text-muted">Entrada imediata, sem convite.</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="text-xs font-black uppercase text-white">Pelada fechada</p>
        <p className="mt-1 text-[11px] leading-4 text-muted">Um administrador aprova o pedido.</p>
      </div>
    </div>

    <form action="/peladas" method="GET" className="flex gap-2">
      <input name="q" defaultValue={query} maxLength={80} placeholder="Buscar pelo nome da pelada" aria-label="Nome da pelada" className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white" />
      <button className="rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Buscar</button>
    </form>

    {requested && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">Pedido enviado. Um administrador da pelada poderá aprová-lo pelo lobby.</p>}
    {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
      {error === "request" ? "Não foi possível enviar o pedido. Verifique se ele já está pendente e tente novamente." : "Não foi possível entrar nessa pelada. Atualize a lista e tente novamente."}
    </p>}

    {discoveryError ? <p role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">O catálogo completo estará disponível depois de aplicar a migration 313.</p>
      : catalog.length ? <div className="space-y-3">{catalog.map((league) => {
        const joined = joinedIds.has(league.league_id);
        const pending = pendingIds.has(league.league_id);
        const isOpen = league.visibility === "open";
        return <article key={league.league_id} className={`rounded-2xl border p-4 ${isOpen ? "border-accent/30 bg-accent/5" : "border-border bg-surface"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-athletic text-xl font-black text-white">{league.league_name}</h2>
              <p className="mt-1 text-xs text-muted">{league.feature_tier === "basic" ? "Modo básico · ranking e organização" : "Modo completo · ranking, Cartola e extras"}</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase ${isOpen ? "bg-accent/15 text-accent" : "bg-white/5 text-muted"}`}>
              {isOpen ? "Aberta" : "Fechada"}
            </span>
          </div>

          {joined ? <form action={enterLeague} className="mt-4">
            <input type="hidden" name="league_id" value={league.league_id} />
            <button className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Abrir esta pelada</button>
          </form> : pending ? <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-center text-xs font-black text-warning">Pedido aguardando aprovação</div>
            : isOpen ? <form action={joinOpenLeague} className="mt-4">
              <input type="hidden" name="league_id" value={league.league_id} />
              <button className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Entrar agora</button>
            </form> : <form action={requestClosedLeague} className="mt-4">
              <input type="hidden" name="league_id" value={league.league_id} />
              <button className="w-full rounded-xl border border-accent/40 px-4 py-3 text-sm font-black text-accent">Solicitar entrada</button>
            </form>}
        </article>;
      })}</div> : <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">Nenhuma pelada encontrada com esse nome.</div>}

    <Link href="/lobby/criar" className="block rounded-2xl border border-accent/30 bg-accent/10 p-4 text-center">
      <span className="block text-sm font-black text-accent">Não encontrou? Crie sua própria pelada</span>
      <span className="mt-1 block text-xs text-muted">Você escolhe se ela será aberta ou fechada.</span>
    </Link>
  </div>;
}
