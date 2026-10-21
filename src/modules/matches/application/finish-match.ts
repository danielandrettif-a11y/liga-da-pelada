import { calculateMatchFinishTime, type MatchTimerAtFinish } from "../domain/match-finish-time";
import { measureMatchStep } from "@/lib/match-performance";

export type MatchFinishState = MatchTimerAtFinish & {
  roundId: string;
  status: string;
};

export type FinishedMatch = {
  id: string;
  round_id: string;
  score_a: number;
  score_b: number;
  team_a: { name: string } | Array<{ name: string }> | null;
  team_b: { name: string } | Array<{ name: string }> | null;
};

export type FinishMatchGateway<TQuickStart> = {
  loadCurrent(matchId: string): Promise<MatchFinishState>;
  markFinished(matchId: string, elapsedSeconds: number): Promise<FinishedMatch | null>;
  setExitTimes(matchId: string, officialElapsedSeconds: number): Promise<void>;
  deactivateParticipants(matchId: string): Promise<void>;
  buildQuickStart(roundId: string, matchId: string): Promise<TQuickStart>;
};

export type FinishMatchEffects = {
  revalidate(matchId: string, roundId: string): void;
  recalculate(roundId: string): Promise<{ success: boolean; error?: string }>;
  notifyAfterResponse(match: FinishedMatch): void;
};

export async function finishSelectedMatch<TQuickStart>(
  matchId: string,
  gateway: FinishMatchGateway<TQuickStart>,
  effects: FinishMatchEffects,
  nowMs?: number,
): Promise<
  | { success: false; error: string }
  | { success: true; alreadyFinished?: true; roundId: string; quickStart: TQuickStart }
> {
  const currentState = await measureMatchStep("finish_match", "load_match", () => gateway.loadCurrent(matchId));
  const { elapsedSeconds, officialElapsedSeconds } = calculateMatchFinishTime(currentState, nowMs ?? Date.now());
  const finished = await measureMatchStep("finish_match", "mark_finished", () => gateway.markFinished(matchId, elapsedSeconds));

  if (!finished) {
    const existing = await measureMatchStep("finish_match", "reload_finished_match", () => gateway.loadCurrent(matchId));
    if (existing.status !== "finished") {
      return { success: false, error: "Nao foi possivel encerrar a partida." };
    }
    await measureMatchStep("finish_match", "set_exit_times", () => gateway.setExitTimes(matchId, officialElapsedSeconds));
    await measureMatchStep("finish_match", "deactivate_players", () => gateway.deactivateParticipants(matchId));
    const [stats, quickStart] = await Promise.all([
      measureMatchStep("finish_match", "recalculate_stats", () => effects.recalculate(existing.roundId)),
      measureMatchStep("finish_match", "prepare_next_match", () => gateway.buildQuickStart(existing.roundId, matchId)),
    ]);
    if (!stats.success) throw new Error(stats.error || "Erro ao recalcular estatisticas.");
    return { success: true, alreadyFinished: true, roundId: existing.roundId, quickStart };
  }

  // O trigger pode desativar participantes ao marcar a partida como encerrada.
  // O tempo final é gravado sem filtrar por is_active, como no fluxo anterior.
  await measureMatchStep("finish_match", "set_exit_times", () => gateway.setExitTimes(matchId, officialElapsedSeconds));
  effects.revalidate(matchId, finished.round_id);
  await measureMatchStep("finish_match", "deactivate_players", () => gateway.deactivateParticipants(matchId));
  const [stats, quickStart] = await Promise.all([
    measureMatchStep("finish_match", "recalculate_stats", () => effects.recalculate(finished.round_id)),
    measureMatchStep("finish_match", "prepare_next_match", () => gateway.buildQuickStart(finished.round_id, matchId)),
  ]);
  if (!stats.success) throw new Error(stats.error || "Erro ao recalcular estatisticas.");
  effects.notifyAfterResponse(finished);
  return { success: true, roundId: finished.round_id, quickStart };
}
