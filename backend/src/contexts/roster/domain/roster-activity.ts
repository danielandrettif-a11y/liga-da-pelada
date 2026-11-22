export type RosterUnreadState = {
  count: number;
  lastSeenAt: string | null;
};

export type UnreadRosterEvent = {
  playerId: string;
  createdAt: string;
};

export type UnreadRosterPlayers = {
  playerIds: string[];
  seenThrough: string | null;
};

export class InvalidRosterActivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRosterActivityError";
  }
}

export function parseRosterActivityUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new InvalidRosterActivityError(`${label} inválida.`);
  }
  return normalized;
}

export function normalizeSeenThrough(value: string, now: Date = new Date()): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new InvalidRosterActivityError("Data de leitura inválida.");
  return new Date(Math.min(parsed.getTime(), now.getTime())).toISOString();
}

export function unreadPlayersFromEvents(events: readonly UnreadRosterEvent[]): UnreadRosterPlayers {
  return {
    playerIds: [...new Set(events.map((event) => event.playerId))],
    seenThrough: events.at(-1)?.createdAt ?? null,
  };
}
