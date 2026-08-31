export function pickFairSubstitute<T extends { playerId: string }>(
  candidates: T[],
  previousLoanCount: ReadonlyMap<string, number>,
  alreadyPicked: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): T | null {
  const available = candidates.filter((candidate) => !alreadyPicked.has(candidate.playerId));
  if (!available.length) return null;
  const minimumLoans = Math.min(...available.map((candidate) => previousLoanCount.get(candidate.playerId) || 0));
  const fairPool = available.filter((candidate) => (previousLoanCount.get(candidate.playerId) || 0) === minimumLoans);
  const value = random();
  const safeRandom = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999999999) : 0;
  return fairPool[Math.floor(safeRandom * fairPool.length)] || fairPool[0] || null;
}
