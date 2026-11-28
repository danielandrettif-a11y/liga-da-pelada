export type GoalkeeperTimelineEvent = {
  playerId: string;
  assistPlayerId?: string | null;
  teamId: string;
  isOwnGoal?: boolean;
  goalkeeperAPlayerId?: string | null;
  goalkeeperBPlayerId?: string | null;
  elapsedSeconds?: number | null;
};

export type GoalkeeperTimelineStint = {
  playerId: string;
  teamId: string;
  enteredElapsedSeconds: number;
  leftElapsedSeconds?: number | null;
  selectedAt?: string;
};

export type GoalkeeperTimelineMatch = {
  status: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  officialElapsedSeconds?: number;
  durationSeconds?: number;
  goalkeepers: readonly { playerId: string; teamId: string }[];
  goalkeeperStints?: readonly GoalkeeperTimelineStint[];
  events: readonly GoalkeeperTimelineEvent[];
};

export type GoalkeeperMatchScouts = {
  playerId: string;
  teamId: string;
  goalkeeperGames: number;
  goalsConceded: number;
  cleanSheets: number;
  goalkeeperGoals: number;
  goalkeeperAssists: number;
  goalkeeperOwnGoals: number;
  goalkeeperWins: number;
  goalkeeperDraws: number;
  goalkeeperLosses: number;
};

export function effectiveGoalkeeperStints(
  match: Pick<GoalkeeperTimelineMatch, "teamAId" | "teamBId" | "goalkeepers" | "goalkeeperStints">,
): Array<GoalkeeperTimelineStint & { legacy: boolean }> {
  const recorded = match.goalkeeperStints || [];
  return [match.teamAId, match.teamBId].flatMap((teamId): Array<GoalkeeperTimelineStint & { legacy: boolean }> => {
    const teamStints = recorded.filter((stint) => stint.teamId === teamId);
    if (teamStints.length > 0) return teamStints.map((stint) => ({ ...stint, legacy: false }));
    return match.goalkeepers
      .filter((item) => item.teamId === teamId)
      .map((item) => ({
        ...item,
        enteredElapsedSeconds: 0,
        leftElapsedSeconds: null,
        legacy: true,
      }));
  });
}

export function goalkeeperAtEvent(
  match: Pick<GoalkeeperTimelineMatch, "teamAId" | "teamBId" | "goalkeepers" | "goalkeeperStints">,
  event: GoalkeeperTimelineEvent,
  teamId: string,
): string | null {
  const snapshot = teamId === match.teamAId
    ? event.goalkeeperAPlayerId
    : teamId === match.teamBId
      ? event.goalkeeperBPlayerId
      : null;
  if (snapshot) return snapshot;
  const teamStints = (match.goalkeeperStints || []).filter((stint) => stint.teamId === teamId);
  if (teamStints.length > 0) {
    const elapsed = Math.max(0, Number(event.elapsedSeconds || 0));
    const stint = [...teamStints]
      .filter((item) => item.enteredElapsedSeconds <= elapsed
        && (item.leftElapsedSeconds == null || item.leftElapsedSeconds > elapsed))
      .sort((a, b) => b.enteredElapsedSeconds - a.enteredElapsedSeconds)[0];
    return stint?.playerId || null;
  }
  return match.goalkeepers.find((item) => item.teamId === teamId)?.playerId || null;
}

