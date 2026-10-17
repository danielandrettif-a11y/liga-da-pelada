import { resolveOpenCallupFormat, type OpenCallupRequest } from "../domain/open-callup";

export const DUPLICATE_CALLUP_DATE_ERROR = "Já existe uma convocação nesta pelada para essa data. Escolha outro dia.";

export type NewCallupRecord = {
  leagueId: string;
  date: string;
  startTime: string;
  stadiumId: string | null;
  stadiumName: string | null;
  stadiumMapUrl: string | null;
  roundType: "friendly" | "official";
  capacity: number;
  playersPerTeam: number;
  teamsPerRound: number;
};

export type CallupOpeningGateway = {
  existsOnDate(leagueId: string, date: string): Promise<boolean>;
  loadLeagueDefaults(leagueId: string): Promise<{
    playersPerTeam: number | null;
    teamsPerRound: number | null;
    stadiumName: string | null;
    stadiumMapUrl: string | null;
  }>;
  loadStadium(stadiumId: string, leagueId: string): Promise<{ name: string; mapUrl: string | null } | null>;
  insert(record: NewCallupRecord): Promise<
    | { status: "created"; id: string }
    | { status: "duplicate" }
    | { status: "failed"; error: string }
  >;
  remove(callupId: string, leagueId: string): Promise<string | null>;
};

export type PrelistPreparation = (callupId: string) => Promise<{
  success: boolean;
  roundId?: string;
  error?: string;
}>;

export type OpenCallupResult =
  | { success: true; id: string; roundId: string | undefined }
  | { success: false; error: string };

export async function openCallupWithPrelist(
  request: OpenCallupRequest,
  leagueId: string,
  gateway: CallupOpeningGateway,
  preparePrelist: PrelistPreparation,
): Promise<OpenCallupResult> {
  try {
    if (await gateway.existsOnDate(leagueId, request.date)) {
      return { success: false, error: DUPLICATE_CALLUP_DATE_ERROR };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Não foi possível verificar a data." };
  }

  let defaults: Awaited<ReturnType<CallupOpeningGateway["loadLeagueDefaults"]>>;
  try {
    defaults = await gateway.loadLeagueDefaults(leagueId);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Não foi possível carregar a pelada." };
  }

  let stadiumName = defaults.stadiumName;
  let stadiumMapUrl = defaults.stadiumMapUrl;
  if (request.stadiumId) {
    const stadium = await gateway.loadStadium(request.stadiumId, leagueId);
    if (!stadium) return { success: false, error: "Estádio fora da pelada selecionada." };
    stadiumName = stadium.name;
    stadiumMapUrl = stadium.mapUrl;
  }

  const resolved = resolveOpenCallupFormat(request, defaults);
  if ("error" in resolved) return { success: false, error: resolved.error };
  const { format } = resolved;
  const inserted = await gateway.insert({
    leagueId,
    date: request.date,
    startTime: request.startTime,
    stadiumId: request.stadiumId,
    stadiumName,
    stadiumMapUrl,
    roundType: request.roundType,
    ...format,
  });
  if (inserted.status === "duplicate") return { success: false, error: DUPLICATE_CALLUP_DATE_ERROR };
  if (inserted.status === "failed") return { success: false, error: inserted.error };

  let prelist: Awaited<ReturnType<PrelistPreparation>>;
  try {
    prelist = await preparePrelist(inserted.id);
  } catch (error) {
    prelist = { success: false, error: error instanceof Error ? error.message : "Erro ao preparar a pré-lista." };
  }
  if (!prelist.success) {
    const rollbackError = await gateway.remove(inserted.id, leagueId);
    if (rollbackError) {
      return {
        success: false,
        error: `A convocação foi aberta, mas a pré-lista falhou: ${prelist.error || "erro desconhecido"}. Feche a convocação antes de tentar novamente.`,
      };
    }
    return { success: false, error: prelist.error || "Não foi possível preparar a pré-lista." };
  }

  return { success: true, id: inserted.id, roundId: prelist.roundId };
}
