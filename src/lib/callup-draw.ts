export const MAX_OPEN_SPOTS_FOR_DRAW = 3;

export function getCallupDrawMinimum(capacity: number) {
  const normalizedCapacity = Math.max(0, Math.trunc(capacity));
  return Math.max(2, normalizedCapacity - MAX_OPEN_SPOTS_FOR_DRAW);
}

export function getPlayersMissingForCallupDraw(confirmedPlayers: number, capacity: number) {
  return Math.max(0, getCallupDrawMinimum(capacity) - Math.max(0, Math.trunc(confirmedPlayers)));
}
