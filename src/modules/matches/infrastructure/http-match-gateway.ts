import { ApiError } from "@/modules/shared/domain/api-error";
import { apiClient, readApiError } from "@/modules/shared/infrastructure/api-client";
export class MatchApiError extends ApiError {}

type ApiErrorPayload = {
  code?: string;
  message?: string;
};

export type MatchTimerNotificationClaim = {
  skipped?: boolean;
  reason?: "inactive" | "too_early" | "already_alerted";
  secondsLeft?: number;
  claimedAt?: string;
  match?: {
    id: string;
    round_id: string;
    score_a: number;
    score_b: number;
    team_a: { name: string } | null;
    team_b: { name: string } | null;
  };
};

export type MatchHttpGateway = {
  getMatch(leagueId: string, matchId: string): Promise<any>;
  findLiveMatchForTeams(leagueId: string, roundId: string, teamAId: string, teamBId: string): Promise<{ matchId: string | null }>;
  getFinishedMatchAudit(leagueId: string, matchId: string): Promise<any[]>;
  createMatch(leagueId: string, input: any): Promise<{ success: true; matchId: string; idempotent?: boolean; receipt?: any; error?: undefined; uncertain?: undefined }>;
  finishMatch(leagueId: string, matchId: string, expectedScore?: { a: number; b: number }): Promise<{
    success: true;
    roundId: string;
    alreadyFinished?: boolean;
    match?: {
      id: string;
      round_id: string;
      score_a: number;
      score_b: number;
      team_a: { name: string } | null;
      team_b: { name: string } | null;
    };
    quickStart?: any;
    warning?: string;
    error?: undefined;
  }>;
  deleteMatch(leagueId: string, matchId: string): Promise<{ success: true; roundId: string; warning?: string; error?: undefined }>;
  deleteEvent(leagueId: string, matchId: string, eventId: string): Promise<{ success: true; roundId: string; scoreA: number; scoreB: number; error?: undefined }>;
  correctFinishedGoal(leagueId: string, eventId: string, confirmation: string): Promise<{ success: true; roundId: string; matchId: string; warning?: string; error?: undefined }>;
  correctFinishedGoalEvent(leagueId: string, eventId: string, playerId: string, assistPlayerId: string | null, confirmation: string): Promise<{ success: true; roundId: string; matchId: string; warning?: string; error?: undefined }>;
  addFinishedGoalEvent(leagueId: string, matchId: string, teamId: string, playerId: string, assistPlayerId: string | null, confirmation: string): Promise<{ success: true; roundId: string; matchId: string; warning?: string; error?: undefined }>;
  changeMatchGoalkeeper(leagueId: string, matchId: string, teamId: string, playerId: string, elapsedSeconds?: number): Promise<{ success: true; roundId: string; error?: undefined }>;
  correctFinishedGoalkeeper(leagueId: string, matchId: string, teamId: string, playerId: string, confirmation: string): Promise<{ success: true; roundId: string; error?: undefined }>;
  setRoundTeamFixedGoalkeeper(leagueId: string, roundId: string, teamId: string, playerId: string | null): Promise<{ success: true; roundId: string; error?: undefined }>;
  substituteMatchPlayer(leagueId: string, input: any): Promise<{ success: true; roundId: string; substitutionId: string; error?: undefined }>;
  undoLastMatchSubstitution(leagueId: string, matchId: string, substitutionId: string): Promise<{ success: true; roundId: string; error?: undefined }>;
  updateMatchTimer(leagueId: string, matchId: string, action: string): Promise<{ success: true; timerStartedAt?: string | null; timerAccumulatedSeconds?: number; error?: undefined }>;
  resetMatchTimer(leagueId: string, matchId: string): Promise<{ success: true; eligibilityOffset: number; error?: undefined }>;
  addMatchExtraTime(leagueId: string, matchId: string, extraSeconds: number): Promise<{ success: true; newDuration: number; error?: undefined }>;
  notifyMatchTimerThreshold(leagueId: string, matchId: string, threshold: string): Promise<{ success: true; error?: undefined } & MatchTimerNotificationClaim>;
  dispatchMatchTimerThreshold(leagueId: string, matchId: string, threshold: string): Promise<{ success: true; error?: undefined } & MatchTimerNotificationClaim>;
  releaseMatchTimerThreshold(leagueId: string, matchId: string, threshold: string, claimedAt: string): Promise<void>;
  selectBestGoalkeeper(leagueId: string, roundId: string, playerId: string): Promise<{ success: true; error?: undefined }>;
};

