import type { RoundType } from "./types";

export function labelCallupTabs<T extends { round_type: RoundType }>(callups: T[]) {
  let rankedIndex = 0;
  let friendlyIndex = 0;

  return callups.map((callup) => {
    const sequence = callup.round_type === "friendly" ? ++friendlyIndex : ++rankedIndex;
    return {
      ...callup,
      tabLabel: `${callup.round_type === "friendly" ? "Amistoso" : "Ranked"} ${sequence}`,
    };
  });
}

export function isPlayerVisibleInPrelistTab(
  playerId: string,
  selectedPlayerIds: ReadonlySet<string>,
  callupEntryIds: ReadonlySet<string>,
  tab: "available" | "selected",
) {
  if (tab === "selected") return selectedPlayerIds.has(playerId);
  return !selectedPlayerIds.has(playerId) && !callupEntryIds.has(playerId);
}
