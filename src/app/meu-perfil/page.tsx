import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserRound } from "@/components/icons";
import { PlayerForm } from "@/components/PlayerForm";
import { getCurrentAccount } from "@/lib/auth";
import { getPlayer, getPlayerPlaytime } from "@/lib/actions/players";
import { formatDuration } from "@/lib/utils";
import { FitnessPanel } from "@/components/FitnessPanel";
import { getMyFitnessRounds, getPlayerFitnessSummaries } from "@/lib/actions/fitness";
import { getMyFantasySummary } from "@/lib/actions/fantasy";
import { getMyCosmeticsDashboard, getMyEquippedCosmetics } from "@/lib/actions/cosmetics";
import { CosmeticsCollection } from "@/components/fantasy/CosmeticsExperience";

export const revalidate = 0;

export default async function MeuPerfilPage() {
  const account = await getCurrentAccount();
  if (!account.user) redirect("/login");

  if (!account.profile?.player_id) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/mais" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover">
            <ArrowLeft className="h-5 w-5 text-muted" />
          </Link>
          <h1 className="text-xl font-black text-foreground">Meu Perfil</h1>
        </div>
        <div className="glass-card p-8 text-center">
          <UserRound className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-3 text-sm font-bold text-foreground">Conta sem jogador vinculado</p>
          <p className="mt-1 text-xs text-muted">Um administrador pode vincular esta conta a um jogador pelo Supabase.</p>
        </div>
      </div>
    );
  }

  const player = await getPlayer(account.profile.player_id);
  if (!player) redirect("/");
  const [fitnessRounds, fitnessSummaries, fantasySummary, cosmetics, myEquipped, playtime] = await Promise.all([
    getMyFitnessRounds(player.id),
    getPlayerFitnessSummaries(player.id),
    getMyFantasySummary(),
    getMyCosmeticsDashboard(),
    getMyEquippedCosmetics(),
    getPlayerPlaytime(player.id),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/mais" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover">
          <ArrowLeft className="h-5 w-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-foreground">Meu Perfil</h1>
          <p className="text-xs text-muted">Atualize sua foto, nome e estilo de jogo</p>
        </div>
      </div>
      <PlayerForm
        player={player}
        mode="self"
        frameKey={myEquipped?.frameKey}
        auraKey={myEquipped?.auraKey}
        titleName={myEquipped?.titleName}
        nameplateKey={myEquipped?.nameplateKey}
        bannerAssetKey={myEquipped?.bannerAssetKey}
        backgroundAssetKey={myEquipped?.backgroundAssetKey}
      />
      <CosmeticsCollection cosmetics={cosmetics} playerId={player.id} playerName={player.name} avatarUrl={player.avatar_url} />
      <section className="glass-card p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted">Tempo em quadra</p>
        <p className="mt-1 text-2xl font-black text-accent">{formatDuration(playtime.totalSeconds)}</p>
        <p className="mt-1 text-[10px] text-muted">Tempo total jogado em partidas registradas.</p>
      </section>
      {fantasySummary && <Link href="/cartola/ranking" className="glass-card flex items-center justify-between p-4"><div><p className="text-[10px] font-black uppercase text-muted">Meu Cartola</p><p className="mt-1 text-sm font-black text-foreground">#{fantasySummary.position} na temporada</p><p className="text-[10px] text-muted">Patrimônio C$ {Number(fantasySummary.current_budget).toFixed(2)}</p></div><strong className="text-2xl text-accent">{Number(fantasySummary.total_points).toFixed(1)}</strong></Link>}
      <FitnessPanel rounds={fitnessRounds} visible={player.show_fitness_stats} summaries={fitnessSummaries} />
    </div>
  );
}