export function httpMatchGateway(backendUrl: string, accessToken?: string): MatchHttpGateway {
  const base = backendUrl.replace(/\/+$/, "");

  const request = apiClient({ accessToken, fallback: "Erro na operação da partida.", ErrorClass: MatchApiError });

  return {
    async getMatch(leagueId, matchId) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}`, {
        cache: "no-store",
      });
      return res.json();
    },

    async findLiveMatchForTeams(leagueId, roundId, teamAId, teamBId) {
      const url = new URL(`${base}/api/matches/leagues/${leagueId}/live`);
      url.searchParams.set("roundId", roundId);
      url.searchParams.set("teamAId", teamAId);
      url.searchParams.set("teamBId", teamBId);
      const res = await request(url.toString(), {
        cache: "no-store",
      });
      return res.json();
    },

    async getFinishedMatchAudit(leagueId, matchId) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/audit`, {
        cache: "no-store",
      });
      return res.json();
    },

    async createMatch(leagueId, input) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}`, {
        method: "POST",
        json: input,
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async finishMatch(leagueId, matchId, expectedScore) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/finish`, {
        method: "POST",
        json: expectedScore ? { expectedScore } : undefined,
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async deleteMatch(leagueId, matchId) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async deleteEvent(leagueId, matchId, eventId) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/events/${eventId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async correctFinishedGoal(leagueId, eventId, confirmation) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/events/${eventId}/correct-goal`, {
        method: "POST",
        json: { confirmation },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async correctFinishedGoalEvent(leagueId, eventId, playerId, assistPlayerId, confirmation) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/events/${eventId}/correct-goal-event`, {
        method: "PATCH",
        json: { playerId, assistPlayerId, confirmation },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async addFinishedGoalEvent(leagueId, matchId, teamId, playerId, assistPlayerId, confirmation) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/events/add-goal`, {
        method: "POST",
        json: { teamId, playerId, assistPlayerId, confirmation },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async changeMatchGoalkeeper(leagueId, matchId, teamId, playerId, elapsedSeconds) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/teams/${teamId}/goalkeeper`, {
        method: "PATCH",
        json: { playerId, elapsedSeconds },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async correctFinishedGoalkeeper(leagueId, matchId, teamId, playerId, confirmation) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/teams/${teamId}/correct-goalkeeper`, {
        method: "POST",
        json: { playerId, confirmation },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async setRoundTeamFixedGoalkeeper(leagueId, roundId, teamId, playerId) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/rounds/${roundId}/teams/${teamId}/fixed-goalkeeper`, {
        method: "PATCH",
        json: { playerId },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async substituteMatchPlayer(leagueId, input) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/substitutions`, {
        method: "POST",
        json: input,
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async undoLastMatchSubstitution(leagueId, matchId, substitutionId) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/substitutions/${substitutionId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async updateMatchTimer(leagueId, matchId, action) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer`, {
        method: "PATCH",
        json: { action },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async resetMatchTimer(leagueId, matchId) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer/reset`, {
        method: "POST",
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async addMatchExtraTime(leagueId, matchId, extraSeconds) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer/extra-time`, {
        method: "POST",
        json: { extraSeconds },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async notifyMatchTimerThreshold(leagueId, matchId, threshold) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer/notify`, {
        method: "POST",
        json: { threshold },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async dispatchMatchTimerThreshold(leagueId, matchId, threshold) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer/dispatch`, {
        method: "POST",
        json: { threshold },
      });
      const data = await res.json();
      return { success: true, ...data };
    },

    async releaseMatchTimerThreshold(leagueId, matchId, threshold, claimedAt) {
      await request(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer/notify`, {
        method: "DELETE",
        json: { threshold, claimedAt },
      });
    },

    async selectBestGoalkeeper(leagueId, roundId, playerId) {
      const res = await request(`${base}/api/matches/leagues/${leagueId}/rounds/${roundId}/goalkeeper/best`, {
        method: "POST",
        json: { playerId },
      });
      return res.json();
    },
  };
}

export async function dispatchSystemMatchTimerThreshold(
  backendUrl: string,
  webhookSecret: string,
  matchId: string,
  threshold: string,
): Promise<MatchTimerNotificationClaim> {
  const base = backendUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/api/internal/matches/${matchId}/timer/dispatch`, {
    method: "POST",
    headers: { authorization: `Bearer ${webhookSecret}`, "content-type": "application/json" },
    body: JSON.stringify({ threshold }),
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await readApiError(response, "Erro na operação da partida.");
    throw new MatchApiError(error.message, error.statusCode, error.fieldErrors, error.code);
  }
  return response.json();
}

export async function releaseSystemMatchTimerThreshold(
  backendUrl: string,
  webhookSecret: string,
  matchId: string,
  threshold: string,
  claimedAt: string,
): Promise<void> {
  const base = backendUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/api/internal/matches/${matchId}/timer/dispatch`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${webhookSecret}`, "content-type": "application/json" },
    body: JSON.stringify({ threshold, claimedAt }),
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await readApiError(response, "Erro na operação da partida.");
    throw new MatchApiError(error.message, error.statusCode, error.fieldErrors, error.code);
  }
}
