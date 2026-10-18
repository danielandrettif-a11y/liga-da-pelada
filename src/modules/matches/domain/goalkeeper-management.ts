export function validateFixedGoalkeeperSelection(roundId: string, teamId: string, leagueId: string | null): string | null {
  return !leagueId || !roundId || !teamId ? "Time inválido." : null;
}

export function validateGoalkeeperChange(matchId: string, teamId: string, playerId: string): string | null {
  return !matchId || !teamId || !playerId ? "Escolha um jogador para entrar no gol." : null;
}

export function normalizeGoalkeeperElapsedHint(elapsedSeconds?: number): number | null {
  return Number.isFinite(elapsedSeconds) ? Math.max(0, Math.floor(elapsedSeconds!)) : null;
}
