import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { getMyLeagues } from "@/lib/league-context";
import { addExistingAccount, enterLeague, reviewAccess, toggleFavorite } from "./actions";

export const dynamic = "force-dynamic";

export default async function LobbyPage({ searchParams }: { searchParams: Promise<{ error?: string; lookup?: string; league?: string; added?: string; deleted?: string }> }) {
  const { user, profile, client } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  const leagues = await getMyLeagues();
  const { error, lookup, league: lookupLeagueId, added, deleted } = await searchParams;
  const adminLeagueIds = leagues.filter((league) => league.role === "admin").map((league) => league.id);
  const [{ data: requests }, { data: myRequests }] = await Promise.all([
    adminLeagueIds.length
      ? client.from("league_join_requests").select("id, league_id, user_id, requested_at").in("league_id", adminLeagueIds).eq("status", "pending").order("requested_at")
      : Promise.resolve({ data: [] }),
    client.from("league_join_requests").select("league_id, status, leagues(name)").eq("user_id", user.id).eq("status", "pending"),
  ]);
  const { data: applicants } = requests?.length
    ? await client.from("account_profiles").select("user_id, account_tag").in("user_id", requests.map((request) => request.user_id))
    : { data: [] };
  const lookupLeague = leagues.find((league) => league.id === lookupLeagueId && league.role === "admin");
  const { data: searchResults } = lookupLeague && lookup?.trim()
    ? await client.rpc("find_account_for_league", { p_league_id: lookupLeague.id, p_account_tag: lookup.trim() })
    : { data: [] };

  return (
    <div className="space-y-6 py-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[.2em] text-accent">Lobby</p>
        <h1 className="mt-1 font-athletic text-3xl font-black uppercase text-white">Suas peladas</h1>
        <p className="mt-2 text-sm text-muted">Escolha onde quer jogar. As favoritas ficam primeiro.</p>
        {profile?.account_tag && <p className="mt-2 text-xs text-muted">Seu identificador: <span className="font-bold text-white">{profile.account_tag}</span></p>}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <a href="#minhas-peladas" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm font-black text-accent">Entrar na minha pelada <span className="mt-1 block text-[11px] font-normal text-muted">Escolha uma da sua lista</span></a>
        <Link href="/peladas" className="rounded-xl border border-border bg-surface p-3 text-sm font-black text-white">Procurar pelada <span className="mt-1 block text-[11px] font-normal text-muted">Descubra as abertas</span></Link>
        {adminLeagueIds.length > 0 && <Link href="/lobby/criar" className="rounded-xl border border-border bg-surface p-3 text-sm font-black text-white">Criar pelada <span className="mt-1 block text-[11px] font-normal text-muted">Básica ou Completa</span></Link>}
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">A operação não foi concluída. Atualize a página e tente novamente.</p>}
      {added && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">Conta adicionada à pelada.</p>}
      {deleted && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">Pelada excluída. Seus dados não aparecem mais no lobby.</p>}

      {leagues.length ? <div id="minhas-peladas" className="space-y-3">
        {leagues.map((league) => <div key={league.id} className="rounded-2xl border border-accent/25 bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-athletic text-xl font-bold text-white">{league.name}</h2>
              <p className="text-xs uppercase tracking-wide text-muted">{league.role === "admin" ? "Administrador" : "Jogador"} · {league.featureTier === "basic" ? "Básica" : "Completa"}</p>
            </div>
            <form action={toggleFavorite}>
              <input type="hidden" name="league_id" value={league.id} />
              <button type="submit" aria-label={league.isFavorite ? `Desfavoritar ${league.name}` : `Favoritar ${league.name}`} className={`text-2xl ${league.isFavorite ? "text-accent" : "text-muted"}`}>{league.isFavorite ? "★" : "☆"}</button>
            </form>
          </div>
          <form action={enterLeague} className="mt-4">
            <input type="hidden" name="league_id" value={league.id} />
            <button type="submit" className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-black">Entrar na pelada</button>
          </form>
        </div>)}
      </div> : <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">Você ainda não participa de nenhuma pelada. <Link href="/peladas" className="font-bold text-accent">Procure uma aberta</Link> ou peça um convite ao administrador.</div>}

      {(myRequests || []).length > 0 && <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-athletic text-lg font-bold text-white">Aguardando aprovação</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">{(myRequests || []).map((request) => <li key={request.league_id}>{request.leagues?.[0]?.name || "Pelada"}</li>)}</ul>
      </section>}

      {(requests || []).length > 0 && <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-athletic text-lg font-bold text-white">Pedidos de entrada</h2>
        <div className="mt-3 space-y-3">{(requests || []).map((request) => {
          const account = applicants?.find((item) => item.user_id === request.user_id);
          return <div key={request.id} className="rounded-xl border border-border p-3">
            <p className="text-sm font-bold text-white">{account?.account_tag || "Conta"}</p>
            <p className="text-xs text-muted">{leagues.find((league) => league.id === request.league_id)?.name}</p>
            <div className="mt-2 flex gap-2">{["approve", "reject"].map((decision) => <form action={reviewAccess} key={decision}>
              <input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="decision" value={decision} />
              <button type="submit" className="rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-bold text-accent">{decision === "approve" ? "Aprovar" : "Recusar"}</button>
            </form>)}</div>
          </div>;
        })}</div>
      </section>}

      {adminLeagueIds.length > 0 && <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-athletic text-lg font-bold text-white">Adicionar conta cadastrada</h2>
        <p className="mt-1 text-xs text-muted">Peça o identificador completo, por exemplo usuario#123456.</p>
        <form method="GET" action="/lobby" className="mt-3 space-y-2">
          <select name="league" defaultValue={lookupLeague?.id || adminLeagueIds[0]} className="w-full rounded-xl border border-border bg-background p-3 text-sm text-white">
            {leagues.filter((league) => league.role === "admin").map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
          </select>
          <input name="lookup" defaultValue={lookup || ""} placeholder="usuario#123456" className="w-full rounded-xl border border-border bg-background p-3 text-sm text-white" />
          <button type="submit" className="rounded-xl border border-accent/40 px-4 py-2 text-sm font-bold text-accent">Buscar conta</button>
        </form>
        {lookup && lookupLeague && <div className="mt-3">
          {(searchResults || []).length ? searchResults!.map((result: { user_id: string; player_name: string; account_tag: string; already_member: boolean }) => <div key={result.user_id} className="rounded-xl border border-border p-3 text-sm">
            <p className="font-bold text-white">{result.player_name} · {result.account_tag}</p>
            {result.already_member ? <p className="mt-1 text-muted">Já participa desta pelada.</p> : <form action={addExistingAccount} className="mt-2">
              <input type="hidden" name="league_id" value={lookupLeague.id} /><input type="hidden" name="user_id" value={result.user_id} />
              <button type="submit" className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-black">Adicionar à pelada</button>
            </form>}
          </div>) : <p className="text-xs text-muted">Nenhuma conta com esse identificador exato.</p>}
        </div>}
      </section>}

      <p className="text-center text-xs text-muted">Recebeu um convite? Abra o link enviado pelo administrador. <Link href="/meu-perfil" className="text-accent underline">Meu perfil</Link></p>
    </div>
  );
}
