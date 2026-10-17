export function isCallupRosterComplete(capacity: number, confirmedCount: number): boolean {
  return confirmedCount === capacity;
}
