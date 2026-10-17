export type PrelistCallup = {
  id: string;
  date: string;
  startTime: string | null;
  stadiumId: string | null;
  stadiumName: string | null;
  stadiumMapUrl: string | null;
  roundType: string;
  status: string;
  roundId: string | null;
  entries: Array<{ playerId: string; status: string }>;
};

export function confirmedCallupPlayerIds(callup: PrelistCallup): string[] {
  return callup.entries.filter((entry) => entry.status === "confirmed").map((entry) => entry.playerId);
}

export function canCreateCallupPrelist(callup: PrelistCallup): boolean {
  return callup.status === "open";
}
