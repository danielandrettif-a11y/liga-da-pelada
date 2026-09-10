export const MIN_UNDERFILLED_PLAYERS = 12;

export type RoundTeamSizeMode = 5 | 6;

export function rebalanceTeamRosters<T>(rosters: T[][]): T[][] {
  if (rosters.length === 0) return [];
  const players = rosters.flat();
  const baseSize = Math.floor(players.length / rosters.length);
  const largerTeams = players.length % rosters.length;
  let cursor = 0;
  return rosters.map((_, index) => {
    const size = baseSize + (index < largerTeams ? 1 : 0);
    const roster = players.slice(cursor, cursor + size);
    cursor += size;
    return roster;
  });
}

export function validateUnderfilledTeamSizes(
  teamSizes: number[],
  selectedPlayers: number,
  targetPlayersPerTeam: RoundTeamSizeMode,
) {
  if (teamSizes.length !== 3) return "A rodada incompleta precisa ter exatamente 3 times.";
  if (selectedPlayers < MIN_UNDERFILLED_PLAYERS) return `Selecione pelo menos ${MIN_UNDERFILLED_PLAYERS} jogadores.`;
  if (selectedPlayers > targetPlayersPerTeam * teamSizes.length) {
    return targetPlayersPerTeam === 5
      ? "O modo 5x5 aceita no máximo 15 jogadores. Remova os excedentes manualmente."
      : "O modo 6x6 aceita no máximo 18 jogadores.";
  }
  if (teamSizes.some((size) => size > targetPlayersPerTeam)) {
    return `Cada time pode ter no máximo ${targetPlayersPerTeam} jogadores neste modo.`;
  }
  if (teamSizes.reduce((total, size) => total + size, 0) !== selectedPlayers) {
    return "Todos os jogadores selecionados precisam estar em um time.";
  }
  if (Math.max(...teamSizes) - Math.min(...teamSizes) > 1) {
    return "Distribua os jogadores igualmente: a diferença entre os times pode ser de no máximo 1 jogador.";
  }
  return null;
}

export type LoanQueueCandidate = {
  playerId: string;
  loanOrder: number;
};

export function orderLoanQueue<T extends LoanQueueCandidate>(
  candidates: T[],
  previousLoanCount: ReadonlyMap<string, number>,
  alreadyPicked: ReadonlySet<string> = new Set(),
) {
  return candidates
    .filter((candidate) => !alreadyPicked.has(candidate.playerId))
    .sort((a, b) =>
      (previousLoanCount.get(a.playerId) || 0) - (previousLoanCount.get(b.playerId) || 0)
      || a.loanOrder - b.loanOrder
      || a.playerId.localeCompare(b.playerId),
    );
}

export type StructuralLoanTeam = {
  id: string;
  position: number;
  players: Array<LoanQueueCandidate & { eligible: boolean }>;
};

export type StructuralLoan = {
  targetTeamId: string;
  originalTeamId: string;
  playerId: string;
  rotationOrder: number;
};

export function buildStructuralLoans({
  teams,
  selectedTeamIds,
  targetPlayersPerTeam,
  previousLoanCount,
  reservedPlayerIds = new Set(),
  preferredPlayerBySlot = new Map(),
}: {
  teams: StructuralLoanTeam[];
  selectedTeamIds: string[];
  targetPlayersPerTeam: number;
  previousLoanCount: ReadonlyMap<string, number>;
  reservedPlayerIds?: ReadonlySet<string>;
  preferredPlayerBySlot?: ReadonlyMap<string, string>;
}): StructuralLoan[] {
  const selected = teams
    .filter((team) => selectedTeamIds.includes(team.id))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const lenders = teams.filter((team) => !selectedTeamIds.includes(team.id));
  if (selected.length !== 2 || lenders.length !== 1) return [];

  const lender = lenders[0];
  const used = new Set(reservedPlayerIds);
  const result: StructuralLoan[] = [];

  for (const team of selected) {
    const missing = Math.max(0, targetPlayersPerTeam - team.players.length);
    for (let offset = 0; offset < missing; offset += 1) {
      const rotationOrder = team.players.length + offset + 1;
      const slotKey = `${team.id}:${rotationOrder}`;
      const availableCandidates = lender.players.filter((player) => player.eligible && !used.has(player.playerId));
      const preferredPlayerId = preferredPlayerBySlot.get(slotKey);
      const candidate = availableCandidates.find((player) => player.playerId === preferredPlayerId) || orderLoanQueue(
        availableCandidates,
        previousLoanCount,
        used,
      )[0];
      if (!candidate) continue;
      used.add(candidate.playerId);
      result.push({
        targetTeamId: team.id,
        originalTeamId: lender.id,
        playerId: candidate.playerId,
        rotationOrder,
      });
    }
  }
  return result;
}
