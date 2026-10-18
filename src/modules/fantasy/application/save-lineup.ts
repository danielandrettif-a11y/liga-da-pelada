import {
  lineupSlotsForDatabase,
  type FantasyLineupSubmission,
  validateFantasyLineupSubmission,
} from "../domain/lineup-submission";

export type FantasyRoundForLineup = {
  leagueId: string | null;
  playersPerTeam: number | null;
};

export type FantasyLineupGateway = {
  loadRound(roundId: string): Promise<FantasyRoundForLineup | null>;
  hasTestSession(roundId: string): Promise<boolean>;
  saveTest(input: FantasyLineupSubmission, slots: ReturnType<typeof lineupSlotsForDatabase>): Promise<string | null>;
  saveRegular(input: FantasyLineupSubmission, slots: ReturnType<typeof lineupSlotsForDatabase>): Promise<{
    lineupId: string | null;
    error: string | null;
  }>;
};

export async function saveFantasyLineupForLeague(
  input: FantasyLineupSubmission,
  league: { id: string; playersPerTeam: number | null },
  gateway: FantasyLineupGateway,
) {
  if (!input.roundId) {
    return { success: false as const, error: "A janela de transferências está fechada. Aguarde a abertura da próxima Ranked." };
  }
  const round = await gateway.loadRound(input.roundId);
  if (!round || round.leagueId !== league.id) {
    return { success: false as const, error: "Rodada do Cartola não encontrada nesta pelada." };
  }
  const maxPlayers = Number(round.playersPerTeam ?? league.playersPerTeam ?? 5);
  const validationError = validateFantasyLineupSubmission(input, maxPlayers);
  if (validationError) return { success: false as const, error: validationError };

  const slots = lineupSlotsForDatabase(input);
  if (await gateway.hasTestSession(input.roundId)) {
    if (input.reservePlayerId) {
      return { success: false as const, error: "O banco de reserva ainda não está disponível na rodada de testes." };
    }
    const error = await gateway.saveTest(input, slots);
    if (error) return { success: false as const, error };
  } else {
    const result = await gateway.saveRegular(input, slots);
    if (result.error) return { success: false as const, error: result.error };
    // A RPC grava titulares e reserva na mesma transação. A resposta sem erro
    // confirma ambos; uma leitura separada não faz parte do commit.
    if (!result.lineupId) {
      return {
        success: true as const,
        confirmed: false,
        warning: "Escalação enviada, mas o banco não confirmou o identificador. Reabra o Cartola e confira o time antes de jogar.",
      };
    }
  }
  return { success: true as const, confirmed: true, warning: undefined as string | undefined };
}
