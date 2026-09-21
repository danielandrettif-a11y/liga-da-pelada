export type RotationTeam = {
  id: string;
  name: string;
  position?: number | null;
};

export type RotationMatch = {
  id: string;
  team_a_id: string;
  team_b_id: string;
  score_a: number;
  score_b: number;
  match_order?: number | null;
  created_at?: string | null;
  started_at?: string | null;
};

export type NextMatchRotation = {
  teamAId: string;
  teamBId: string;
  stayingTeamId: string;
  outgoingTeamId: string;
  incomingTeamId: string;
  reason: "winner_stays" | "draw_longest_streak" | "draw_initial_order";
  reasonLabel: string;
};

function chronological(matches: RotationMatch[]) {
  return [...matches].sort((a, b) =>
    Number(a.match_order || 0) - Number(b.match_order || 0)
      || String(a.started_at || a.created_at || "").localeCompare(String(b.started_at || b.created_at || "")),
  );
}

function consecutiveAppearances(matches: RotationMatch[], teamId: string) {
  let count = 0;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (match.team_a_id !== teamId && match.team_b_id !== teamId) break;
    count += 1;
  }
  return count;
}

function lastAppearanceIndex(matches: RotationMatch[], teamId: string) {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (matches[index].team_a_id === teamId || matches[index].team_b_id === teamId) return index;
  }
  return -1;
}

export function suggestNextMatchRotation(
  teams: RotationTeam[],
  matches: RotationMatch[],
  finishedMatchId: string,
): NextMatchRotation | null {
  const orderedMatches = chronological(matches);
  const currentIndex = orderedMatches.findIndex((match) => match.id === finishedMatchId);
  if (currentIndex < 0) return null;
  const history = orderedMatches.slice(0, currentIndex + 1);
  const current = history[history.length - 1];
  const waiting = teams.filter((team) => team.id !== current.team_a_id && team.id !== current.team_b_id);
  if (!waiting.length) return null;

  const incoming = [...waiting].sort((a, b) => {
    const appearanceDifference = lastAppearanceIndex(history, a.id) - lastAppearanceIndex(history, b.id);
    if (appearanceDifference !== 0) return appearanceDifference;
    return Number(a.position || Number.MAX_SAFE_INTEGER) - Number(b.position || Number.MAX_SAFE_INTEGER);
  })[0];

  let stayingTeamId: string;
  let outgoingTeamId: string;
  let reason: NextMatchRotation["reason"];
  let reasonLabel: string;

  if (Number(current.score_a) !== Number(current.score_b)) {
    stayingTeamId = Number(current.score_a) > Number(current.score_b) ? current.team_a_id : current.team_b_id;
    outgoingTeamId = stayingTeamId === current.team_a_id ? current.team_b_id : current.team_a_id;
    reason = "winner_stays";
    reasonLabel = "O vencedor permanece e enfrenta o time que está há mais tempo esperando.";
  } else {
    const streakA = consecutiveAppearances(history, current.team_a_id);
    const streakB = consecutiveAppearances(history, current.team_b_id);
    if (streakA !== streakB) {
      outgoingTeamId = streakA > streakB ? current.team_a_id : current.team_b_id;
      reason = "draw_longest_streak";
      reasonLabel = "No empate, sai o time que já estava há mais partidas seguidas em quadra.";
    } else {
      const teamA = teams.find((team) => team.id === current.team_a_id);
      const teamB = teams.find((team) => team.id === current.team_b_id);
      outgoingTeamId = Number(teamA?.position || Number.MAX_SAFE_INTEGER) <= Number(teamB?.position || Number.MAX_SAFE_INTEGER)
        ? current.team_a_id
        : current.team_b_id;
      reason = "draw_initial_order";
      reasonLabel = "Os dois times tinham a mesma sequência; a ordem inicial decidiu quem descansa.";
    }
    stayingTeamId = outgoingTeamId === current.team_a_id ? current.team_b_id : current.team_a_id;
  }

  return {
    teamAId: stayingTeamId,
    teamBId: incoming.id,
    stayingTeamId,
    outgoingTeamId,
    incomingTeamId: incoming.id,
    reason,
    reasonLabel,
  };
}
