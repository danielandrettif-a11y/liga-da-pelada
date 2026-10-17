import { isCallupRosterComplete } from "../domain/callup-management";

export type CallupManagementGateway = {
  close(callupId: string, leagueId: string): Promise<string | null>;
  setVisibility(callupId: string, leagueId: string, isPublic: boolean): Promise<string | null>;
  loadCapacity(callupId: string, leagueId: string): Promise<{ capacity: number | null; error: string | null }>;
  countConfirmed(callupId: string): Promise<{ count: number; error: string | null }>;
  lock(callupId: string, leagueId: string): Promise<string | null>;
};

export type CallupManagementResult = { success: true } | { success: false; error: string };

export async function closeSelectedCallup(
  callupId: string,
  leagueId: string,
  gateway: CallupManagementGateway,
): Promise<CallupManagementResult> {
  const error = await gateway.close(callupId, leagueId);
  return error ? { success: false, error } : { success: true };
}

export async function changeCallupVisibility(
  callupId: string,
  leagueId: string,
  isPublic: boolean,
  gateway: CallupManagementGateway,
): Promise<CallupManagementResult> {
  const error = await gateway.setVisibility(callupId, leagueId, isPublic);
  return error ? { success: false, error } : { success: true };
}

export async function lockSelectedCallup(
  callupId: string,
  leagueId: string,
  gateway: CallupManagementGateway,
): Promise<CallupManagementResult> {
  const { capacity, error: callupError } = await gateway.loadCapacity(callupId, leagueId);
  if (callupError || capacity === null) {
    return { success: false, error: callupError || "Convocacao nao encontrada." };
  }
  const { count, error: entriesError } = await gateway.countConfirmed(callupId);
  if (entriesError) return { success: false, error: entriesError };
  if (!isCallupRosterComplete(capacity, count)) {
    return { success: false, error: `A lista precisa ter ${capacity} confirmados para montar a rodada.` };
  }
  const error = await gateway.lock(callupId, leagueId);
  return error ? { success: false, error } : { success: true };
}
