import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { CalendarDays, ChevronRight, Crown, Plus, Search, Shield, Trophy, Users } from "@/components/icons";
import { LeagueEntryForm } from "@/components/LeagueEntryForm";
import { getCurrentAccount } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { getMyLeagues, type MyLeague } from "@/lib/league-context";
import { continueEntryFlow, enterArchivedQuickLeague, reviewAccess, toggleFavorite } from "./actions";
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
      <div className="absolute left-4 top-4 flex gap-2"><span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-black uppercase text-white">{league.role === "admin" ? "Administrador" : "Jogador"}</span><span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-black uppercase text-white">{league.featureTier === "quick" ? "Descartável" : league.featureTier === "complete" ? "Completa" : "Básica"}</span></div>
      <form action={toggleFavorite} className="absolute right-4 top-4"><input type="hidden" name="league_id" value={league.id} /><button type="submit" aria-label={league.isFavorite ? `Desfavoritar ${league.name}` : `Favoritar ${league.name}`} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/55 text-2xl" style={{ color: league.isFavorite ? league.accentColor : "white" }}>{league.isFavorite ? "★" : "☆"}</button></form>
      <div className="absolute inset-x-4 bottom-4 flex items-end gap-3"><ClubMark league={league} large={featured} /><div className="min-w-0 pb-1"><h2 className={cn("truncate font-athletic font-black uppercase text-white", featured ? "text-2xl" : "text-lg")}>{league.name}</h2><p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-white/70"><Shield className="h-3.5 w-3.5" /> {league.visibility === "open" ? "Pelada aberta" : "Pelada privada"}</p></div></div>
    </div>
    <LeagueEntryForm leagueId={league.id} leagueName={league.name} accentColor={league.accentColor} />
  </article>;
}

