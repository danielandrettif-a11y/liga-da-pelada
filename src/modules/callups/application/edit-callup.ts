import type { EditCallupRequest } from "../domain/edit-callup";
import { DUPLICATE_CALLUP_DATE_ERROR } from "./open-callup";

export type EditedCallupRecord = EditCallupRequest & {
  leagueId: string;
  stadiumName: string | null;
  stadiumMapUrl: string | null;
};

export type CallupEditingGateway = {
  existsOnDate(leagueId: string, date: string, excludedCallupId: string): Promise<boolean>;
  loadStadium(stadiumId: string, leagueId: string): Promise<{ name: string; mapUrl: string | null } | null>;
  loadLeagueVenue(leagueId: string): Promise<{ name: string | null; mapUrl: string | null }>;
  updateCallup(record: EditedCallupRecord): Promise<{ code?: string; message: string } | null>;
  loadLinkedRoundId(callupId: string, leagueId: string): Promise<string | null>;
  syncDraftRound(roundId: string, record: EditedCallupRecord): Promise<void>;
};

export async function editCallup(
  request: EditCallupRequest,
  leagueId: string,
  gateway: CallupEditingGateway,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (await gateway.existsOnDate(leagueId, request.date, request.callupId)) {
      return { success: false, error: DUPLICATE_CALLUP_DATE_ERROR };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Não foi possível verificar a data." };
  }

  let stadiumName: string | null;
  let stadiumMapUrl: string | null;
  if (request.stadiumId) {
    const stadium = await gateway.loadStadium(request.stadiumId, leagueId);
    if (!stadium) return { success: false, error: "Estádio fora da pelada selecionada." };
    stadiumName = stadium.name;
    stadiumMapUrl = stadium.mapUrl;
  } else {
    const venue = await gateway.loadLeagueVenue(leagueId);
    stadiumName = venue.name;
    stadiumMapUrl = venue.mapUrl;
  }

  const record: EditedCallupRecord = { ...request, leagueId, stadiumName, stadiumMapUrl };
  const updateError = await gateway.updateCallup(record);
  if (updateError) {
    return { success: false, error: updateError.code === "23505" ? DUPLICATE_CALLUP_DATE_ERROR : updateError.message };
  }

  const roundId = await gateway.loadLinkedRoundId(request.callupId, leagueId);
  if (roundId) await gateway.syncDraftRound(roundId, record);
  return { success: true };
}
