import { canCreateCallupPrelist, confirmedCallupPlayerIds, type PrelistCallup } from "../domain/callup-prelist";

export type PrelistGateway = {
  loadCallup(callupId: string, leagueId: string): Promise<{ callup: PrelistCallup | null; error: string | null }>;
  loadLinkedRound(roundId: string): Promise<{
    round: { id: string; status: string; preparationStage: string | null } | null;
    error: string | null;
  }>;
  save(input: {
    leagueId: string;
    callup: PrelistCallup;
    confirmedPlayerIds: string[];
  }): Promise<{ roundId: unknown; error: string | null }>;
};

export type PrelistResult =
  | { success: true; roundId: string; created: boolean }
  | { success: false; error: string };

export async function prepareCallupPrelist(
  callupId: string,
  league: { id: string; featureTier: "quick" | "basic" | "complete" },
  gateway: PrelistGateway,
  scheduleReminders: (input: { roundId: string; date: string; startTime: string }) => Promise<unknown>,
): Promise<PrelistResult> {
  const { callup, error: callupError } = await gateway.loadCallup(callupId, league.id);
  if (callupError || !callup) return { success: false, error: callupError || "Convocacao nao encontrada." };

  if (callup.roundId) {
    const { round, error: linkedRoundError } = await gateway.loadLinkedRound(callup.roundId);
    if (linkedRoundError) return { success: false, error: linkedRoundError };
    if (round?.status === "draft" && round.preparationStage === "prelist") {
      return { success: true, roundId: round.id, created: false };
    }
    return { success: false, error: "Esta convocacao ja foi convertida em rodada." };
  }

  if (!canCreateCallupPrelist(callup)) {
    return { success: false, error: "A convocacao precisa estar aberta para criar a pre-lista." };
  }

  const { roundId, error: saveError } = await gateway.save({
    leagueId: league.id,
    callup,
    confirmedPlayerIds: confirmedCallupPlayerIds(callup),
  });
  if (saveError) return { success: false, error: saveError };

  const savedRoundId = String(roundId);
  if (callup.roundType !== "friendly" && league.featureTier === "complete") {
    try {
      await scheduleReminders({ roundId: savedRoundId, date: callup.date, startTime: callup.startTime || "08:00" });
    } catch (scheduleError) {
      console.error("Pré-lista criada, mas os lembretes do Cartola não foram agendados:", scheduleError);
    }
  }
  return { success: true, roundId: savedRoundId, created: true };
}
