import type { RegisterGoalInput } from "@/lib/types";
import type { RegisterGoalGateway, SavedGoal } from "../application/register-live-goal";
import { GoalWriteError } from "./supabase-goal-gateway";

type ApiError = { message?: unknown };

function goalUrl(baseUrl: string, matchId: string): URL {
  try {
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("Protocolo inválido");
    return new URL(`api/matches/${encodeURIComponent(matchId)}/goals`, base);
  } catch {
    throw new GoalWriteError("Endereço da API de gols inválido.", false);
  }
}

export function httpGoalGateway(
  baseUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): RegisterGoalGateway {
  return {
    async saveGoal(input: RegisterGoalInput): Promise<SavedGoal> {
      const url = goalUrl(baseUrl, input.match_id);
      let response: Response;
      try {
        response = await fetcher(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            player_id: input.player_id,
            team_id: input.team_id,
            assist_player_id: input.assist_player_id ?? null,
            minute: input.minute,
            idempotency_key: input.idempotency_key,
            is_own_goal: Boolean(input.is_own_goal),
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new GoalWriteError("Sem confirmação do gol. Repita o mesmo lance.", true);
      }

      if (!response.ok) {
        const payload: ApiError | null = await response.json().catch(() => null);
        const message = typeof payload?.message === "string"
          ? payload.message : "Não foi possível registrar o gol.";
        throw new GoalWriteError(message, response.status >= 500 || response.status === 408 || response.status === 429);
      }

      let receipt: SavedGoal;
      try {
        receipt = await response.json() as SavedGoal;
      } catch {
        throw new GoalWriteError("Resposta do gol inválida. Repita o mesmo lance.", true);
      }
      if (!receipt?.event_id || !receipt.round_id
        || !Number.isInteger(receipt.score_a) || !Number.isInteger(receipt.score_b)) {
        throw new GoalWriteError("Resposta do gol inválida. Repita o mesmo lance.", true);
      }
      return receipt;
    },
  };
}
