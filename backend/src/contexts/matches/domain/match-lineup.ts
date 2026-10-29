export type MatchLineupInput = {
  round_id: string;
  team_a_id: string;
  team_b_id: string;
  goalkeeper_a_id: string;
  goalkeeper_b_id: string;
  idempotency_key?: string;
  client_started_at?: string;
  replacements?: Array<{
    team_id: string;
    absent_player_id: string;
    replacement_player_id: string;
  }>;
  structural_loan_overrides?: Array<{
    target_team_id: string;
    rotation_order: number;
    player_id: string;
  }>;
  structural_loan_excluded_player_ids?: string[];
};

export type MatchLineupSnapshot = {
  roundNumber: number;
  roundStatus: string;
  formationMode: string;
  arrivalOrderEnabled: boolean;
  targetPlayersPerTeam: number;
  previousMatchCount: number;
  teams: Array<{
    id: string;
    name: string;
    position: number;
    fixedGoalkeeperPlayerId: string | null;
    players: Array<{ playerId: string; goalkeeperOrder: number; loanOrder: number }>;
  }>;
  roundPlayers: Array<{
    playerId: string;
    availabilityStatus: string;
    attendanceStatus: string | null;
  }>;
  previousLoanCount: ReadonlyMap<string, number>;
};

export type MatchLineupCommand = {
  player_id: string;
  team_id: string;
  original_team_id: string;
  participation_kind: "roster" | "replacement" | "structural";
  absent_player_id: string | null;
};

export class MatchLineupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchLineupError";
  }
}

type StructuralLoan = {
  targetTeamId: string;
  originalTeamId: string;
  playerId: string;
  rotationOrder: number;
};

function buildStructuralLoans(
  snapshot: MatchLineupSnapshot,
  selectedTeamIds: string[],
  reservedPlayerIds: ReadonlySet<string>,
  preferredPlayerBySlot: ReadonlyMap<string, string>,
): StructuralLoan[] {
  const selected = snapshot.teams
    .filter((team) => selectedTeamIds.includes(team.id))
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const lenders = snapshot.teams.filter((team) => !selectedTeamIds.includes(team.id));
  if (selected.length !== 2 || lenders.length < 1) return [];

  const roundPlayerById = new Map(snapshot.roundPlayers.map((entry) => [entry.playerId, entry]));
  const tracksAttendance = snapshot.formationMode !== "manual";
  const candidates = lenders.flatMap((team) => team.players.map((player) => {
    const roundPlayer = roundPlayerById.get(player.playerId);
    return {
      ...player,
      originalTeamId: team.id,
      eligible: roundPlayer?.availabilityStatus === "available"
        && (!tracksAttendance || roundPlayer.attendanceStatus === "present"),
    };
  }));
  const used = new Set(reservedPlayerIds);
  const result: StructuralLoan[] = [];

  for (const team of selected) {
    const missing = Math.max(0, snapshot.targetPlayersPerTeam - team.players.length);
    for (let offset = 0; offset < missing; offset += 1) {
      const rotationOrder = missing === 1 ? 1 : team.players.length + offset + 1;
      const preferred = preferredPlayerBySlot.get(`${team.id}:${rotationOrder}`);
      const available = candidates
        .filter((candidate) => candidate.eligible && !used.has(candidate.playerId))
        .sort((left, right) =>
          (snapshot.previousLoanCount.get(left.playerId) || 0) - (snapshot.previousLoanCount.get(right.playerId) || 0)
          || left.loanOrder - right.loanOrder
          || left.playerId.localeCompare(right.playerId));
      const candidate = available.find((entry) => entry.playerId === preferred) || available[0];
      if (!candidate) continue;
      used.add(candidate.playerId);
      result.push({
        targetTeamId: team.id,
        originalTeamId: candidate.originalTeamId,
        playerId: candidate.playerId,
        rotationOrder,
      });
    }
  }
  return result;
}

