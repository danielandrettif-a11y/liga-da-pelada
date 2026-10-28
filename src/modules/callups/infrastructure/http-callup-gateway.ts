import type { CallupWithEntries } from "@/lib/actions/callups";

type ApiErrorPayload = { message?: unknown };

export class CallupApiError extends Error {
  constructor(message: string, public readonly statusCode: number | null = null) {
    super(message);
    this.name = "CallupApiError";
  }
}

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
  ): Promise<void>;
  closeCallup(leagueId: string, callupId: string): Promise<void>;
  setVisibility(leagueId: string, callupId: string, isPublic: boolean): Promise<void>;
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
  createPrelist(leagueId: string, callupId: string): Promise<{ roundId: string }>;
  repairMyPlayer(): Promise<{ playerId?: string }>;
};

async function parseApiError(response: Response): Promise<never> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  const message = typeof payload?.message === "string" ? payload.message : "Erro na operação da convocação.";
  throw new CallupApiError(message, response.status);
}

export function httpCallupGateway(backendUrl: string, accessToken?: string): CallupHttpGateway {
  const base = backendUrl.replace(/\/+$/, "");

  const authHeaders = (hasBody = false) => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    if (hasBody) headers["content-type"] = "application/json";
    return headers;
  };

  return {
    async listActive(leagueId: string, inviteCallupId?: string): Promise<CallupWithEntries[]> {
      const url = new URL(`${base}/api/callups/leagues/${leagueId}/active`);
      if (inviteCallupId) url.searchParams.set("inviteCallupId", inviteCallupId);
      const res = await fetch(url.toString(), {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async listAgenda(leagueId: string): Promise<AgendaCallupItem[]> {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/agenda`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async openCallup(leagueId, input) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async updateCallup(leagueId, callupId, input) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(input),
      });
      if (!res.ok) await parseApiError(res);
    },

    async closeCallup(leagueId, callupId) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}/close`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
    },

    async setVisibility(leagueId, callupId, isPublic) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}/visibility`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ isPublic }),
      });
      if (!res.ok) await parseApiError(res);
    },

    async lockCallup(leagueId, callupId) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}/lock`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
    },

    async joinCallup(leagueId, callupId) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}/join`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async leaveCallup(leagueId, callupId) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}/leave`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async addPlayer(leagueId, callupId, playerId, asAdmin) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}/players`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ playerId, asAdmin }),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async removePlayer(leagueId, callupId, playerId, asAdmin) {
      const url = new URL(`${base}/api/callups/leagues/${leagueId}/${callupId}/players/${playerId}`);
      if (asAdmin) url.searchParams.set("asAdmin", "true");
      const res = await fetch(url.toString(), {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async inviteGuest(leagueId, callupId, guest) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}/guests`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(guest),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async inviteGuestList(leagueId, callupId, guests, playerProfile) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}/guest-list`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ guests, playerProfile }),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async createPrelist(leagueId, callupId) {
      const res = await fetch(`${base}/api/callups/leagues/${leagueId}/${callupId}/prelist`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },

    async repairMyPlayer() {
      const res = await fetch(`${base}/api/callups/repair-player`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) await parseApiError(res);
      return res.json();
    },
  };
}
