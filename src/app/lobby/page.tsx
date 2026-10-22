import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Crown, Plus, Search, Shield, Trophy, Users } from "@/components/icons";
import { LeagueEntryForm } from "@/components/LeagueEntryForm";
import { getCurrentAccount } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { getMyLeagues, type MyLeague } from "@/lib/league-context";
import { continueEntryFlow, reviewAccess, toggleFavorite } from "./actions";
import { ENTRY_FLOW_PENDING_COOKIE } from "@/lib/entry-flow";

export const dynamic = "force-dynamic";

function ClubMark({ league, large = false }: { league: MyLeague; large?: boolean }) {
  return <div className={cn("relative grid shrink-0 place-items-center overflow-hidden border-2 bg-background font-athletic font-black", large ? "h-20 w-20 rounded-3xl text-2xl" : "h-14 w-14 rounded-2xl text-base")} style={{ borderColor: league.accentColor, color: league.accentColor }}>
    {league.logoUrl ? <Image src={league.logoUrl} alt="" fill sizes={large ? "80px" : "56px"} className="object-cover" /> : league.name.slice(0, 2).toUpperCase()}
  </div>;
}

function LeagueCard({ league, featured = false }: { league: MyLeague; featured?: boolean }) {
  return <article className={cn("relative isolate overflow-hidden border bg-surface", featured ? "min-w-[84vw] snap-center rounded-3xl sm:min-w-[380px]" : "rounded-2xl")} style={{ borderColor: `${league.accentColor}55` }}>
    <div className={cn("relative overflow-hidden", featured ? "h-44" : "h-28")}>
      {league.coverUrl ? <Image src={league.coverUrl} alt="" fill sizes={featured ? "(max-width: 640px) 84vw, 380px" : "(max-width: 640px) 100vw, 320px"} className="object-cover" /> : <div className="h-full w-full bg-surface-hover" />}
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute left-4 top-4 flex gap-2"><span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-black uppercase text-white">{league.role === "admin" ? "Administrador" : "Jogador"}</span><span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-black uppercase text-white">{league.featureTier === "complete" ? "Completa" : "Básica"}</span></div>
      <form action={toggleFavorite} className="absolute right-4 top-4"><input type="hidden" name="league_id" value={league.id} /><button type="submit" aria-label={league.isFavorite ? `Desfavoritar ${league.name}` : `Favoritar ${league.name}`} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/55 text-2xl" style={{ color: league.isFavorite ? league.accentColor : "white" }}>{league.isFavorite ? "★" : "☆"}</button></form>
      <div className="absolute inset-x-4 bottom-4 flex items-end gap-3"><ClubMark league={league} large={featured} /><div className="min-w-0 pb-1"><h2 className={cn("truncate font-athletic font-black uppercase text-white", featured ? "text-2xl" : "text-lg")}>{league.name}</h2><p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-white/70"><Shield className="h-3.5 w-3.5" /> {league.visibility === "open" ? "Pelada aberta" : "Pelada privada"}</p></div></div>
    </div>
    <LeagueEntryForm leagueId={league.id} leagueName={league.name} accentColor={league.accentColor} />
  </article>;
}

