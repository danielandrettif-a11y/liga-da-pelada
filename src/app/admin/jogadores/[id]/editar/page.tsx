import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@/components/icons";
import { PlayerForm } from "@/components/PlayerForm";
import { getPlayer } from "@/lib/actions/players";
import { getRegisteredMergeCandidates } from "@/lib/actions/registrations";
import { GuestProfileMerge } from "@/components/GuestProfileMerge";

export const revalidate = 0;

export default async function EditarJogadorPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const player = await getPlayer(id);

  if (!player) {
    notFound();
  }
  const mergeCandidates = player.member_category === "guest" ? await getRegisteredMergeCandidates(player.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/jogadores"
          className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Editar Jogador</h1>
          <p className="text-xs text-muted mt-0.5">
            Atualizar dados de {player.name}
          </p>
        </div>
      </div>

      <PlayerForm player={player} />
      {player.member_category === "guest" && <GuestProfileMerge guest={player} candidates={mergeCandidates} />}
    </div>
  );
}
