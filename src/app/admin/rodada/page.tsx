import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { getPlayersWithStats } from "@/lib/actions/players";
import { RoundCreator } from "@/components/RoundCreator";
import { getActiveCallup } from "@/lib/actions/callups";
import { getLeagueConfig } from "@/lib/actions/league";
import { getAdminRoundPrelist, getNextTeamPresetOffset } from "@/lib/actions/rounds";

export const revalidate = 0;

export default async function NovaRodadaPage({ searchParams }: PageProps<"/admin/rodada">) {
  const params = await searchParams;
  const requestedType = params.type === "friendly" ? "friendly" : "official";
  const requestedRoundId = typeof params.round === "string" ? params.round : null;
  const [players, activeCallup, leagueConfig, officialPresetOffset, friendlyPresetOffset, prelist] = await Promise.all([
    getPlayersWithStats("official", true),
    getActiveCallup(),
    getLeagueConfig(),
    getNextTeamPresetOffset("official"),
    getNextTeamPresetOffset("friendly"),
    requestedRoundId ? getAdminRoundPrelist(requestedRoundId) : Promise.resolve(null),
  ]);
  const requestedCallup = typeof params.callup === "string" && activeCallup?.id === params.callup ? activeCallup : null;
  const linkedCallup = prelist?.callupId && activeCallup?.id === prelist.callupId ? activeCallup : null;
  const callup = linkedCallup || requestedCallup;
  const prelistIds = prelist?.round_players?.map((entry: any) => entry.player_id) || [];
  const confirmedIds = prelistIds.length
    ? prelistIds
    : callup?.entries.filter((entry) => entry.status === "confirmed").map((entry) => entry.player_id) || [];
  const availableCallup = activeCallup?.status === "open" && (!activeCallup.round_id || activeCallup.round_id === prelist?.id) ? {
    id: activeCallup.id,
    date: activeCallup.date,
    roundType: activeCallup.round_type,
    playerIds: activeCallup.entries.filter((entry) => entry.status === "confirmed").map((entry) => entry.player_id),
  } : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/prelistas"
          className="w-10 h-10 rounded-full bg-surface hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">{prelist ? "Montar times" : (callup?.round_type || requestedType) === "friendly" ? "Nova pré-lista de amistoso" : "Nova pré-lista"}</h1>
          <p className="text-xs text-muted mt-0.5">
            Monte os times para a próxima pelada
          </p>
        </div>
      </div>

      <RoundCreator
        allPlayers={players}
        initialDate={prelist?.date || callup?.date}
        initialTime={prelist?.start_time || "08:00"}
        initialPlayerIds={confirmedIds}
        roundType={prelist?.round_type || callup?.round_type || requestedType}
        callupId={callup?.id || null}
        prelistRoundId={prelist?.id || null}
        availableCallup={availableCallup}
        mountTeams={params.mount === "1"}
        prelistNumber={prelist?.number || null}
        playersPerTeam={leagueConfig?.players_per_team || 5}
        teamsPerRound={leagueConfig?.teams_per_round || 3}
        teamPresetOffsets={{ official: officialPresetOffset, friendly: friendlyPresetOffset }}
      />
    </div>
  );
}
