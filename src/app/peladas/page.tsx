import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { getMyLeagues } from "@/lib/league-context";
import {
  enterLeague,
  joinOpenLeague,
  requestClosedLeague,
} from "@/app/lobby/actions";
import { colorWithOpacity } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DiscoverableLeague = {
  league_id: string;
  league_name: string;
  league_slug: string;
  feature_tier: "basic" | "complete";
  visibility: "private" | "open";
  logo_url: string | null;
  cover_url: string | null;
  accent_color: string | null;
};

function leagueAccent(color: string | null) {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color! : "#ccff00";
}

function accentForeground(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150 ? "#06120b" : "#ffffff";
}

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

    {discoveryError ? <p role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">O catálogo completo estará disponível depois de aplicar a migration 330.</p>
      : catalog.length ? <div className="space-y-3">{catalog.map((league) => {
        const joined = joinedIds.has(league.league_id);
        const pending = pendingIds.has(league.league_id);
        const isOpen = league.visibility === "open";
        const accentColor = leagueAccent(league.accent_color);
        const buttonTextColor = accentForeground(accentColor);
        return <article key={league.league_id} className="overflow-hidden rounded-2xl border bg-surface" style={{ borderColor: colorWithOpacity(accentColor, isOpen ? 0.45 : 0.25) }}>
          <div className="relative h-32 overflow-hidden border-b border-white/10" style={{ backgroundColor: colorWithOpacity(accentColor, 0.08) }}>
            {league.cover_url && <Image src={league.cover_url} alt="" fill sizes="(max-width: 640px) 100vw, 640px" className="object-cover" />}
            <div className="absolute inset-0 bg-black/55" />
            <span className="absolute right-3 top-3 shrink-0 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] font-black uppercase" style={{ color: isOpen ? accentColor : "white" }}>
              {isOpen ? "Aberta" : "Fechada"}
            </span>
            <div className="absolute inset-x-4 bottom-3 flex items-end gap-3">
              <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 bg-background font-athletic text-lg font-black" style={{ borderColor: accentColor, color: accentColor }}>
                {league.logo_url ? <Image src={league.logo_url} alt="" fill sizes="64px" className="object-cover" /> : league.league_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 pb-1">
                <h2 className="truncate text-balance font-athletic text-xl font-black text-white">{league.league_name}</h2>
                <p className="mt-1 text-pretty text-xs text-white/70">{league.feature_tier === "basic" ? "Modo básico · ranking e organização" : "Modo completo · ranking, Cartola e extras"}</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            {joined ? <form action={enterLeague}>
              <input type="hidden" name="league_id" value={league.league_id} />
              <button className="w-full rounded-xl px-4 py-3 text-sm font-black" style={{ backgroundColor: accentColor, color: buttonTextColor }}>Abrir esta pelada</button>
            </form> : pending ? <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-center text-xs font-black text-warning">Pedido aguardando aprovação</div>
              : isOpen ? <form action={joinOpenLeague}>
                <input type="hidden" name="league_id" value={league.league_id} />
                <button className="w-full rounded-xl px-4 py-3 text-sm font-black" style={{ backgroundColor: accentColor, color: buttonTextColor }}>Entrar agora</button>
              </form> : <form action={requestClosedLeague}>
                <input type="hidden" name="league_id" value={league.league_id} />
                <button className="w-full rounded-xl border px-4 py-3 text-sm font-black" style={{ borderColor: colorWithOpacity(accentColor, 0.55), color: accentColor }}>Solicitar entrada</button>
              </form>}
          </div>
        </article>;
      })}</div> : <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">Nenhuma pelada encontrada com esse nome.</div>}

    <Link href="/lobby/criar" className="block rounded-2xl border border-accent/30 bg-accent/10 p-4 text-center">
      <span className="block text-sm font-black text-accent">Não encontrou? Crie sua própria pelada</span>
      <span className="mt-1 block text-xs text-muted">Você escolhe se ela será aberta ou fechada.</span>
    </Link>
  </div>;
}
