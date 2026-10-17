export type EditCallupRequest = {
  callupId: string;
  date: string;
  startTime: string;
  stadiumId: string | null;
  roundType: "friendly" | "official";
};

export function parseEditCallupRequest(input: {
  callupId: string;
  date: string;
  startTime: string | null;
  stadiumId: string | null;
  roundType: string | null;
}): EditCallupRequest | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return null;
  return {
    callupId: input.callupId,
    date: input.date,
    startTime: (input.startTime || "08:00").slice(0, 5) || "08:00",
    stadiumId: input.stadiumId || null,
    roundType: input.roundType === "friendly" ? "friendly" : "official",
  };
}
