type LinkedRound = {
  date?: string | null;
  start_time?: string | null;
  number?: number | null;
  callups?: Array<{ status?: string | null }> | null;
};

type FantasyRoundCandidate = {
  market_status?: string | null;
  round?: LinkedRound | LinkedRound[] | null;
};

function linkedRound(candidate: FantasyRoundCandidate): LinkedRound | null {
  return Array.isArray(candidate.round) ? candidate.round[0] || null : candidate.round || null;
}

function saoPauloDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Rodada em jogo vence; depois, a próxima convocação por data/hora. */
export function compareFantasyRoundPriority(
  a: FantasyRoundCandidate,
  b: FantasyRoundCandidate,
  now = new Date(),
) {
  const today = saoPauloDate(now);
  const info = (candidate: FantasyRoundCandidate) => {
    const round = linkedRound(candidate);
    const date = round?.date || "";
    const schedule = `${date}T${(round?.start_time || "08:00").slice(0, 5)}`;
    const hasActiveCallup = round?.callups?.some((callup) => callup.status !== "closed") || false;
    const group = candidate.market_status === "in_progress" ? 0
      : candidate.market_status === "open" && date >= today && hasActiveCallup ? 1
      : candidate.market_status === "open" && date >= today ? 2
      : candidate.market_status === "open" && hasActiveCallup ? 3
      : candidate.market_status === "open" ? 4 : 5;
    return { group, schedule, number: round?.number || 0 };
  };
  const left = info(a);
  const right = info(b);
  if (left.group !== right.group) return left.group - right.group;
  const scheduleOrder = left.group === 1 || left.group === 2
    ? left.schedule.localeCompare(right.schedule)
    : right.schedule.localeCompare(left.schedule);
  return scheduleOrder || (left.group === 1 || left.group === 2 ? left.number - right.number : right.number - left.number);
}