export function calculateGoalkeeperMatchScouts(match: GoalkeeperTimelineMatch) {
  const source = effectiveGoalkeeperStints(match);
  const officialElapsed = Math.max(0, Number(match.officialElapsedSeconds || 0));
  const actualDuration = Math.max(
    0,
    officialElapsed || Number(match.durationSeconds || 0),
  );
  // A partida pode ser encerrada sem iniciar o cronômetro. Nesse caso, o
  // último goleiro escolhido de cada time recebe a atuação (e não todos os
  // períodos de duração zero). Gols já trazem snapshot do goleiro exato.
  const lastStintByTeam = new Map<string, GoalkeeperTimelineStint>();
  for (const stint of source) {
    const previous = lastStintByTeam.get(stint.teamId);
    if (!previous ||
      Number(stint.enteredElapsedSeconds || 0) > Number(previous.enteredElapsedSeconds || 0) ||
      (Number(stint.enteredElapsedSeconds || 0) === Number(previous.enteredElapsedSeconds || 0) &&
        (stint.selectedAt || "") >= (previous.selectedAt || ""))) {
      lastStintByTeam.set(stint.teamId, stint);
    }
  }
  const stats = new Map<string, GoalkeeperMatchScouts>();
  const secondsByPlayer = new Map<string, number>();
  const legacyByPlayer = new Map<string, boolean>();

  for (const stint of source) {
    const start = Math.max(0, Number(stint.enteredElapsedSeconds || 0));
    const end = stint.leftElapsedSeconds == null
      ? actualDuration
      : Math.max(start, Number(stint.leftElapsedSeconds));
    const seconds = Math.max(0, end - start);
    const hadRecordedGoal = match.events.some((event) =>
      event.goalkeeperAPlayerId === stint.playerId || event.goalkeeperBPlayerId === stint.playerId,
    );
    if (!stint.legacy && match.status === "finished" && seconds === 0 && !hadRecordedGoal &&
      !(officialElapsed === 0 && lastStintByTeam.get(stint.teamId) === stint)) continue;
    secondsByPlayer.set(stint.playerId, (secondsByPlayer.get(stint.playerId) || 0) + seconds);
    if (stint.legacy) legacyByPlayer.set(stint.playerId, true);
    if (!stats.has(stint.playerId)) {
      stats.set(stint.playerId, {
        playerId: stint.playerId,
        teamId: stint.teamId,
        goalkeeperGames: 1,
        goalsConceded: 0,
        cleanSheets: 0,
        goalkeeperGoals: 0,
        goalkeeperAssists: 0,
        goalkeeperOwnGoals: 0,
        goalkeeperWins: 0,
        goalkeeperDraws: 0,
        goalkeeperLosses: 0,
      });
    }
  }

  const teamAGoalsInEvents = match.events.filter((event) => event.teamId === match.teamAId).length;
  const teamBGoalsInEvents = match.events.filter((event) => event.teamId === match.teamBId).length;
  for (const event of match.events) {
    const concedingTeamId = event.teamId === match.teamAId ? match.teamBId : match.teamAId;
    const concedingKeeper = goalkeeperAtEvent(match, event, concedingTeamId);
    const conceded = concedingKeeper ? stats.get(concedingKeeper) : null;
    if (conceded) conceded.goalsConceded += 1;

    const scorerTeamId = event.isOwnGoal ? concedingTeamId : event.teamId;
    const scorerKeeper = goalkeeperAtEvent(match, event, scorerTeamId);
    if (scorerKeeper === event.playerId) {
      const scorer = stats.get(event.playerId);
      if (scorer) {
        if (event.isOwnGoal) scorer.goalkeeperOwnGoals += 1;
        else scorer.goalkeeperGoals += 1;
      }
    }
    if (!event.isOwnGoal && event.assistPlayerId) {
      const assistingKeeper = goalkeeperAtEvent(match, event, event.teamId);
      if (assistingKeeper === event.assistPlayerId) {
        const assister = stats.get(event.assistPlayerId);
        if (assister) assister.goalkeeperAssists += 1;
      }
    }
  }

  for (const scout of stats.values()) {
    const isTeamA = scout.teamId === match.teamAId;
    const goalsFor = isTeamA ? match.scoreA : match.scoreB;
    const goalsAgainst = isTeamA ? match.scoreB : match.scoreA;
    const isPlayerLegacy = legacyByPlayer.get(scout.playerId) === true;
    if (isPlayerLegacy) {
      // Partidas históricas podem ter placar sem eventos detalhados.
      scout.goalsConceded += Math.max(0, goalsAgainst - (isTeamA ? teamBGoalsInEvents : teamAGoalsInEvents));
    }
    const playedSeconds = secondsByPlayer.get(scout.playerId) || 0;
    const qualifiesForCleanSheet = isPlayerLegacy || officialElapsed === 0 || playedSeconds * 2 >= actualDuration;
    if (scout.goalsConceded === 0 && qualifiesForCleanSheet) scout.cleanSheets = 1;
    if (match.status === "finished") {
      if (goalsFor > goalsAgainst) scout.goalkeeperWins = 1;
      else if (goalsFor === goalsAgainst) scout.goalkeeperDraws = 1;
      else scout.goalkeeperLosses = 1;
    }
  }

  return stats;
}
