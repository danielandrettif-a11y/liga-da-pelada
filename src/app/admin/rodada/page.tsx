import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { getPlayersWithStats } from "@/lib/actions/players";
import { RoundCreator } from "@/components/RoundCreator";
import { getActiveCallup } from "@/lib/actions/callups";
import { getLeagueConfig } from "@/lib/actions/league";

export const revalidate = 0;

export default async function NovaRodadaPage({ searchParams }: PageProps<"/admin/rodada">) {
  const params = await searchParams;
  const [players, activeCallup, leagueConfig] = await Promise.all([
    getPlayersWithStats("official", true),
    getActiveCallup(),
    getLeagueConfig(),
  ]);
  const callup = typeof params.callup === "string" && activeCallup?.id === params.callup ? activeCallup : null;
  const confirmedIds = callup?.entries.filter((entry) => entry.status === "confirmed").map((entry) => entry.player_id) || [];

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
          <h1 className="text-xl font-bold text-foreground">{callup?.round_type === "friendly" ? "Novo Amistoso" : "Nova Rodada"}</h1>
          <p className="text-xs text-muted mt-0.5">
            Monte os times para a próxima pelada
          </p>
        </div>
      </div>

      <RoundCreator
        allPlayers={players}
        initialDate={callup?.date}
        initialPlayerIds={confirmedIds}
        roundType={callup?.round_type || "official"}
        callupId={callup?.id || null}
        playersPerTeam={leagueConfig?.players_per_team || 5}
        teamsPerRound={leagueConfig?.teams_per_round || 3}
      />
    </div>
  );
}
