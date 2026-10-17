import type { CallupFormat } from "../domain/callup-format";

export type CallupFormatGateway = {
  findOpenCallup(callupId: string, leagueId: string): Promise<boolean>;
  setFormat(format: CallupFormat): Promise<{
    fantasySizePreserved: boolean;
    fantasyLineupSize: number;
  }>;
};

export async function changeCallupFormat(
  format: CallupFormat,
  leagueId: string,
  gateway: CallupFormatGateway,
) {
  if (!(await gateway.findOpenCallup(format.callupId, leagueId))) {
    return { success: false as const, error: "Convocação aberta não encontrada nesta pelada." };
  }
  const result = await gateway.setFormat(format);
  return { success: true as const, ...result };
}
