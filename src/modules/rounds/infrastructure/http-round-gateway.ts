import { ApiError } from "@/modules/shared/domain/api-error";
import { apiClient } from "@/modules/shared/infrastructure/api-client";
export class RoundApiError extends ApiError {}

export type RoundHttpGateway = {
  getRounds(seasonId: string): Promise<any[]>;
  getRound(leagueId: string, roundId: string): Promise<any>;
  getRoundMatchSetup(leagueId: string, roundId: string): Promise<any>;
  getActiveLeague(leagueId: string): Promise<any>;
  createRoundWithTeams(leagueId: string, input: any): Promise<{ roundId: string }>;
  deleteRound(leagueId: string, roundId: string): Promise<void>;
  finishRound(leagueId: string, roundId: string, input: {
    expectedVersion?: string;
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

export function httpRoundGateway(backendUrl: string, accessToken?: string): RoundHttpGateway {
  const base = backendUrl.replace(/\/+$/, "");

  const request = apiClient({ accessToken, fallback: "Erro na operação da rodada.", ErrorClass: RoundApiError });

  return {
    async getRounds(seasonId: string) {
      const res = await request(`${base}/api/rounds/seasons/${seasonId}`, {
        cache: "no-store",
      });
      return res.json();
    },

    async getRound(leagueId: string, roundId: string) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}`, {
        cache: "no-store",
      });
      return res.json();
    },

    async getRoundMatchSetup(leagueId: string, roundId: string) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/match-setup`, {
        cache: "no-store",
      });
      return res.json();
    },

    async getActiveLeague(leagueId: string) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/active-league`, {
        cache: "no-store",
      });
      return res.json();
    },

    async createRoundWithTeams(leagueId: string, input: any) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}`, {
        method: "POST",
        json: input,
      });
      return res.json();
    },

    async deleteRound(leagueId: string, roundId: string) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}`, {
        method: "DELETE",
      });
    },

    async finishRound(leagueId, roundId, input) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/finish`, {
        method: "POST",
        json: input,
      });
      return res.json();
    },

    async getAdminRoundPrelist(leagueId: string, roundId: string) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/prelist`, {
        cache: "no-store",
      });
      return res.json();
    },

    async getAdminRoundPrelists(leagueId: string) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/prelists`, {
        cache: "no-store",
      });
      return res.json();
    },

    async saveRoundPrelist(leagueId: string, input: any) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/prelist`, {
        method: "POST",
        json: input,
      });
      return res.json();
    },

    async setCallupFormat(leagueId, callupId, format) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/callups/${callupId}/format`, {
        method: "PATCH",
        json: format,
      });
      return res.json();
    },

    async setCallupMatchSize(leagueId, callupId, size) {
      await request(`${base}/api/rounds/leagues/${leagueId}/callups/${callupId}/match-size`, {
        method: "PATCH",
        json: size,
      });
    },

    async getNextTeamPresetOffset(leagueId: string, roundType = "official") {
      const query = new URLSearchParams({ roundType });
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/next-team-preset-offset?${query}`, {
        cache: "no-store",
      });
      return res.json();
    },

    async markRoundTeamArrived(leagueId, roundId, teamId, arrived) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/teams/${teamId}/arrived`, {
        method: "POST",
        json: { arrived },
      });
    },

    async openCallupReplacementVacancy(leagueId, roundId, outPlayerId) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/replacement-vacancy`, {
        method: "POST",
        json: { outPlayerId },
      });
    },

    async previewRoundTeamShuffle(leagueId, roundId, mode) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/shuffle/preview`, {
        method: "POST",
        json: { mode },
      });
      return res.json();
    },

    async applyRoundTeamShuffle(leagueId, roundId, input) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/shuffle/apply`, {
        method: "POST",
        json: input,
      });
    },

    async applyPermanentRoundTeamFormation(leagueId, roundId, input) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/permanent-formation`, {
        method: "POST",
        json: input,
      });
    },

    async swapRoundTeamPlayers(leagueId, roundId, playerA, playerB) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/swap-players`, {
        method: "POST",
        json: { playerA, playerB },
      });
    },

    async setRoundAttendanceBulk(leagueId, roundId, playerIds) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/attendance/bulk`, {
        method: "POST",
        json: { playerIds },
      });
    },

    async setRoundPlayerAttendance(leagueId, roundId, playerId, present) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/attendance`, {
        method: "POST",
        json: { playerId, present },
      });
    },

    async setRoundPlayerAvailability(leagueId, roundId, playerId, status) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/availability`, {
        method: "POST",
        json: { playerId, status },
      });
    },

    async setRoundTeamCaptain(leagueId, roundId, teamId, captainPlayerId) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/teams/${teamId}/captain`, {
        method: "POST",
        json: { captainPlayerId },
      });
    },

    async setRoundTeamVestColor(leagueId, roundId, teamId, color) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/teams/${teamId}/vest-color`, {
        method: "POST",
        json: { color },
      });
    },

    async transferRoundPlayerIdentity(leagueId, roundId, sourcePlayerId, targetPlayerId) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/transfer-player-identity`, {
        method: "POST",
        json: { sourcePlayerId, targetPlayerId },
      });
    },

    async zeroPlayerRoundPoints(leagueId, roundId, playerId, reason) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/players/${playerId}/zero-points`, {
        method: "POST",
        json: { reason },
      });
    },

    async addRoundEmergencySubstitute(leagueId, roundId, input) {
      await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/emergency-substitute`, {
        method: "POST",
        json: input,
      });
    },

    async createTeamDraft(leagueId, roundId, callupId) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/draft`, {
        method: "POST",
        json: { callupId },
      });
      return res.json();
    },

    async getDraftWorkspace(leagueId, callupId) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/callups/${callupId}/draft-workspace`, {
        cache: "no-store",
      });
      return res.json();
    },

    async getDraftWorkspaceByRound(leagueId, roundId) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/${roundId}/draft-workspace`, {
        cache: "no-store",
      });
      return res.json();
    },

    async startTeamDraft(leagueId, draftId) {
      await request(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/start`, {
        method: "POST",
      });
    },

    async makeTeamDraftPick(leagueId, draftId, playerId) {
      await request(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/pick`, {
        method: "POST",
        json: { playerId },
      });
    },

    async replaceTeamDraftCaptain(leagueId, draftId, teamSlot, newCaptainId) {
      await request(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/replace-captain`, {
        method: "POST",
        json: { teamSlot, newCaptainId },
      });
    },

    async restartTeamDraft(leagueId, draftId) {
      await request(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/restart`, {
        method: "POST",
      });
    },

    async finalizeTeamDraft(leagueId, draftId) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/finalize`, {
        method: "POST",
      });
      return res.json();
    },

    async applyDraftSwap(leagueId, draftId, playerAId, playerBId) {
      await request(`${base}/api/rounds/leagues/${leagueId}/drafts/${draftId}/swap`, {
        method: "POST",
        json: { playerAId, playerBId },
      });
    },

    async drawTeamsAdaptiveOnServer(leagueId, input) {
      const res = await request(`${base}/api/rounds/leagues/${leagueId}/adaptive-draw`, {
        method: "POST",
        json: input,
      });
      return res.json();
    },
  };
}
