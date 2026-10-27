export type RosterUnreadState = {
  count: number;
  lastSeenAt: string | null;
};

export type UnreadRosterPlayers = {
  playerIds: string[];
  seenThrough: string | null;
};
