export type RoundTeamAssignment = {
  teamId: string;
  playerIds: string[];
};

export function swapRoundFormationPlayers(
  assignments: RoundTeamAssignment[],
  firstPlayerId: string,
  secondPlayerId: string,
): RoundTeamAssignment[] {
  if (!firstPlayerId || !secondPlayerId || firstPlayerId === secondPlayerId) return assignments;

  let firstLocation: { teamIndex: number; playerIndex: number } | null = null;
  let secondLocation: { teamIndex: number; playerIndex: number } | null = null;
  assignments.forEach((assignment, teamIndex) => {
    assignment.playerIds.forEach((playerId, playerIndex) => {
      if (playerId === firstPlayerId) firstLocation = { teamIndex, playerIndex };
      if (playerId === secondPlayerId) secondLocation = { teamIndex, playerIndex };
    });
  });

  if (!firstLocation || !secondLocation) return assignments;
  const first = firstLocation as { teamIndex: number; playerIndex: number };
  const second = secondLocation as { teamIndex: number; playerIndex: number };
  const next = assignments.map((assignment) => ({
    ...assignment,
    playerIds: [...assignment.playerIds],
  }));
  next[first.teamIndex].playerIds[first.playerIndex] = secondPlayerId;
  next[second.teamIndex].playerIds[second.playerIndex] = firstPlayerId;
  return next;
}

export function roundFormationChanged(
  original: RoundTeamAssignment[],
  draft: RoundTeamAssignment[],
) {
  const originalTeamByPlayer = new Map(
    original.flatMap((assignment) => assignment.playerIds.map((playerId) => [playerId, assignment.teamId] as const)),
  );
  return draft.some((assignment) => assignment.playerIds.some(
    (playerId) => originalTeamByPlayer.get(playerId) !== assignment.teamId,
  ));
}
