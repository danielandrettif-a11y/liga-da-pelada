import { ApiError } from "@/modules/shared/domain/api-error";
import { apiClient } from "@/modules/shared/infrastructure/api-client";
import type { CallupWithEntries } from "@/lib/actions/callups";

export class CallupApiError extends ApiError {}

export type CallupInviteResult = {
  playerId: string;
  status: "confirmed" | "waitlist" | "waitlisted";
  position: number;
};

export type CallupGuestListResult = {
  created: number;
  confirmed: number;
  waitlisted: number;
  failed: Array<{ name: string; error: string }>;
  ignoredExisting?: string[];
};

export type AgendaCallupItem = {
  id: string;
  league_id: string;
  date: string;
  start_time: string;
  round_type: "friendly" | "official";
  status: "open" | "locked" | "converted" | "cancelled";
  round_id: string | null;
  created_at: string;
  playersCount: number;
};

export type CallupHttpGateway = {
  listActive(leagueId: string, inviteCallupId?: string): Promise<CallupWithEntries[]>;
  listAgenda(leagueId: string): Promise<AgendaCallupItem[]>;
  openCallup(
    leagueId: string,
    input: {
      date: string;
      startTime?: string | null;
      stadiumId?: string | null;
      roundType?: "friendly" | "official";
      playersPerTeam?: number | null;
      teamsPerRound?: number | null;
      goalsToFinish?: number | null;
      refereeEnabled?: boolean;
    },
  ): Promise<{ callupId: string; roundId: string }>;
  updateCallup(
    leagueId: string,
    callupId: string,
    input: {
      date: string;
      startTime?: string | null;
      stadiumId?: string | null;
      roundType?: "friendly" | "official";
    },
    expectedVersion?: string,
  ): Promise<void>;
  closeCallup(leagueId: string, callupId: string, expectedVersion?: string): Promise<void>;
  setVisibility(leagueId: string, callupId: string, isPublic: boolean, expectedVersion?: string): Promise<void>;
  setMatchRules(leagueId: string, callupId: string, matchDuration: number, goalsToFinish: number, expectedVersion?: string): Promise<void>;
  lockCallup(leagueId: string, callupId: string): Promise<void>;
  joinCallup(
    leagueId: string,
    callupId: string,
  ): Promise<{ status: "confirmed" | "waitlist" | "waitlisted"; position: number }>;
  leaveCallup(leagueId: string, callupId: string): Promise<{ roundId?: string | null }>;
  addPlayer(
    leagueId: string,
    callupId: string,
    playerId: string,
    asAdmin: boolean,
  ): Promise<{ status: "confirmed" | "waitlist" | "waitlisted"; position: number }>;
  addPlayers(leagueId: string, callupId: string, playerIds: string[]): Promise<{ added: number; failures: Array<{ playerId: string; error: string }> }>;
  removePlayer(
    leagueId: string,
    callupId: string,
    playerId: string,
    asAdmin: boolean,
  ): Promise<{ revalidateRoundId?: string | null }>;
  inviteGuest(
    leagueId: string,
    callupId: string,
    guest: { name: string; playerProfile?: string; isGoalkeeper?: boolean },
  ): Promise<CallupInviteResult>;
  inviteGuestList(
    leagueId: string,
    callupId: string,
    guests: Array<{ name: string; isGoalkeeper?: boolean }>,
    playerProfile: string,
  ): Promise<CallupGuestListResult>;
  createPrelist(leagueId: string, callupId: string): Promise<{ roundId: string; created: boolean }>;
  repairMyPlayer(): Promise<{ playerId?: string }>;
};

