import { getCardBySlug } from "@/lib/fantasy/cards/catalog";

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
      const message = errorBody?.message || errorBody?.error || `Erro HTTP ${res.status} na API de cartas.`;
      throw new CardsApiError(message, res.status, errorBody?.code);
    }

    return res.json() as Promise<T>;
  }

  function cardForSlug(slug: string) {
    const card = getCardBySlug(slug);
    if (!card) throw new CardsApiError("Carta recebida não consta no catálogo deste aplicativo.", 502);
    return card;
  }

  return {
    async getMyPacks(leagueId) {
      const result = await request<any>(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs`);
      return {
        ...result,
        availablePacks: result.availablePacks.map((pack: any) => ({
          ...pack,
          offers: [pack.cardSlugOffer1, pack.cardSlugOffer2].flatMap((slug, index) =>
            slug ? [{ slot: index + 1, card: cardForSlug(slug) }] : []),
        })),
      };
    },
    restoreMyPassPacks(leagueId, fantasySeasonId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/restore`, {
        method: "POST",
        body: JSON.stringify({ fantasySeasonId }),
      });
    },
    async openPack(leagueId, packId) {
      const result = await request<any>(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/${encodeURIComponent(packId)}/open`, {
        method: "POST",
      });
      return { ...result, offers: result.offers?.map((card: { slug: string }) => cardForSlug(card.slug)) };
    },
    async claimPackCard(leagueId, packId, chosenSlug) {
      const result = await request<any>(`/api/cards/leagues/${encodeURIComponent(leagueId)}/packs/${encodeURIComponent(packId)}/claim`, {
        method: "POST",
        body: JSON.stringify({ chosenSlug }),
      });
      return { ...result, chosenCard: result.chosenCard ? cardForSlug(result.chosenCard.slug) : undefined };
    },
    async getMyInventory(leagueId) {
      const result = await request<any>(`/api/cards/leagues/${encodeURIComponent(leagueId)}/inventory`);
      const cards = result.cards.map((card: any) => ({ ...card, icon: cardForSlug(card.slug).icon }));
      const groupedBySlug: Record<string, { count: number; card: ReturnType<typeof cardForSlug>; instances: typeof cards }> = {};
      for (const card of cards) {
        const group = groupedBySlug[card.slug] ||= { count: 0, card: cardForSlug(card.slug), instances: [] };
        if (card.status === "OWNED") group.count += 1;
        group.instances.push(card);
      }
      return { cards, groupedBySlug, availableCount: cards.filter((card: any) => card.status === "OWNED").length };
    },
    getMyInventoryCount(leagueId) {
      return request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/inventory/count`);
    },
    async getActiveCardForRound(leagueId, roundId) {
      const result = await request<any>(`/api/cards/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/active`);
      return result ? { ...result, card: cardForSlug(result.cardSlug) } : null;
    },
    async activateCardForRound(leagueId, roundId, params) {
      try {
        return await request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/activate`, {
          method: "POST",
          body: JSON.stringify(params),
        });
      } catch (error) {
        if (error instanceof CardsApiError && error.status === 400) return { success: false, error: error.message };
        throw error;
      }
    },
    async removeActiveCardForRound(leagueId, roundId) {
      try {
        return await request(`/api/cards/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/active`, { method: "DELETE" });
      } catch (error) {
        if (error instanceof CardsApiError && error.status === 400) return { success: false, error: error.message };
        throw error;
      }
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
