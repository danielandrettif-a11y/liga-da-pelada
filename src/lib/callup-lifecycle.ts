export type CallupRoundMatchState = {
  status?: string | null;
  started_at?: string | null;
};

export type CallupRoundTeamState = {
  team_players?: Array<{ player_id?: string | null }> | null;
};

export function isFinishedCallupRound(round: { status?: string | null } | null | undefined) {
  return round?.status === "finished";
}

/** Times vazios podem existir durante a pré-lista; sorteio exige atleta alocado. */
export function hasDrawnCallupTeams(teams: CallupRoundTeamState[] | null | undefined) {
  return (teams || []).some((team) => (team.team_players || []).length > 0);
}

export function hasCallupClosingMatch(matches: CallupRoundMatchState[] | null | undefined) {
  return (matches || []).some((match) =>
    Boolean(match.started_at)
      || match.status === "in_progress"
      || match.status === "live"
      || match.status === "finished",
  );
}
