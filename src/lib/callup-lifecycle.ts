export type CallupRoundMatchState = {
  status?: string | null;
  started_at?: string | null;
};

export function hasCallupClosingMatch(matches: CallupRoundMatchState[] | null | undefined) {
  return (matches || []).some((match) =>
    Boolean(match.started_at)
      || match.status === "in_progress"
      || match.status === "live"
      || match.status === "finished",
  );
}
