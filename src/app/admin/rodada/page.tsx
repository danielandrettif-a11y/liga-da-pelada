import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPlayers } from "@/lib/actions/players";
import { RoundCreator } from "@/components/RoundCreator";

export const revalidate = 0;

export default async function NovaRodadaPage() {
  const players = await getPlayers();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/mais"
          className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Nova Rodada</h1>
          <p className="text-xs text-muted mt-0.5">
            Monte os times para a próxima pelada
          </p>
        </div>
      </div>

      <RoundCreator allPlayers={players} />
    </div>
  );
}
