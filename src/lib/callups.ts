export type CallupPlacement = "confirmed" | "waitlist" | "full";

export function getCallupPlacement(
  confirmed: number,
  waitlist: number,
  capacity = 15,
  waitlistCapacity = 3,
): CallupPlacement {
  if (confirmed < capacity) return "confirmed";
  if (waitlist < waitlistCapacity) return "waitlist";
  return "full";
}

