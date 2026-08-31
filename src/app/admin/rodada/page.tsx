import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { getPlayersWithStats } from "@/lib/actions/players";
import { RoundCreator } from "@/components/RoundCreator";
import { getActiveCallups } from "@/lib/actions/callups";
import { getLeagueConfig } from "@/lib/actions/league";
import { getAdminRoundPrelist, getNextTeamPresetOffset } from "@/lib/actions/rounds";
import { getStadiums } from "@/lib/actions/stadiums";

export const revalidate = 0;

export default async function NovaRodadaPage({ searchParams }: PageProps<"/admin/rodada">) {
  const params = await searchParams;
  const requestedType = params.type === "friendly" ? "friendly" : "official";
  const requestedRoundId = typeof params.round === "string" ? params.round : null;
  const [players, activeCallups, leagueConfig, officialPresetOffset, friendlyPresetOffset, prelist, stadiums] = await Promise.all([
    getPlayersWithStats("official", true),
    getActiveCallups(),
    getLeagueConfig(),
    getNextTeamPresetOffset("official"),
    getNextTeamPresetOffset("friendly"),
    requestedRoundId ? getAdminRoundPrelist(requestedRoundId) : Promise.resolve(null),
    getStadiums(),
  ]);
  const requestedCallup = typeof params.callup === "string"
    ? activeCallups.find((item) => item.id === params.callup) || null
    : null;
  const linkedCallup = prelist?.callupId
    ? activeCallups.find((item) => item.id === prelist.callupId) || null
    : null;
  const callup = linkedCallup || requestedCallup;
  const prelistIds = prelist?.round_players?.map((entry: any) => entry.player_id) || [];
  const confirmedIds = callup
    ? callup.entries.filter((entry) => entry.status === "confirmed").map((entry) => entry.player_id)
    : prelistIds;
  const availableCallups = activeCallups
    .filter((item) => item.status === "open" && (!item.round_id || item.round_id === prelist?.id))
    .map((item) => ({
      id: item.id,
      date: item.date,
      startTime: item.start_time?.slice(0, 5) || "08:00",
      roundType: item.round_type,
      playerIds: item.entries.filter((entry) => entry.status === "confirmed").map((entry) => entry.player_id),
      entryIds: item.entries.map((entry) => entry.player_id),
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={prelist ? "/admin/prelistas" : "/rodadas"}
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
        stadiums={stadiums}
        initialDate={prelist?.date || callup?.date}
        initialTime={prelist?.start_time || callup?.start_time || "08:00"}
        initialStadiumId={prelist?.stadium_id || callup?.stadium_id || stadiums[0]?.id || null}
        initialPlayerIds={confirmedIds}
        roundType={prelist?.round_type || callup?.round_type || requestedType}
        callupId={callup?.id || null}
        prelistRoundId={prelist?.id || null}
        availableCallups={availableCallups}
        mountTeams={params.mount === "1"}
        prelistNumber={prelist?.number || null}
        playersPerTeam={leagueConfig?.players_per_team || 5}
        teamsPerRound={leagueConfig?.teams_per_round || 3}
        teamPresetOffsets={{ official: officialPresetOffset, friendly: friendlyPresetOffset }}
      />
    </div>
  );
}