export function prepareMatchLineup(input: MatchLineupInput, snapshot: MatchLineupSnapshot) {
  if (snapshot.roundStatus === "finished") throw new MatchLineupError("A rodada já foi encerrada.");
  const selectedTeamIds = [input.team_a_id, input.team_b_id];
  const selectedTeams = snapshot.teams.filter((team) => selectedTeamIds.includes(team.id));
  if (selectedTeams.length !== 2) throw new MatchLineupError("Os times precisam pertencer a esta rodada.");
  if (snapshot.arrivalOrderEnabled && snapshot.previousMatchCount === 0) {
    const firstTeamIds = snapshot.teams.filter((team) => team.position <= 2).map((team) => team.id);
    if (firstTeamIds.length !== 2 || firstTeamIds.some((id) => !selectedTeamIds.includes(id))) {
      throw new MatchLineupError("A primeira partida precisa ser disputada pelos dois times titulares.");
    }
  }

  const roundPlayerById = new Map(snapshot.roundPlayers.map((entry) => [entry.playerId, entry]));
  const originalTeamByPlayer = new Map<string, string>();
  for (const team of snapshot.teams) for (const player of team.players) originalTeamByPlayer.set(player.playerId, team.id);
  const tracksAttendance = snapshot.formationMode !== "manual";
  const unavailableByTeam = new Map<string, Set<string>>();
  for (const team of selectedTeams) {
    unavailableByTeam.set(team.id, new Set(team.players
      .map((player) => player.playerId)
      .filter((playerId) => {
        const roundPlayer = roundPlayerById.get(playerId);
        return roundPlayer?.availabilityStatus === "injured"
          || (tracksAttendance && roundPlayer?.attendanceStatus !== "present");
      })));
  }

  const replacements = input.replacements || [];
  const usedAbsentPlayers = new Set<string>();
  const usedReplacementPlayers = new Set<string>();
  const forcedGoalkeeperByTeam = new Map<string, string>();
  for (const replacement of replacements) {
    if (!selectedTeamIds.includes(replacement.team_id)) {
      throw new MatchLineupError("O time do empréstimo não participa desta partida.");
    }
    if (!unavailableByTeam.get(replacement.team_id)?.has(replacement.absent_player_id)) {
      throw new MatchLineupError("O empréstimo precisa ocupar uma vaga desfalcada.");
    }
    if (usedAbsentPlayers.has(replacement.absent_player_id) || usedReplacementPlayers.has(replacement.replacement_player_id)) {
      throw new MatchLineupError("Um jogador não pode ocupar duas vagas na mesma partida.");
    }
    const originalTeamId = originalTeamByPlayer.get(replacement.replacement_player_id);
    if (!originalTeamId || selectedTeamIds.includes(originalTeamId)) {
      throw new MatchLineupError("O substituto precisa vir de um time que não participa desta partida.");
    }
    const roundPlayer = roundPlayerById.get(replacement.replacement_player_id);
    if (roundPlayer?.availabilityStatus !== "available"
      || (tracksAttendance && roundPlayer.attendanceStatus !== "present")) {
      throw new MatchLineupError("O substituto escolhido não está disponível.");
    }
    usedAbsentPlayers.add(replacement.absent_player_id);
    usedReplacementPlayers.add(replacement.replacement_player_id);
    if (!forcedGoalkeeperByTeam.has(replacement.team_id)) {
      forcedGoalkeeperByTeam.set(replacement.team_id, replacement.replacement_player_id);
    }
  }
  const missingReplacementCount = [...unavailableByTeam.values()]
    .reduce((total, unavailable) => total + unavailable.size, 0) - usedAbsentPlayers.size;
  if (missingReplacementCount > 0) {
    throw new MatchLineupError(`Escolha substitutos para as ${missingReplacementCount} vaga(s) desfalcadas.`);
  }
  if (selectedTeams.some((team) => team.players.length > snapshot.targetPlayersPerTeam)) {
    throw new MatchLineupError(`Um dos times possui mais de ${snapshot.targetPlayersPerTeam} jogadores.`);
  }

  const preferredPlayerBySlot = new Map<string, string>();
  for (const override of input.structural_loan_overrides || []) {
    if (!selectedTeamIds.includes(override.target_team_id) || !Number.isInteger(override.rotation_order) || override.rotation_order < 1) {
      throw new MatchLineupError("A troca de empréstimo enviada é inválida.");
    }
    const key = `${override.target_team_id}:${override.rotation_order}`;
    if (preferredPlayerBySlot.has(key)) throw new MatchLineupError("Uma vaga de empréstimo foi enviada duas vezes.");
    preferredPlayerBySlot.set(key, override.player_id);
  }
  const validLenderPlayerIds = new Set(snapshot.teams
    .filter((team) => !selectedTeamIds.includes(team.id))
    .flatMap((team) => team.players.map((player) => player.playerId)));
  const excluded = input.structural_loan_excluded_player_ids || [];
  if (excluded.some((playerId) => !validLenderPlayerIds.has(playerId))) {
    throw new MatchLineupError("A lista de jogadores que recusaram o empréstimo é inválida.");
  }
  const structuralLoans = buildStructuralLoans(
    snapshot,
    selectedTeamIds,
    new Set([...usedReplacementPlayers, ...excluded]),
    preferredPlayerBySlot,
  );
  const structuralShortage = selectedTeams.reduce(
    (total, team) => total + Math.max(0, snapshot.targetPlayersPerTeam - team.players.length), 0);
  if (structuralLoans.length !== structuralShortage) {
    throw new MatchLineupError(`O time de fora não possui jogadores disponíveis suficientes para completar ${snapshot.targetPlayersPerTeam}x${snapshot.targetPlayersPerTeam}.`);
  }
  if ((input.structural_loan_overrides || []).some((override) => !structuralLoans.some((loan) =>
    loan.targetTeamId === override.target_team_id
      && loan.rotationOrder === override.rotation_order
      && loan.playerId === override.player_id))) {
    throw new MatchLineupError("O jogador escolhido não está disponível para este empréstimo.");
  }

  const lineup: MatchLineupCommand[] = [];
  const effectiveTeamByPlayer = new Map<string, string>();
  for (const team of selectedTeams) {
    for (const player of team.players) {
      const roundPlayer = roundPlayerById.get(player.playerId);
      if (roundPlayer?.availabilityStatus === "injured"
        || (tracksAttendance && roundPlayer?.attendanceStatus !== "present")) continue;
      lineup.push({ player_id: player.playerId, team_id: team.id, original_team_id: team.id,
        participation_kind: "roster", absent_player_id: null });
      effectiveTeamByPlayer.set(player.playerId, team.id);
    }
  }
  for (const replacement of replacements) {
    lineup.push({ player_id: replacement.replacement_player_id, team_id: replacement.team_id,
      original_team_id: originalTeamByPlayer.get(replacement.replacement_player_id)!,
      participation_kind: "replacement", absent_player_id: replacement.absent_player_id });
    effectiveTeamByPlayer.set(replacement.replacement_player_id, replacement.team_id);
  }
  for (const loan of structuralLoans) {
    lineup.push({ player_id: loan.playerId, team_id: loan.targetTeamId, original_team_id: loan.originalTeamId,
      participation_kind: "structural", absent_player_id: null });
    effectiveTeamByPlayer.set(loan.playerId, loan.targetTeamId);
  }

  if (effectiveTeamByPlayer.get(input.goalkeeper_a_id) !== input.team_a_id
    || effectiveTeamByPlayer.get(input.goalkeeper_b_id) !== input.team_b_id) {
    throw new MatchLineupError("O goleiro precisa estar escalado pelo time nesta partida.");
  }
  for (const team of selectedTeams) {
    const fixed = team.fixedGoalkeeperPlayerId;
    if (!fixed || effectiveTeamByPlayer.get(fixed) !== team.id) continue;
    const selected = team.id === input.team_a_id ? input.goalkeeper_a_id : input.goalkeeper_b_id;
    if (selected !== fixed) throw new MatchLineupError(`O goleiro fixo do ${team.name} está disponível e deve iniciar no gol.`);
  }
  for (const [teamId, forcedPlayerId] of forcedGoalkeeperByTeam) {
    const selected = teamId === input.team_a_id ? input.goalkeeper_a_id : input.goalkeeper_b_id;
    if (selected !== forcedPlayerId) throw new MatchLineupError("O substituto do jogador ausente precisa iniciar no gol nesta partida.");
  }

  const goalkeeperRotationOrder = (teamId: string, playerId: string) => {
    const structural = structuralLoans.find((loan) => loan.targetTeamId === teamId && loan.playerId === playerId);
    if (structural) return structural.rotationOrder;
    const shift = structuralLoans.some((loan) => loan.targetTeamId === teamId && loan.rotationOrder === 1) ? 1 : 0;
    const replacement = replacements.find((entry) => entry.team_id === teamId && entry.replacement_player_id === playerId);
    const sourcePlayerId = replacement?.absent_player_id || playerId;
    const order = selectedTeams.find((team) => team.id === teamId)?.players
      .find((player) => player.playerId === sourcePlayerId)?.goalkeeperOrder || 0;
    return order > 0 ? order + shift : null;
  };

  return {
    lineup,
    goalkeeperARotationOrder: goalkeeperRotationOrder(input.team_a_id, input.goalkeeper_a_id),
    goalkeeperBRotationOrder: goalkeeperRotationOrder(input.team_b_id, input.goalkeeper_b_id),
  };
}
