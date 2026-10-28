type ApiErrorPayload = { message?: unknown };

export class RoundApiError extends Error {
  constructor(message: string, public readonly statusCode: number | null = null) {
    super(message);
    this.name = "RoundApiError";
  }
}

export type RoundHttpGateway = {
  getRounds(seasonId: string): Promise<any[]>;
  getRound(leagueId: string, roundId: string): Promise<any>;
  getRoundMatchSetup(leagueId: string, roundId: string): Promise<any>;
  getActiveLeague(leagueId: string): Promise<any>;
  createRoundWithTeams(leagueId: string, input: any): Promise<{ roundId: string }>;
  deleteRound(leagueId: string, roundId: string): Promise<void>;
  finishRound(leagueId: string, roundId: string, input: {
    paymentPix: string;
    paymentTotal: number;
    recipientId?: string | null;
    recipientName?: string | null;
    expenseItemIds?: string[];
  }): Promise<{ archived: boolean; shouldRefreshOverall: boolean }>;
  getAdminRoundPrelist(leagueId: string, roundId: string): Promise<any>;
  getAdminRoundPrelists(leagueId: string): Promise<any[]>;
  saveRoundPrelist(leagueId: string, input: any): Promise<{
    roundId: string;
    effectiveDate: string;
    effectiveStartTime: string;
    effectiveRoundType: "official" | "friendly";
    created: boolean;
  }>;
  setCallupFormat(leagueId: string, callupId: string, format: { playersPerTeam: number; teamsPerRound: number }): Promise<{ success: boolean; fantasySizePreserved: boolean; fantasyLineupSize: number }>;
  setCallupMatchSize(leagueId: string, callupId: string, size: { playersPerTeam: number; teamsPerRound: number }): Promise<void>;
  getNextTeamPresetOffset(leagueId: string, roundType?: "official" | "friendly"): Promise<{ offset: number }>;
  markRoundTeamArrived(leagueId: string, roundId: string, teamId: string, arrived: boolean): Promise<void>;
  openCallupReplacementVacancy(leagueId: string, roundId: string, outPlayerId: string): Promise<void>;
  previewRoundTeamShuffle(leagueId: string, roundId: string, mode: string): Promise<any>;
  applyRoundTeamShuffle(
    leagueId: string,
    roundId: string,
    input: { mode: string; assignments?: Array<{ teamId: string; playerIds: string[] }> },
  ): Promise<void>;
  applyPermanentRoundTeamFormation(
    leagueId: string,
    roundId: string,
    input: { assignments: Array<{ teamId: string; playerIds: string[] }> },
  ): Promise<void>;
  swapRoundTeamPlayers(leagueId: string, roundId: string, playerA: string, playerB: string): Promise<void>;
  setRoundAttendanceBulk(leagueId: string, roundId: string, playerIds: string[]): Promise<void>;
  setRoundPlayerAttendance(leagueId: string, roundId: string, playerId: string, present: boolean): Promise<void>;
  setRoundPlayerAvailability(leagueId: string, roundId: string, playerId: string, status: "available" | "injured"): Promise<void>;
  setRoundTeamCaptain(leagueId: string, roundId: string, teamId: string, captainPlayerId: string | null): Promise<void>;
  setRoundTeamVestColor(leagueId: string, roundId: string, teamId: string, color: string): Promise<void>;
  transferRoundPlayerIdentity(leagueId: string, roundId: string, sourcePlayerId: string, targetPlayerId: string): Promise<void>;
  zeroPlayerRoundPoints(leagueId: string, roundId: string, playerId: string, reason: string): Promise<void>;
  addRoundEmergencySubstitute(
    leagueId: string,
    roundId: string,
    input: { outPlayerId: string; inPlayerId: string; teamId: string },
  ): Promise<void>;
  createTeamDraft(leagueId: string, roundId: string, callupId?: string | null): Promise<{ draftId: string }>;
  getDraftWorkspace(leagueId: string, callupId: string): Promise<any>;
  getDraftWorkspaceByRound(leagueId: string, roundId: string): Promise<any>;
  startTeamDraft(leagueId: string, draftId: string): Promise<void>;
  makeTeamDraftPick(leagueId: string, draftId: string, playerId: string): Promise<void>;
  replaceTeamDraftCaptain(leagueId: string, draftId: string, teamSlot: number, newCaptainId: string): Promise<void>;
  restartTeamDraft(leagueId: string, draftId: string): Promise<void>;
  finalizeTeamDraft(leagueId: string, draftId: string): Promise<{ roundId: string }>;
  applyDraftSwap(leagueId: string, draftId: string, playerAId: string, playerBId: string): Promise<void>;
  drawTeamsAdaptiveOnServer(leagueId: string, input: any): Promise<any>;
};

