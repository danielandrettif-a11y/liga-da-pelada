export type RoundPlayerMatchStatus = "available" | "injured" | "absent";

type RoundPlayerAvailability = {
  player_id: string;
  availability_status?: string | null;
  attendance_status?: string | null;
};

export function resolveRoundPlayerMatchStatus(
  player: RoundPlayerAvailability,
  formationMode?: string | null,
): RoundPlayerMatchStatus {
  if (player.availability_status === "injured") return "injured";
  if (formationMode !== "manual" && player.attendance_status !== "present") return "absent";
  return "available";
}

export function buildRoundMatchAvailability(
  players: RoundPlayerAvailability[] | null | undefined,
  formationMode?: string | null,
) {
  return new Map((players || []).map((player) => [
    player.player_id,
    resolveRoundPlayerMatchStatus(player, formationMode),
  ] as const));
}

export function getRoundMatchStateVersion(players: RoundPlayerAvailability[] | null | undefined) {
  return [...(players || [])]
    .sort((left, right) => left.player_id.localeCompare(right.player_id))
    .map((player) => `${player.player_id}:${player.availability_status || "available"}:${player.attendance_status || "pending"}`)
    .join("|");
}
