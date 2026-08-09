import { PlayersStatsGrid } from "@/components/PlayersStatsGrid";
import { getPlayersWithStats } from "@/lib/actions/players";

export const revalidate = 0;

export default async function JogadoresPage() {
  const players = await getPlayersWithStats();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Jogadores</h1>
        <p className="mt-0.5 text-xs text-muted">{players.length} jogadores cadastrados</p>
      </div>
      <PlayersStatsGrid players={players} />
    </div>
  );
}
