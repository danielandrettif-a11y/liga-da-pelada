import {
  type OverallAppearance,
  type OverallPlayer,
  type OverallRoundInput,
  type OverallResult,
} from "./overall";

type HistoryEvent = {
  player_id: string;
  assist_player_id?: string | null;
  team_id: string;
  is_own_goal?: boolean | null;
  elapsed_seconds?: number | null;
  minute?: number | null;
};

type HistoryMatchPlayer = {
  player_id: string;
  team_id: string;
  entered_elapsed_seconds?: number | null;
  left_elapsed_seconds?: number | null;
};

type HistoryMatch = {
  id?: string | null;
  status: string;
  team_a_id: string;
  team_b_id: string;
  score_a: number;
  score_b: number;
  duration_seconds?: number | null;
  timer_accumulated_seconds?: number | null;
  eligibility_elapsed_offset_seconds?: number | null;
  match_events?: HistoryEvent[] | null;
  match_players?: HistoryMatchPlayer[] | null;
  match_goalkeepers?: Array<{ player_id: string; team_id: string }> | null;
};

type HistoryRound = {
  id: string;
  number: number;
  date: string;
  created_at?: string | null;
  round_type: "official" | "friendly";
  status: "finished" | "draft" | "active";
  matches?: HistoryMatch[] | null;
  player_round_stats?: Array<{
    player_id: string;
    player_profile_locked?: OverallAppearance["playerProfileLocked"] | null;
    goals?: number | null;
    assists?: number | null;
    own_goals?: number | null;
  }> | null;
};

export type OverallHistorySource = {
  players: OverallPlayer[];
  rounds: HistoryRound[];
  zeroPointOverrides: Array<{ round_id: string; player_id: string }>;
};

const MAX_MATCH_SECONDS = 420;

function boundedSeconds(value: number) {
  return Math.min(MAX_MATCH_SECONDS, Math.max(0, Math.round(value)));
}

function eventSeconds(event: HistoryEvent) {
  if (Number.isFinite(event.elapsed_seconds)) return boundedSeconds(Number(event.elapsed_seconds));
  if (Number.isFinite(event.minute)) return boundedSeconds(Number(event.minute) * 60);
  return null;
}

function matchEndSeconds(match: HistoryMatch) {
  const configuredDuration = boundedSeconds(Number(match.duration_seconds || MAX_MATCH_SECONDS)) || MAX_MATCH_SECONDS;
  const eventEnd = Math.max(0, ...(match.match_events || []).map(eventSeconds).filter((value): value is number => value !== null));
  const timerEnd = boundedSeconds(Number(match.timer_accumulated_seconds || 0) + Number(match.eligibility_elapsed_offset_seconds || 0));
  // Histórico anterior ao cronômetro exato pode ter placar, mas não ter os
  // eventos necessários para saber quando a segunda bola entrou. Nessa dúvida,
  // usar sete minutos evita excluir injustamente toda a escalação.
  const scoreEndedWithRecordedTime = match.score_a + match.score_b >= 2 && eventEnd > 0 ? eventEnd : configuredDuration;
  return Math.min(configuredDuration, Math.max(eventEnd, timerEnd, scoreEndedWithRecordedTime));
}

function teamResult(match: HistoryMatch, teamId: string): OverallResult {
  const score = teamId === match.team_a_id ? match.score_a : match.score_b;
  const opponentScore = teamId === match.team_a_id ? match.score_b : match.score_a;
  return score > opponentScore ? "win" : score === opponentScore ? "draw" : "loss";
}

function teamConceded(match: HistoryMatch, teamId: string) {
  return teamId === match.team_a_id ? Number(match.score_b || 0) : Number(match.score_a || 0);
}

function completedGoalEvents(match: HistoryMatch) {
  const scoringEvents = (match.match_events || []).filter((event) => eventSeconds(event) !== null);
  return scoringEvents.length >= Number(match.score_a || 0) + Number(match.score_b || 0);
}

function duringAppearance(event: HistoryEvent, start: number, end: number) {
  const seconds = eventSeconds(event);
  return seconds !== null && seconds >= start && seconds <= end;
}

