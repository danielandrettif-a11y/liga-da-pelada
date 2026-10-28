export class MatchApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "MatchApiError";
  }
}

type ApiErrorPayload = {
  code?: string;
  message?: string;
};

export type MatchHttpGateway = {
  getMatch(leagueId: string, matchId: string): Promise<any>;
  findLiveMatchForTeams(leagueId: string, roundId: string, teamAId: string, teamBId: string): Promise<{ matchId: string | null }>;
  getFinishedMatchAudit(leagueId: string, matchId: string): Promise<any[]>;
  createMatch(leagueId: string, input: any): Promise<{ success: true; matchId: string; idempotent?: boolean; receipt?: any; error?: undefined; uncertain?: undefined }>;
  finishMatch(leagueId: string, matchId: string): Promise<{ success: true; roundId: string; quickStart?: any; error?: undefined }>;
  deleteMatch(leagueId: string, matchId: string): Promise<{ success: true; roundId: string; warning?: string; error?: undefined }>;
  deleteEvent(leagueId: string, matchId: string, eventId: string): Promise<{ success: true; roundId: string; scoreA: number; scoreB: number; error?: undefined }>;
  correctFinishedGoal(leagueId: string, eventId: string, confirmation: string): Promise<{ success: true; roundId: string; matchId: string; warning?: string; error?: undefined }>;
  correctFinishedGoalEvent(leagueId: string, eventId: string, playerId: string, assistPlayerId: string | null, confirmation: string): Promise<{ success: true; roundId: string; matchId: string; warning?: string; error?: undefined }>;
  addFinishedGoalEvent(leagueId: string, matchId: string, teamId: string, playerId: string, assistPlayerId: string | null, confirmation: string): Promise<{ success: true; roundId: string; matchId: string; warning?: string; error?: undefined }>;
  changeMatchGoalkeeper(leagueId: string, matchId: string, teamId: string, playerId: string, elapsedSeconds?: number): Promise<{ success: true; roundId: string; error?: undefined }>;
  setRoundTeamFixedGoalkeeper(leagueId: string, roundId: string, teamId: string, playerId: string | null): Promise<{ success: true; roundId: string; error?: undefined }>;
  substituteMatchPlayer(leagueId: string, input: any): Promise<{ success: true; roundId: string; substitutionId: string; error?: undefined }>;
  undoLastMatchSubstitution(leagueId: string, matchId: string, substitutionId: string): Promise<{ success: true; roundId: string; error?: undefined }>;
  updateMatchTimer(leagueId: string, matchId: string, action: string): Promise<{ success: true; timerStartedAt?: string | null; timerAccumulatedSeconds?: number; error?: undefined }>;
  resetMatchTimer(leagueId: string, matchId: string): Promise<{ success: true; eligibilityOffset: number; error?: undefined }>;
  addMatchExtraTime(leagueId: string, matchId: string, extraSeconds: number): Promise<{ success: true; newDuration: number; error?: undefined }>;
  notifyMatchTimerThreshold(leagueId: string, matchId: string, threshold: string): Promise<{ success: true; sent?: boolean; skipped?: boolean; reason?: string; secondsLeft?: number; error?: undefined }>;
  dispatchMatchTimerThreshold(leagueId: string, matchId: string, threshold: string): Promise<{ success: true; sent?: boolean; skipped?: boolean; reason?: string; secondsLeft?: number; error?: undefined }>;
  selectBestGoalkeeper(leagueId: string, roundId: string, playerId: string): Promise<{ success: true; error?: undefined }>;
};

async function parseApiError(response: Response): Promise<never> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  const message = typeof payload?.message === "string" ? payload.message : "Erro na operação da partida.";
  throw new MatchApiError(message, response.status);
}

export function httpMatchGateway(backendUrl: string, accessToken?: string): MatchHttpGateway {
  const base = backendUrl.replace(/\/+$/, "");

  const authHeaders = (hasBody = false) => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    if (hasBody) headers["content-type"] = "application/json";
    return headers;
  };

  return {
    async getMatch(leagueId, matchId) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async findLiveMatchForTeams(leagueId, roundId, teamAId, teamBId) {
      const url = new URL(`${base}/api/matches/leagues/${leagueId}/live`);
      url.searchParams.set("roundId", roundId);
      url.searchParams.set("teamAId", teamAId);
      url.searchParams.set("teamBId", teamBId);
      const res = await fetch(url.toString(), {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async getFinishedMatchAudit(leagueId, matchId) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/audit`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async createMatch(leagueId, input) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async finishMatch(leagueId, matchId) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/finish`, {
        method: "POST",
        headers: authHeaders(true),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async deleteMatch(leagueId, matchId) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async deleteEvent(leagueId, matchId, eventId) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/events/${eventId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async correctFinishedGoal(leagueId, eventId, confirmation) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/events/${eventId}/correct-goal`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ confirmation }),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async correctFinishedGoalEvent(leagueId, eventId, playerId, assistPlayerId, confirmation) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/events/${eventId}/correct-goal-event`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ playerId, assistPlayerId, confirmation }),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async addFinishedGoalEvent(leagueId, matchId, teamId, playerId, assistPlayerId, confirmation) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/events/add-goal`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ teamId, playerId, assistPlayerId, confirmation }),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async changeMatchGoalkeeper(leagueId, matchId, teamId, playerId, elapsedSeconds) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/teams/${teamId}/goalkeeper`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ playerId, elapsedSeconds }),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async setRoundTeamFixedGoalkeeper(leagueId, roundId, teamId, playerId) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/rounds/${roundId}/teams/${teamId}/fixed-goalkeeper`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async substituteMatchPlayer(leagueId, input) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/substitutions`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async undoLastMatchSubstitution(leagueId, matchId, substitutionId) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/substitutions/${substitutionId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async updateMatchTimer(leagueId, matchId, action) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ action }),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async resetMatchTimer(leagueId, matchId) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer/reset`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async addMatchExtraTime(leagueId, matchId, extraSeconds) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer/extra-time`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ extraSeconds }),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async notifyMatchTimerThreshold(leagueId, matchId, threshold) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer/notify`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ threshold }),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async dispatchMatchTimerThreshold(leagueId, matchId, threshold) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/${matchId}/timer/dispatch`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ threshold }),
      });
      if (!res.ok) await parseApiError(res);
      const data = await res.json();
      return { success: true, ...data };
    },

    async selectBestGoalkeeper(leagueId, roundId, playerId) {
      const res = await fetch(`${base}/api/matches/leagues/${leagueId}/rounds/${roundId}/goalkeeper/best`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },
  };
}