export function httpCallupGateway(backendUrl: string, accessToken?: string): CallupHttpGateway {
  const base = backendUrl.replace(/\/+$/, "");

  const request = apiClient({ accessToken, fallback: "Erro na operação da convocação.", ErrorClass: CallupApiError });

  return {
    async listActive(leagueId: string, inviteCallupId?: string): Promise<CallupWithEntries[]> {
      const url = new URL(`${base}/api/callups/leagues/${leagueId}/active`);
      if (inviteCallupId) url.searchParams.set("inviteCallupId", inviteCallupId);
      const res = await request(url.toString(), {
        cache: "no-store",
      });
      const callups: Array<Omit<CallupWithEntries, "entries"> & {
        entries: Array<Omit<CallupWithEntries["entries"][number], "status"> & { status: "confirmed" | "waitlist" | "waitlisted" }>;
      }> = await res.json();
      return callups.map((callup) => ({
        ...callup,
        entries: callup.entries.map((entry) => ({
          ...entry,
          status: entry.status === "waitlisted" ? "waitlist" : entry.status,
        })),
      }));
    },

    async listAgenda(leagueId: string): Promise<AgendaCallupItem[]> {
      const res = await request(`${base}/api/callups/leagues/${leagueId}/agenda`, {
        cache: "no-store",
      });
      return res.json();
    },

    async openCallup(leagueId, input) {
      const res = await request(`${base}/api/callups/leagues/${leagueId}`, {
        method: "POST",
        json: input,
      });
      return res.json();
    },

    async updateCallup(leagueId, callupId, input, expectedVersion) {
      await request(`${base}/api/callups/leagues/${leagueId}/${callupId}`, {
        headers: expectedVersion ? { "x-expected-version": expectedVersion } : undefined,
        method: "PATCH",
        json: input,
      });
    },

    async closeCallup(leagueId, callupId, expectedVersion) {
      await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/close`, {
        headers: expectedVersion ? { "x-expected-version": expectedVersion } : undefined,
        method: "POST",
      });
    },

    async setVisibility(leagueId, callupId, isPublic, expectedVersion) {
      await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/visibility`, {
        headers: expectedVersion ? { "x-expected-version": expectedVersion } : undefined,
        method: "PATCH",
        json: { isPublic },
      });
    },

    async setMatchRules(leagueId, callupId, matchDuration, goalsToFinish, expectedVersion) {
      await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/match-rules`, {
        headers: expectedVersion ? { "x-expected-version": expectedVersion } : undefined,
        method: "PUT",
        json: { matchDuration, goalsToFinish },
      });
    },

    async lockCallup(leagueId, callupId) {
      await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/lock`, {
        method: "POST",
      });
    },

    async joinCallup(leagueId, callupId) {
      const res = await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/join`, {
        method: "POST",
      });
      return res.json();
    },

    async leaveCallup(leagueId, callupId) {
      const res = await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/leave`, {
        method: "POST",
      });
      return res.json();
    },

    async addPlayer(leagueId, callupId, playerId, asAdmin) {
      const res = await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/players`, {
        method: "POST",
        json: { playerId, asAdmin },
      });
      return res.json();
    },

    async addPlayers(leagueId, callupId, playerIds) {
      const res = await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/players/batch`, {
        method: "POST",
        json: { playerIds },
      });
      return res.json();
    },

    async removePlayer(leagueId, callupId, playerId, asAdmin) {
      const url = new URL(`${base}/api/callups/leagues/${leagueId}/${callupId}/players/${playerId}`);
      if (asAdmin) url.searchParams.set("asAdmin", "true");
      const res = await request(url.toString(), {
        method: "DELETE",
      });
      return res.json();
    },

    async inviteGuest(leagueId, callupId, guest) {
      const res = await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/guests`, {
        method: "POST",
        json: guest,
      });
      return res.json();
    },

    async inviteGuestList(leagueId, callupId, guests, playerProfile) {
      const res = await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/guest-list`, {
        method: "POST",
        json: { guests, playerProfile },
      });
      return res.json();
    },

    async createPrelist(leagueId, callupId) {
      const res = await request(`${base}/api/callups/leagues/${leagueId}/${callupId}/prelist`, {
        method: "POST",
      });
      return res.json();
    },

    async repairMyPlayer() {
      const res = await request(`${base}/api/callups/repair-player`, {
        method: "POST",
      });
      return res.json();
    },
  };
}