/** Converte o histórico cru do Supabase no contrato puro do motor de OVR. */
export function buildOverallHistoryInput(source: OverallHistorySource): {
  players: OverallPlayer[];
  rounds: OverallRoundInput[];
} {
  const ignored = new Set(source.zeroPointOverrides.map((override) => `${override.round_id}:${override.player_id}`));
  const selectablePlayers = new Set(source.players.map((player) => player.id));

  const rounds = source.rounds.map((round) => {
    const profileByPlayer = new Map((round.player_round_stats || []).map((stat) => [stat.player_id, stat.player_profile_locked || null]));
    const statsByPlayer = new Map((round.player_round_stats || []).map((stat) => [stat.player_id, stat]));
    const appearances: OverallAppearance[] = [];
    const appearanceIndexesByPlayer = new Map<string, number[]>();
    const registeredByPlayer = new Map<string, { goals: number; assists: number; ownGoals: number }>();

    for (const match of (round.matches || []).filter((item) => item.status === "finished")) {
      const end = matchEndSeconds(match);
      const goalkeeperIds = new Set((match.match_goalkeepers || []).map((goalkeeper) => goalkeeper.player_id));
      const useGoalEvents = completedGoalEvents(match);

      for (const participant of match.match_players || []) {
        if (!selectablePlayers.has(participant.player_id) || ignored.has(`${round.id}:${participant.player_id}`)) continue;
        const start = boundedSeconds(Number(participant.entered_elapsed_seconds || 0));
        const leave = participant.left_elapsed_seconds === null || participant.left_elapsed_seconds === undefined
          ? end
          : boundedSeconds(participant.left_elapsed_seconds);
        const secondsPlayed = Math.max(0, leave - start);
        if (secondsPlayed === 0) continue;
        const eventsDuringAppearance = (match.match_events || []).filter((event) => duringAppearance(event, start, leave));
        const opponentGoalEvents = eventsDuringAppearance.filter((event) => event.team_id !== participant.team_id);
        const ownGoals = eventsDuringAppearance.filter((event) => event.player_id === participant.player_id && event.is_own_goal).length;
        const goals = eventsDuringAppearance.filter((event) => event.player_id === participant.player_id && !event.is_own_goal).length;
        const assists = eventsDuringAppearance.filter((event) => event.assist_player_id === participant.player_id && !event.is_own_goal).length;

        const current = registeredByPlayer.get(participant.player_id) || { goals: 0, assists: 0, ownGoals: 0 };
        current.goals += goals;
        current.assists += assists;
        current.ownGoals += ownGoals;
        registeredByPlayer.set(participant.player_id, current);
        const index = appearances.length;
        appearances.push({
          playerId: participant.player_id,
          // Todo registro novo possui id; o fallback mantém o modo sombra
          // compatível com o histórico e fixtures anteriores.
          matchId: match.id || `${round.id}:${match.team_a_id}:${match.team_b_id}`,
          teamId: participant.team_id,
          secondsPlayed,
          matchSeconds: end,
          goalsConceded: useGoalEvents ? opponentGoalEvents.length : teamConceded(match, participant.team_id),
          concededGoalSeconds: useGoalEvents
            ? opponentGoalEvents.map((event) => Math.max(0, Number(eventSeconds(event) || 0) - start))
            : [],
          goalTimingQuality: useGoalEvents ? "exact" : "fallback",
          goals,
          assists,
          ownGoals,
          result: teamResult(match, participant.team_id),
          playerProfileLocked: profileByPlayer.get(participant.player_id) || null,
          isGoalkeeper: goalkeeperIds.has(participant.player_id),
        });
        const indexes = appearanceIndexesByPlayer.get(participant.player_id) || [];
        indexes.push(index);
        appearanceIndexesByPlayer.set(participant.player_id, indexes);
      }
    }

    // Parte do histórico antigo possui o placar consolidado, mas não o segundo
    // exato de cada evento. Eventos completos continuam sendo a fonte primária;
    // estes valores entram apenas como complemento para não apagar artilheiros e
    // garçons já reconhecidos pelas estatísticas oficiais da rodada.
    for (const [playerId, stats] of statsByPlayer) {
      const indexes = appearanceIndexesByPlayer.get(playerId) || [];
      if (indexes.length === 0) continue;
      const registered = registeredByPlayer.get(playerId) || { goals: 0, assists: 0, ownGoals: 0 };
      const missing = {
        goals: Math.max(0, Number(stats.goals || 0) - registered.goals),
        assists: Math.max(0, Number(stats.assists || 0) - registered.assists),
        ownGoals: Math.max(0, Number(stats.own_goals || 0) - registered.ownGoals),
      };
      const totalSeconds = indexes.reduce((total, index) => total + appearances[index].secondsPlayed, 0);
      if (totalSeconds <= 0) continue;
      for (const index of indexes) {
        const share = appearances[index].secondsPlayed / totalSeconds;
        appearances[index].goals = Number(appearances[index].goals || 0) + missing.goals * share;
        appearances[index].assists = Number(appearances[index].assists || 0) + missing.assists * share;
        appearances[index].ownGoals = Number(appearances[index].ownGoals || 0) + missing.ownGoals * share;
      }
    }

    return {
      id: round.id,
      sequence: round.number,
      date: round.date,
      createdAt: round.created_at || undefined,
      roundType: round.round_type,
      status: round.status,
      appearances,
    } satisfies OverallRoundInput;
  });

  return { players: source.players, rounds };
}
