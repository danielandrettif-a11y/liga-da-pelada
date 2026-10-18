import {
  validateFixedGoalkeeperSelection,
  validateGoalkeeperChange,
} from "../domain/goalkeeper-management";

export type GoalkeeperGateway = {
  findRoundTeam(roundId: string, teamId: string, leagueId: string): Promise<{
    team: { roundId: string } | null;
    error: string | null;
  }>;
  isTeamPlayer(teamId: string, playerId: string): Promise<boolean>;
  setFixedGoalkeeper(teamId: string, playerId: string | null): Promise<void>;
  loadMatch(matchId: string): Promise<{
    roundId: string;
    status: string;
    teamAId: string;
    teamBId: string;
  }>;
  changeMatchGoalkeeper(
    matchId: string,
    teamId: string,
    playerId: string,
    elapsedSeconds?: number,
  ): Promise<Record<string, unknown> | null>;
};

export async function chooseFixedGoalkeeper(
  input: { roundId: string; teamId: string; playerId: string | null; leagueId: string | null },
  gateway: GoalkeeperGateway,
) {
  const validationError = validateFixedGoalkeeperSelection(input.roundId, input.teamId, input.leagueId);
  if (validationError) return { success: false as const, error: validationError };

  const { team, error } = await gateway.findRoundTeam(input.roundId, input.teamId, input.leagueId!);
  if (error || !team) return { success: false as const, error: "Time fora da pelada selecionada." };
  if (input.playerId && !(await gateway.isTeamPlayer(input.teamId, input.playerId))) {
    return { success: false as const, error: "Escolha um jogador deste time para ser o goleiro fixo." };
  }

  await gateway.setFixedGoalkeeper(input.teamId, input.playerId);
  return { success: true as const, roundId: team.roundId };
}

export async function switchMatchGoalkeeper(
  input: { matchId: string; teamId: string; playerId: string; elapsedSeconds?: number },
  gateway: GoalkeeperGateway,
) {
  const validationError = validateGoalkeeperChange(input.matchId, input.teamId, input.playerId);
  if (validationError) return { success: false as const, error: validationError };

  const match = await gateway.loadMatch(input.matchId);
  if (match.status !== "live") return { success: false as const, error: "A partida não está em andamento." };
  if (input.teamId !== match.teamAId && input.teamId !== match.teamBId) {
    return { success: false as const, error: "Time fora desta partida." };
  }

  const data = await gateway.changeMatchGoalkeeper(
    input.matchId, input.teamId, input.playerId, input.elapsedSeconds,
  );
  return { success: true as const, roundId: match.roundId, data };
}
