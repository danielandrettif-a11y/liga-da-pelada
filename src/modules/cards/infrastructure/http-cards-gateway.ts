export class CardsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = "CardsApiError";
  }
}

export type CardsHttpGateway = {
  getMyPacks(leagueId: string): Promise<any>;
  restoreMyPassPacks(leagueId: string, fantasySeasonId: string): Promise<any>;
  openPack(leagueId: string, packId: string): Promise<any>;
  claimPackCard(leagueId: string, packId: string, chosenSlug: string): Promise<any>;
  getMyInventory(leagueId: string): Promise<any>;
  getMyInventoryCount(leagueId: string): Promise<any>;
  getActiveCardForRound(leagueId: string, roundId: string): Promise<any>;
  activateCardForRound(
    leagueId: string,
    roundId: string,
    params: {
      userCardId: string;
      cardSlug: string;
      targetPlayerId?: string | null;
      targetPlayer2Id?: string | null;
      targetPrediction?: string | null;
    }
  ): Promise<any>;
  removeActiveCardForRound(leagueId: string, roundId: string): Promise<any>;
  generatePacksForFinishedRound(leagueId: string, roundId: string): Promise<any>;
  giveMyAccountTestPack(leagueId: string): Promise<any>;
  resetMyAccountCards(leagueId: string): Promise<any>;
  distributePackToAllLineupUsers(leagueId: string): Promise<any>;
  auditAndRepairCurrentSeasonPacks(leagueId: string): Promise<any>;
  grantFantasyPackToUser(leagueId: string, targetUserId: string): Promise<any>;
};

export function httpCardsGateway(baseUrl: string, accessToken: string): CardsHttpGateway {
  const cleanBase = baseUrl.replace(/\/+$/, "");

  async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${cleanBase}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    let res: Response;
    try {
      res = await fetch(url, { ...options, headers });
    } catch (err) {
      throw new CardsApiError(`Falha de conexão com a API de cartas: ${(err as Error).message}`, 503);
    }

    if (!res.ok) {
      let errorBody: any = null;
      try {
        errorBody = await res.json();
      } catch {
        // payload não json
      }
      const message = errorBody?.message || `Erro HTTP ${res.status} na API de cartas.`;
      throw new CardsApiError(message, res.status, errorBody?.code);
    }

    return res.json() as Promise<T>;
  }

  return {
    getMyPacks(leagueId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs`);
    },
    restoreMyPassPacks(leagueId, fantasySeasonId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/restore`, {
        method: "POST",
        body: JSON.stringify({ fantasySeasonId }),
      });
    },
    openPack(leagueId, packId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/${encodeURIComponent(packId)}/open`, {
        method: "POST",
      });
    },
    claimPackCard(leagueId, packId, chosenSlug) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/${encodeURIComponent(packId)}/claim`, {
        method: "POST",
        body: JSON.stringify({ chosenSlug }),
      });
    },
    getMyInventory(leagueId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/inventory`);
    },
    getMyInventoryCount(leagueId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/inventory/count`);
    },
    getActiveCardForRound(leagueId, roundId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/active`);
    },
    activateCardForRound(leagueId, roundId, params) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/activate`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    removeActiveCardForRound(leagueId, roundId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/active`, {
        method: "DELETE",
      });
    },
    generatePacksForFinishedRound(leagueId, roundId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/generate-packs`, {
        method: "POST",
      });
    },
    giveMyAccountTestPack(leagueId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/test`, {
        method: "POST",
      });
    },
    resetMyAccountCards(leagueId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/reset`, {
        method: "POST",
      });
    },
    distributePackToAllLineupUsers(leagueId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/distribute`, {
        method: "POST",
      });
    },
    auditAndRepairCurrentSeasonPacks(leagueId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/audit-repair`, {
        method: "POST",
      });
    },
    grantFantasyPackToUser(leagueId, targetUserId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/grant`, {
        method: "POST",
        body: JSON.stringify({ targetUserId }),
      });
    },
  };
}
