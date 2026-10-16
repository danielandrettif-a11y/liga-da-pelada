import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Trophy, UserRound } from "@/components/icons";
import { PlayerForm } from "@/components/PlayerForm";
import { FitnessPanel } from "@/components/FitnessPanel";
import { CosmeticsCollection } from "@/components/fantasy/CosmeticsExperience";
import { getCurrentAccount } from "@/lib/auth";
import { getPlayer, getPlayerPlaytime } from "@/lib/actions/players";
import { getMyFitnessRounds, getPlayerFitnessSummaries } from "@/lib/actions/fitness";
import { getMyCosmeticsDashboard, getMyEquippedCosmetics } from "@/lib/actions/cosmetics";
import { getMyAccountCareer, type CareerTotals } from "@/lib/actions/account-career";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/cn";

export const revalidate = 0;

function StatCard({ label, data }: { label: string; data: CareerTotals }) {
  return <article className="rounded-2xl border border-border bg-surface p-4"><p className="text-[10px] font-black uppercase tracking-widest text-muted">{label}</p><div className="mt-3 grid grid-cols-3 gap-3 text-center"><div><strong className="block text-2xl tabular-nums text-accent">{data.goals}</strong><span className="text-[10px] text-muted">Gols</span></div><div><strong className="block text-2xl tabular-nums text-white">{data.assists}</strong><span className="text-[10px] text-muted">Assist.</span></div><div><strong className="block text-2xl tabular-nums text-white">{data.games}</strong><span className="text-[10px] text-muted">Jogos</span></div></div><div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-muted"><span className="rounded-full bg-background px-2 py-1">{data.wins} vitórias</span><span className="rounded-full bg-background px-2 py-1">{data.draws} empates</span><span className="rounded-full bg-background px-2 py-1">{data.losses} derrotas</span><span className="rounded-full bg-background px-2 py-1">{formatDuration(data.play_seconds)}</span></div></article>;
}

export default async function MeuPerfilPage({ searchParams }: PageProps<"/meu-perfil">) {
  const query = await searchParams;
  const requested = typeof query.aba === "string" ? query.aba : "perfil";
  const activeTab = query.mode === "preview" ? "cosmeticos" : (["perfil", "estatisticas", "cosmeticos"].includes(requested) ? requested : "perfil");
  const account = await getCurrentAccount();
  if (!account.user) redirect("/login");
  if (!account.profile?.player_id) return <div className="space-y-5"><div className="flex items-center gap-3"><Link href="/mais" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface"><ArrowLeft className="h-5 w-5 text-muted" /></Link><h1 className="text-xl font-black text-foreground">Meu Perfil</h1></div><div className="glass-card p-8 text-center"><UserRound className="mx-auto h-10 w-10 text-muted" /><p className="mt-3 text-sm font-bold text-foreground">Conta sem jogador vinculado</p><p className="mt-1 text-xs text-muted">Um administrador pode vincular esta conta a um jogador.</p></div></div>;

  const player = await getPlayer(account.profile.player_id);
  if (!player) redirect("/");
  const myEquipped = await getMyEquippedCosmetics();
  const initialPreviewLoadout = query.mode === "preview" ? Object.fromEntries(["banner", "frame", "title", "aura", "nameplate", "background", "showcase", "pitch"].map((slot) => [slot, typeof query[slot] === "string" ? query[slot] : null])) : undefined;

  return <div className="space-y-5">
    <header className="flex items-center gap-3"><Link href="/mais" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface"><ArrowLeft className="h-5 w-5 text-muted" /></Link><div><h1 className="text-xl font-black text-foreground">Meu Perfil</h1><p className="text-xs text-muted">Sua identidade em todas as peladas</p></div></header>
    <nav aria-label="Áreas do perfil" className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1">{[["perfil", "Perfil"], ["estatisticas", "Carreira"], ["cosmeticos", "Coleção"]].map(([key, label]) => <Link key={key} href={`/meu-perfil?aba=${key}`} aria-current={activeTab === key ? "page" : undefined} className={cn("rounded-xl px-2 py-3 text-center text-xs font-black", activeTab === key ? "bg-accent text-background" : "text-muted")}>{label}</Link>)}</nav>

    {activeTab === "perfil" && <ProfileTab player={player} equipped={myEquipped} />}
    {activeTab === "estatisticas" && <CareerTab />}
    {activeTab === "cosmeticos" && <CosmeticsTab player={player} preview={query.mode === "preview"} previewLoadout={initialPreviewLoadout} />}
  </div>;
}