async function parseApiError(response: Response): Promise<never> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  const message = typeof payload?.message === "string" ? payload.message : "Erro na operação da rodada.";
  throw new RoundApiError(message, response.status);
}

export function httpRoundGateway(backendUrl: string, accessToken?: string): RoundHttpGateway {
  const base = backendUrl.replace(/\/+$/, "");

  const authHeaders = (hasBody = false) => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    if (hasBody) headers["content-type"] = "application/json";
    return headers;
  };

  return {
    async getRounds(seasonId: string) {
      const res = await fetch(`${base}/api/rounds/seasons/${seasonId}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async getRound(leagueId: string, roundId: string) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async getRoundMatchSetup(leagueId: string, roundId: string) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/match-setup`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async getActiveLeague(leagueId: string) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/active-league`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async createRoundWithTeams(leagueId: string, input: any) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async deleteRound(leagueId: string, roundId: string) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
    },

    async finishRound(leagueId, roundId, input) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/finish`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async getAdminRoundPrelist(leagueId: string, roundId: string) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/prelist`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async getAdminRoundPrelists(leagueId: string) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/prelists`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async saveRoundPrelist(leagueId: string, input: any) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/prelist`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async setCallupFormat(leagueId, callupId, format) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/callups/${callupId}/format`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(format),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async setCallupMatchSize(leagueId, callupId, size) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/callups/${callupId}/match-size`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(size),
      });
      if (!res.ok) await parseApiError(res);
    },

    async getNextTeamPresetOffset(leagueId: string, roundType = "official") {
      const query = new URLSearchParams({ roundType });
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/next-team-preset-offset?${query}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async markRoundTeamArrived(leagueId, roundId, teamId, arrived) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/teams/${teamId}/arrived`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ arrived }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async openCallupReplacementVacancy(leagueId, roundId, outPlayerId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/replacement-vacancy`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ outPlayerId }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async previewRoundTeamShuffle(leagueId, roundId, mode) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/shuffle/preview`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async applyRoundTeamShuffle(leagueId, roundId, input) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/shuffle/apply`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
    },

    async applyPermanentRoundTeamFormation(leagueId, roundId, input) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/permanent-formation`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
    },

    async swapRoundTeamPlayers(leagueId, roundId, playerA, playerB) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/swap-players`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ playerA, playerB }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async setRoundAttendanceBulk(leagueId, roundId, playerIds) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/attendance/bulk`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ playerIds }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async setRoundPlayerAttendance(leagueId, roundId, playerId, present) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/attendance`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ playerId, present }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async setRoundPlayerAvailability(leagueId, roundId, playerId, status) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/availability`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ playerId, status }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async setRoundTeamCaptain(leagueId, roundId, teamId, captainPlayerId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/teams/${teamId}/captain`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ captainPlayerId }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async setRoundTeamVestColor(leagueId, roundId, teamId, color) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/teams/${teamId}/vest-color`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ color }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async transferRoundPlayerIdentity(leagueId, roundId, sourcePlayerId, targetPlayerId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/transfer-player-identity`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ sourcePlayerId, targetPlayerId }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async zeroPlayerRoundPoints(leagueId, roundId, playerId, reason) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/players/${playerId}/zero-points`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async addRoundEmergencySubstitute(leagueId, roundId, input) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/emergency-substitute`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
    },

    async createTeamDraft(leagueId, roundId, callupId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/draft`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ callupId }),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async getDraftWorkspace(leagueId, callupId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/callups/${callupId}/draft-workspace`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async getDraftWorkspaceByRound(leagueId, roundId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/${roundId}/draft-workspace`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async startTeamDraft(leagueId, draftId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/start`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
    },

    async makeTeamDraftPick(leagueId, draftId, playerId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/pick`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async replaceTeamDraftCaptain(leagueId, draftId, teamSlot, newCaptainId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/replace-captain`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ teamSlot, newCaptainId }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async restartTeamDraft(leagueId, draftId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/restart`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
    },

    async finalizeTeamDraft(leagueId, draftId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/finalize`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async applyDraftSwap(leagueId, draftId, playerAId, playerBId) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/swap`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ playerAId, playerBId }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async drawTeamsAdaptiveOnServer(leagueId, input) {
      const res = await fetch(`${base}/api/rounds/leagues/${leagueId}/adaptive-draw`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },
  };
}
