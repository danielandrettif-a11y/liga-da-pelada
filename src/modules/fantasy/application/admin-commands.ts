import type { FantasySettings } from "@/lib/fantasy/config";
import { buildFantasySettingsPayload } from "../domain/settings-update";

export type FantasyReprocessMode = "stored" | "current";
export type FantasyTestSessionOperation = "create" | "process" | "reset";

export type FantasyAdminCommandGateway = {
  updateSettings(leagueId: string, payload: Record<string, unknown>): Promise<string | null>;
  findFantasySeasonId(seasonId: string, leagueId: string): Promise<string | null>;
  previewMarket(fantasySeasonId: string): Promise<{ data: unknown; error: string | null }>;
  roundBelongsToLeague(roundId: string, leagueId: string): Promise<boolean>;
  rebuildRoundStats(roundId: string): Promise<{ success: boolean; error?: string }>;
  reprocessRound(roundId: string, mode: FantasyReprocessMode): Promise<{ affectedRounds: number; error: string | null }>;
  repairLegacyLineups(): Promise<{ repaired: number; lineups: unknown[]; error: string | null }>;
  changeTestSession(roundId: string, operation: FantasyTestSessionOperation): Promise<string | null>;
};

export async function updateFantasyConfiguration(
  values: Partial<FantasySettings>,
  league: { id: string; featureTier: string },
  gateway: FantasyAdminCommandGateway,
) {
  const parsed = buildFantasySettingsPayload(values);
  if ("error" in parsed) return { success: false as const, error: parsed.error };
  if (league.featureTier !== "complete") {
    return { success: false as const, error: "O Cartola só pode ser configurado em uma pelada Completa." };
  }
  const error = await gateway.updateSettings(league.id, parsed.payload);
  return error ? { success: false as const, error } : { success: true as const };
}

export async function previewFantasyMarket(
  seasonId: string | null,
  leagueId: string,
  gateway: FantasyAdminCommandGateway,
) {
  if (!seasonId) return { success: false as const, error: "Esta pelada ainda não tem temporada ativa." };
  const fantasySeasonId = await gateway.findFantasySeasonId(seasonId, leagueId);
  if (!fantasySeasonId) return { success: false as const, error: "O Cartola desta pelada ainda não foi iniciado." };
  const result = await gateway.previewMarket(fantasySeasonId);
  if (result.error) return { success: false as const, error: result.error };
  return { success: true as const, preview: result.data };
}

export async function reprocessFantasyRoundForLeague(
  roundId: string,
  leagueId: string,
  mode: FantasyReprocessMode,
  gateway: FantasyAdminCommandGateway,
) {
  if (!roundId || !await gateway.roundBelongsToLeague(roundId, leagueId)) {
    return { success: false as const, error: "Rodada fora da pelada selecionada." };
  }
  const stats = await gateway.rebuildRoundStats(roundId);
  if (!stats.success) {
    const prefix = mode === "current"
      ? "Não foi possível recalcular as estatísticas"
      : "Não foi possível reconstruir os scouts antes do reprocessamento";
    return { success: false as const, error: `${prefix}: ${stats.error || "erro desconhecido"}` };
  }
  const result = await gateway.reprocessRound(roundId, mode);
  if (result.error) return { success: false as const, error: result.error };
  return mode === "current"
    ? { success: true as const, affectedRounds: result.affectedRounds }
    : { success: true as const };
}

export async function repairLegacyFantasyLineups(gateway: FantasyAdminCommandGateway) {
  const result = await gateway.repairLegacyLineups();
  if (result.error) return { success: false as const, error: result.error };
  return { success: true as const, repaired: result.repaired, lineups: result.lineups };
}

export async function changeFantasyTestSession(
  roundId: string,
  leagueId: string,
  operation: FantasyTestSessionOperation,
  gateway: FantasyAdminCommandGateway,
) {
  if (!roundId || !await gateway.roundBelongsToLeague(roundId, leagueId)) {
    return { success: false as const, error: "Rodada fora da pelada selecionada." };
  }
  const error = await gateway.changeTestSession(roundId, operation);
  return error ? { success: false as const, error } : { success: true as const };
}
