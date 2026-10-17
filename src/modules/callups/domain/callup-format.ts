export type CallupFormat = {
  callupId: string;
  playersPerTeam: number;
  teamsPerRound: number;
};

export function parseCallupFormat(
  callupId: string,
  playersPerTeam: number,
  teamsPerRound: number,
): CallupFormat | null {
  if (!callupId || !Number.isInteger(playersPerTeam) || !Number.isInteger(teamsPerRound)) return null;
  if (playersPerTeam < 5 || playersPerTeam > 7 || teamsPerRound < 2 || teamsPerRound > 6) return null;
  return { callupId, playersPerTeam, teamsPerRound };
}