export default async function LobbyPage({ searchParams }: { searchParams: Promise<{ error?: string; added?: string; deleted?: string }> }) {
  const { user, profile, client } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  const leagues = await getMyLeagues();
  const entryDestination = (await cookies()).get(ENTRY_FLOW_PENDING_COOKIE)?.value || null;
  const { error, added, deleted } = await searchParams;
  const adminLeagueIds = leagues.filter((league) => league.role === "admin").map((league) => league.id);
  const [{ data: requests }, { data: myRequests }] = await Promise.all([
    adminLeagueIds.length ? client.from("league_join_requests").select("id, league_id, user_id, requested_at").in("league_id", adminLeagueIds).eq("status", "pending").order("requested_at") : Promise.resolve({ data: [] }),
    client.from("league_join_requests").select("league_id, status, leagues(name)").eq("user_id", user.id).eq("status", "pending"),
  ]);
  const { data: applicants } = requests?.length ? await client.from("account_profiles").select("user_id, account_tag").in("user_id", requests.map((request) => request.user_id)) : { data: [] };
  const favorites = leagues.filter((league) => league.isFavorite);
  const others = leagues.filter((league) => !league.isFavorite);

  return <main className="space-y-8 pb-8 pt-5">
    <header className="relative overflow-hidden rounded-3xl border border-accent/25 bg-surface p-5"><div className="absolute right-[-30px] top-[-40px] h-36 w-36 rounded-full border border-accent/20" /><p className="text-xs font-black uppercase tracking-[.22em] text-accent">Central das peladas</p><h1 className="mt-2 max-w-md text-balance font-athletic text-4xl font-black uppercase leading-none text-white">Escolha seu próximo jogo</h1><p className="mt-3 max-w-lg text-pretty text-sm leading-6 text-muted">Entre nos seus clubes, encontre uma nova turma ou organize sua própria pelada.</p>{profile?.account_tag && <p className="mt-4 inline-flex rounded-full border border-border bg-background/70 px-3 py-1.5 text-[11px] text-muted">Seu perfil: <strong className="ml-1 text-white">{profile.account_tag}</strong></p>}</header>

    <nav className="grid grid-cols-2 gap-3" aria-label="Ações do lobby"><Link href="/peladas" className="flex min-h-28 flex-col justify-between rounded-2xl border border-accent/30 bg-accent/10 p-4"><Search className="h-6 w-6 text-accent" /><span><strong className="block text-sm text-white">Procurar pelada</strong><small className="mt-1 block text-xs leading-4 text-muted">Explore clubes abertos e privados</small></span></Link><Link href="/lobby/criar" className="flex min-h-28 flex-col justify-between rounded-2xl border border-border bg-surface p-4"><Plus className="h-6 w-6 text-accent" /><span><strong className="block text-sm text-white">Criar uma pelada</strong><small className="mt-1 block text-xs leading-4 text-muted">Comece seu próprio clube</small></span></Link></nav>

    {entryDestination && <section className="rounded-2xl border border-accent/35 bg-accent/10 p-4" aria-labelledby="entry-flow-title"><p className="text-[10px] font-black uppercase text-accent">Apresentação concluída</p><h2 id="entry-flow-title" className="mt-1 text-balance font-athletic text-xl font-black uppercase text-white">Agora escolha sua pelada</h2><p className="mt-2 text-pretty text-xs leading-5 text-muted">Ao entrar em um clube, os próximos acessos voltarão a abrir diretamente na última pelada usada.</p>{entryDestination.startsWith("/convite/") && <form action={continueEntryFlow} className="mt-3"><button type="submit" className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-background">Continuar convite</button></form>}</section>}

    {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">A operação não foi concluída. Atualize a página e tente novamente.</p>}{added && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">Conta adicionada à pelada.</p>}{deleted && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">Pelada excluída.</p>}

    {favorites.length > 0 && <section aria-labelledby="favorite-clubs"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">Seus favoritos</p><h2 id="favorite-clubs" className="font-athletic text-2xl font-black uppercase text-white">Clubes em destaque</h2></div><Trophy className="h-7 w-7 text-accent" /></div><div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">{favorites.map((league) => <LeagueCard key={league.id} league={league} featured />)}</div></section>}

    <section aria-labelledby="all-clubs"><div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-muted">Vestiários</p><h2 id="all-clubs" className="font-athletic text-2xl font-black uppercase text-white">{favorites.length ? "Outras peladas" : "Suas peladas"}</h2></div><span className="flex items-center gap-1 text-xs font-bold text-muted"><Users className="h-4 w-4" /> {leagues.length}</span></div>{others.length ? <div className="grid gap-3 sm:grid-cols-2">{others.map((league) => <LeagueCard key={league.id} league={league} />)}</div> : favorites.length ? <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Todas as suas peladas estão nos favoritos.</p> : <div className="rounded-2xl border border-border bg-surface p-5 text-sm leading-6 text-muted">Você ainda não participa de nenhuma pelada. <Link href="/peladas" className="font-bold text-accent">Encontre uma turma</Link> ou <Link href="/lobby/criar" className="font-bold text-accent">crie a sua</Link>.</div>}</section>

    {(myRequests || []).length > 0 && <section className="rounded-2xl border border-warning/30 bg-warning/5 p-4"><h2 className="flex items-center gap-2 font-athletic text-lg font-black uppercase text-white"><Shield className="h-5 w-5 text-warning" /> Aguardando aprovação</h2><ul className="mt-3 space-y-2 text-sm text-muted">{(myRequests || []).map((request) => <li key={request.league_id} className="rounded-xl bg-background/60 px-3 py-2">{request.leagues?.[0]?.name || "Pelada"}</li>)}</ul></section>}

    {(requests || []).length > 0 && <section className="rounded-2xl border border-accent/30 bg-surface p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-accent">Área do ADM</p><h2 className="font-athletic text-xl font-black uppercase text-white">Pedidos de entrada</h2></div><Crown className="h-6 w-6 text-accent" /></div><div className="mt-3 space-y-2">{requests!.map((request) => { const account = applicants?.find((item) => item.user_id === request.user_id); return <div key={request.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{account?.account_tag || "Conta"}</p><p className="truncate text-xs text-muted">{leagues.find((league) => league.id === request.league_id)?.name}</p></div><div className="flex gap-1">{["approve", "reject"].map((decision) => <form action={reviewAccess} key={decision}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="decision" value={decision} /><button type="submit" className={cn("rounded-lg px-3 py-2 text-xs font-black", decision === "approve" ? "bg-accent text-background" : "border border-border text-muted")}>{decision === "approve" ? "Aceitar" : "Recusar"}</button></form>)}</div></div>; })}</div></section>}

    <p className="text-center text-xs text-muted">Os visuais e cosméticos acompanham sua conta em todas as peladas. <Link href="/meu-perfil?aba=cosmeticos" className="font-bold text-accent">Ver meu perfil</Link></p>
  </main>;
}
