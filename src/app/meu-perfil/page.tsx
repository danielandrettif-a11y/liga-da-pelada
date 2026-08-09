import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserRound } from "@/components/icons";
import { PlayerForm } from "@/components/PlayerForm";
import { getCurrentAccount } from "@/lib/auth";
import { getPlayer } from "@/lib/actions/players";

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
      <PlayerForm player={player} mode="self" />
    </div>
  );
}