async function ProfileTab({ player, equipped }: { player: any; equipped: Awaited<ReturnType<typeof getMyEquippedCosmetics>> }) {
  const [fitnessRounds, fitnessSummaries, playtime] = await Promise.all([getMyFitnessRounds(player.id), getPlayerFitnessSummaries(player.id), getPlayerPlaytime(player.id)]);
  return <><PlayerForm player={player} mode="self" frameKey={equipped?.frameKey} auraKey={equipped?.auraKey} titleName={equipped?.titleName} nameplateKey={equipped?.nameplateKey} bannerAssetKey={equipped?.bannerAssetKey} backgroundAssetKey={equipped?.backgroundAssetKey} /><section className="glass-card p-4"><p className="text-[10px] font-black uppercase tracking-wider text-muted">Tempo nesta pelada</p><p className="mt-1 text-2xl font-black text-accent">{formatDuration(playtime.totalSeconds)}</p></section><FitnessPanel rounds={fitnessRounds} visible={player.show_fitness_stats} summaries={fitnessSummaries} /></>;
}

async function CareerTab() {
  const career = await getMyAccountCareer();
  const byLeague = new Map<string, typeof career.rows>();
  for (const row of career.rows) byLeague.set(row.league_id, [...(byLeague.get(row.league_id) || []), row]);
  return <><section className="overflow-hidden rounded-3xl border border-accent/30 bg-surface p-5"><Trophy className="h-7 w-7 text-accent" /><p className="mt-4 text-[10px] font-black uppercase tracking-[.2em] text-accent">Carreira completa</p><h2 className="mt-1 font-athletic text-3xl font-black uppercase text-white">Todos os campos. Uma história.</h2><div className="mt-5 grid grid-cols-3 gap-3"><div><strong className="block text-3xl tabular-nums text-accent">{career.overall.goals}</strong><span className="text-xs text-muted">gols</span></div><div><strong className="block text-3xl tabular-nums text-white">{career.overall.assists}</strong><span className="text-xs text-muted">assistências</span></div><div><strong className="block text-3xl tabular-nums text-white">{career.overall.games}</strong><span className="text-xs text-muted">jogos</span></div></div></section><div className="grid gap-3 sm:grid-cols-2"><StatCard label="Oficiais e Ranked" data={career.official} /><StatCard label="Amistosos" data={career.friendly} /></div><section><h2 className="mb-3 font-athletic text-xl font-black uppercase text-white">Por pelada</h2><div className="space-y-3">{[...byLeague.values()].map((rows) => <article key={rows[0].league_id} className="rounded-2xl border border-border bg-surface p-4"><h3 className="font-black text-white">{rows[0].league_name}</h3><div className="mt-3 grid grid-cols-2 gap-2">{rows.map((row) => <StatCard key={row.round_type} label={row.round_type === "official" ? "Oficial" : "Amistoso"} data={row} />)}</div></article>)}{!career.rows.length && <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">Suas estatísticas aparecerão aqui depois da primeira rodada vinculada à sua conta.</p>}</div></section></>;
}

async function CosmeticsTab({ player, preview, previewLoadout }: { player: any; preview: boolean; previewLoadout: any }) {
  const cosmetics = await getMyCosmeticsDashboard();
  return <section id="colecao" className="scroll-mt-24"><div className="mb-3"><p className="text-xs font-black uppercase tracking-widest text-accent">Coleção da conta</p><p className="mt-1 text-sm text-muted">O visual equipado aparece em todas as suas peladas.</p></div><CosmeticsCollection cosmetics={cosmetics} playerId={player.id} playerName={player.name} avatarUrl={player.avatar_url} initialPreviewMode={preview} initialPreviewLoadout={previewLoadout} /></section>;
}