export default async function LobbyPage({ searchParams }: { searchParams: Promise<{ error?: string; added?: string; deleted?: string; archived?: string }> }) {
  const { user, profile, client } = await getCurrentAccount();
  if (!user) redirect("/login?next=/lobby");
  const leagues = await getMyLeagues();
  const activeLeagues = leagues.filter((league) => !league.archivedAt);
  const archivedQuickLeagues = leagues.filter((league) => league.featureTier === "quick" && league.archivedAt);
  const entryDestination = (await cookies()).get(ENTRY_FLOW_PENDING_COOKIE)?.value || null;
  const { error, added, deleted, archived } = await searchParams;
  const adminLeagueIds = activeLeagues.filter((league) => league.role === "admin" && league.featureTier !== "quick").map((league) => league.id);
  const [{ data: requests }, { data: myRequests }] = await Promise.all([
    adminLeagueIds.length ? client.from("league_join_requests").select("id, league_id, user_id, requested_at").in("league_id", adminLeagueIds).eq("status", "pending").order("requested_at") : Promise.resolve({ data: [] }),
    client.from("league_join_requests").select("league_id, status, leagues(name)").eq("user_id", user.id).eq("status", "pending"),
  ]);
  const { data: applicants } = requests?.length ? await client.from("account_profiles").select("user_id, account_tag").in("user_id", requests.map((request) => request.user_id)) : { data: [] };
  const favorites = activeLeagues.filter((league) => league.isFavorite);
  const others = activeLeagues.filter((league) => !league.isFavorite);

  return <main className="space-y-8 pb-8 pt-5">
    <header className="relative isolate overflow-hidden rounded-[2rem] border border-accent/30 bg-[linear-gradient(135deg,#102719_0%,#07160e_58%,#06110b_100%)] p-5 shadow-[0_22px_70px_rgba(0,0,0,.28)]">
      <div aria-hidden="true" className="absolute -right-12 -top-14 h-48 w-48 rounded-full border border-accent/20 bg-accent/[.025]" />
      <div aria-hidden="true" className="absolute -right-1 top-0 h-full w-px rotate-[24deg] bg-accent/10" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[.24em] text-accent">Central das peladas</p>
        {profile?.account_tag && <span title={profile.account_tag} className="max-w-36 truncate rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[9px] font-bold text-white/55">{profile.account_tag}</span>}
      </div>
      <div className="relative mt-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-athletic text-5xl font-black uppercase leading-[.88] text-white">Bora<br /><span className="text-accent">jogar?</span></h1>
          <p className="mt-3 text-xs font-bold text-white/55">Escolha como entrar em campo.</p>
        </div>
        <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent/10 text-accent shadow-[0_0_28px_rgba(204,255,0,.08)]">
          <Trophy className="h-7 w-7" />
        </span>
      </div>
    </header>

    <nav className="grid grid-cols-2 gap-3" aria-label="Ações do lobby">
      <Link href="/peladas" className="group relative flex min-h-40 flex-col overflow-hidden rounded-3xl border border-accent/25 bg-[linear-gradient(145deg,rgba(204,255,0,.12),rgba(12,30,20,.96)_62%)] p-4 shadow-[0_16px_40px_rgba(0,0,0,.2)] transition-all hover:border-accent/55 hover:-translate-y-0.5 active:scale-[.98]">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-background shadow-[0_8px_24px_rgba(204,255,0,.16)]"><Search className="h-5 w-5" strokeWidth={2.4} /></span>
        <strong className="mt-5 block text-balance font-athletic text-xl font-black uppercase leading-[1.05] text-white">Encontrar<br />pelada</strong>
        <span className="mt-auto flex items-center gap-1 pt-3 text-[10px] font-black uppercase tracking-[.16em] text-accent">Entrar <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
      </Link>
      <Link href="/lobby/criar" className="group relative flex min-h-40 flex-col overflow-hidden rounded-3xl border border-accent/25 bg-[linear-gradient(145deg,rgba(204,255,0,.08),rgba(12,30,20,.96)_62%)] p-4 shadow-[0_16px_40px_rgba(0,0,0,.2)] transition-all hover:border-accent/55 hover:-translate-y-0.5 active:scale-[.98]">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-accent/35 bg-accent/10 text-accent"><Plus className="h-6 w-6" strokeWidth={2.4} /></span>
        <strong className="mt-5 block text-balance font-athletic text-xl font-black uppercase leading-[1.05] text-white">Criar<br />pelada</strong>
        <span className="mt-auto flex items-center gap-1 pt-3 text-[10px] font-black uppercase tracking-[.16em] text-accent">Começar <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
      </Link>
    </nav>

    {entryDestination && <section className="rounded-2xl border border-accent/35 bg-accent/10 p-4" aria-labelledby="entry-flow-title"><p className="text-[10px] font-black uppercase text-accent">Apresentação concluída</p><h2 id="entry-flow-title" className="mt-1 text-balance font-athletic text-xl font-black uppercase text-white">Agora escolha sua pelada</h2><p className="mt-2 text-pretty text-xs leading-5 text-muted">Ao entrar em um clube, os próximos acessos voltarão a abrir diretamente na última pelada usada.</p>{entryDestination.startsWith("/convite/") && <form action={continueEntryFlow} className="mt-3"><button type="submit" className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-black text-background">Continuar convite</button></form>}</section>}

    {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">A operação não foi concluída. Atualize a página e tente novamente.</p>}{added && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">Conta adicionada à pelada.</p>}{deleted && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">Pelada excluída.</p>}{archived && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">Pelada encerrada e arquivada. O histórico e os pagamentos continuam disponíveis abaixo.</p>}

    {favorites.length > 0 && <section aria-labelledby="favorite-clubs"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">Seus favoritos</p><h2 id="favorite-clubs" className="font-athletic text-2xl font-black uppercase text-white">Clubes em destaque</h2></div><Trophy className="h-7 w-7 text-accent" /></div><div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">{favorites.map((league) => <LeagueCard key={league.id} league={league} featured />)}</div></section>}

    <section aria-labelledby="all-clubs"><div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-muted">Vestiários</p><h2 id="all-clubs" className="font-athletic text-2xl font-black uppercase text-white">{favorites.length ? "Outras peladas" : "Suas peladas"}</h2></div><span className="flex items-center gap-1 text-xs font-bold text-muted"><Users className="h-4 w-4" /> {activeLeagues.length}</span></div>{others.length ? <div className="grid gap-3 sm:grid-cols-2">{others.map((league) => <LeagueCard key={league.id} league={league} />)}</div> : favorites.length ? <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Todas as suas peladas estão nos favoritos.</p> : <div className="rounded-2xl border border-border bg-surface p-5 text-sm leading-6 text-muted">Você ainda não participa de nenhuma pelada ativa. <Link href="/peladas" className="font-bold text-accent">Encontre uma turma</Link> ou <Link href="/lobby/criar" className="font-bold text-accent">crie a sua</Link>.</div>}</section>

    {archivedQuickLeagues.length > 0 && <section aria-labelledby="quick-history"><div className="mb-3"><p className="text-[10px] font-black uppercase tracking-[.2em] text-muted">Arquivo temporário</p><h2 id="quick-history" className="font-athletic text-2xl font-black uppercase text-white">Peladas descartáveis encerradas</h2><p className="mt-1 text-xs leading-5 text-muted">O histórico fica disponível por até 7 dias. Quando todos pagarem, a exclusão definitiva acontece 3 dias depois.</p></div><div className="space-y-2">{archivedQuickLeagues.map((league) => <form key={league.id} action={enterArchivedQuickLeague} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"><input type="hidden" name="league_id" value={league.id} /><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10"><CalendarDays className="h-5 w-5 text-accent" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{league.name}</strong><span className="block text-[11px] text-muted">Encerrada em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(league.archivedAt!))}</span>{league.quickPurgeAt && <span className="block text-[10px] font-bold text-warning">Exclusão automática: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(league.quickPurgeAt))}</span>}</span><button type="submit" className="rounded-xl border border-accent/40 px-3 py-2 text-xs font-black text-accent">Ver histórico</button></form>)}</div></section>}

    {(myRequests || []).length > 0 && <section className="rounded-2xl border border-warning/30 bg-warning/5 p-4"><h2 className="flex items-center gap-2 font-athletic text-lg font-black uppercase text-white"><Shield className="h-5 w-5 text-warning" /> Aguardando aprovação</h2><ul className="mt-3 space-y-2 text-sm text-muted">{(myRequests || []).map((request) => <li key={request.league_id} className="rounded-xl bg-background/60 px-3 py-2">{request.leagues?.[0]?.name || "Pelada"}</li>)}</ul></section>}

    {(requests || []).length > 0 && <section className="rounded-2xl border border-accent/30 bg-surface p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-accent">Área do ADM</p><h2 className="font-athletic text-xl font-black uppercase text-white">Pedidos de entrada</h2></div><Crown className="h-6 w-6 text-accent" /></div><div className="mt-3 space-y-2">{requests!.map((request) => { const account = applicants?.find((item) => item.user_id === request.user_id); return <div key={request.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{account?.account_tag || "Conta"}</p><p className="truncate text-xs text-muted">{leagues.find((league) => league.id === request.league_id)?.name}</p></div><div className="flex gap-1">{["approve", "reject"].map((decision) => <form action={reviewAccess} key={decision}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="decision" value={decision} /><button type="submit" className={cn("rounded-lg px-3 py-2 text-xs font-black", decision === "approve" ? "bg-accent text-background" : "border border-border text-muted")}>{decision === "approve" ? "Aceitar" : "Recusar"}</button></form>)}</div></div>; })}</div></section>}

    <p className="text-center text-xs text-muted">Os visuais e cosméticos acompanham sua conta em todas as peladas. <Link href="/meu-perfil?aba=cosmeticos" className="font-bold text-accent">Ver meu perfil</Link></p>
  </main>;
}
