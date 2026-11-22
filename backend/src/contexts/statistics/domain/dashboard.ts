export type DashboardVenue = {
  name: string | null;
  mapUrl: string | null;
};

export type DashboardCallupEntry = {
  playerId: string;
  status: "confirmed" | "waitlist";
  position?: string | null;
};

export type DashboardCallup = {
  id: string;
  roundId: string | null;
  date: string;
  startTime: string;
  stadiumName: string | null;
  stadiumMapUrl: string | null;
  roundType: "official" | "friendly";
  capacity: number;
  waitlistCapacity: number;
  confirmed: number;
  waiting: number;
  weather?: unknown;
  entries: DashboardCallupEntry[];
};

export type DashboardRoundSummary = {
  id: string;
  number: number;
  date: string;
  startTime?: string | null;
  stadiumId?: string | null;
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
  status: string;
  roundType: "official" | "friendly";
  confirmedPlayers: number;
};

export type DashboardLiveMatch = {
  id: string;
  scoreA: number;
  scoreB: number;
  status: string;
  timerStartedAt?: string | null;
  timerAccumulatedSeconds?: number;
  round: { id: string; number: number; seasonId: string };
  teamA: { id: string; name: string; position?: number | null; color?: string; crestUrl?: string | null } | null;
  teamB: { id: string; name: string; position?: number | null; color?: string; crestUrl?: string | null } | null;
};

export type DashboardLastRoundMatch = {
  id: string;
  matchOrder: number;
  status: string;
  scoreA: number;
  scoreB: number;
  teamA?: { id: string; name: string; color?: string; crestUrl?: string | null } | null;
  teamB?: { id: string; name: string; color?: string; crestUrl?: string | null } | null;
  events: Array<{
    eventType: string;
    teamId: string;
    playerId?: string | null;
    playerName?: string | null;
    assistPlayerId?: string | null;
    assistPlayerName?: string | null;
  }>;
};

export type DashboardLastRound = {
  id: string;
  number: number;
  date: string;
  status: string;
  roundType: "official" | "friendly";
  matches: DashboardLastRoundMatch[];
  teams: Array<{ id: string; name: string; color?: string; crestUrl?: string | null }>;
};

export type DashboardData = {
  nextRound: DashboardRoundSummary | null;
  nextFriendly: DashboardRoundSummary | null;
  liveMatch: DashboardLiveMatch | null;
  matchDuration: number;
  venue: DashboardVenue;
  nextRoundWeather?: unknown;
  eventDurationMinutes: number;
  preseasonEnabled: boolean;
  activeCallup: DashboardCallup | null;
  activeCallups: DashboardCallup[];
  lastRound: DashboardLastRound | null;
};

export function buildDashboardData(raw: {
  league?: {
    matchDuration?: number;
    preseasonEnabled?: boolean;
    stadiumName?: string | null;
    stadiumMapUrl?: string | null;
    eventDurationMinutes?: number;
  } | null;
  nextRound?: any | null;
  nextFriendly?: any | null;
  liveMatch?: any | null;
  lastRound?: any | null;
  activeCallups?: any[] | null;
}): DashboardData {
  const league = raw.league;
  const matchDuration = Number(league?.matchDuration ?? 7);
  const eventDurationMinutes = Number(league?.eventDurationMinutes ?? 120);
  const preseasonEnabled = Boolean(league?.preseasonEnabled);

  const rawCallups = Array.isArray(raw.activeCallups) ? raw.activeCallups : [];
  const mappedCallups: DashboardCallup[] = rawCallups.map((c: any) => {
    const entries = Array.isArray(c.callup_entries || c.entries)
      ? (c.callup_entries || c.entries).map((e: any) => ({
          playerId: String(e.player_id || e.playerId || ""),
          status: e.status === "waitlist" ? "waitlist" : "confirmed",
          position: e.position || null,
        }))
      : [];
    const confirmed = entries.filter((e: any) => e.status === "confirmed").length;
    const waiting = entries.filter((e: any) => e.status === "waitlist").length;

    return {
      id: String(c.id || ""),
      roundId: c.round?.id || c.roundId || null,
      date: String(c.date || ""),
      startTime: String(c.start_time || c.startTime || "08:00"),
      stadiumName: c.stadium_name || c.stadiumName || league?.stadiumName || null,
      stadiumMapUrl: c.stadium_map_url || c.stadiumMapUrl || league?.stadiumMapUrl || null,
      roundType: c.round_type === "friendly" || c.roundType === "friendly" ? "friendly" : "official",
      capacity: Number(c.capacity || 0),
      waitlistCapacity: Number(c.waitlist_capacity || c.waitlistCapacity || 0),
      confirmed: Number(c.confirmed ?? confirmed),
      waiting: Number(c.waiting ?? waiting),
      weather: c.weather || null,
      entries,
    };
  });

  const nextRound: DashboardRoundSummary | null = raw.nextRound
    ? {
        id: String(raw.nextRound.id || ""),
        number: Number(raw.nextRound.number || 0),
        date: String(raw.nextRound.date || ""),
        startTime: raw.nextRound.start_time || raw.nextRound.startTime || null,
        stadiumId: raw.nextRound.stadium_id || raw.nextRound.stadiumId || null,
        stadiumName: raw.nextRound.stadium_name || raw.nextRound.stadiumName || league?.stadiumName || null,
        stadiumMapUrl: raw.nextRound.stadium_map_url || raw.nextRound.stadiumMapUrl || league?.stadiumMapUrl || null,
        status: String(raw.nextRound.status || "draft"),
        roundType: "official",
        confirmedPlayers: Number(raw.nextRound.confirmedPlayers || raw.nextRound.round_players?.[0]?.count || 0),
      }
    : null;

  const nextFriendly: DashboardRoundSummary | null = raw.nextFriendly
    ? {
        id: String(raw.nextFriendly.id || ""),
        number: Number(raw.nextFriendly.number || 0),
        date: String(raw.nextFriendly.date || ""),
        startTime: raw.nextFriendly.start_time || raw.nextFriendly.startTime || null,
        stadiumId: raw.nextFriendly.stadium_id || raw.nextFriendly.stadiumId || null,
        stadiumName: raw.nextFriendly.stadium_name || raw.nextFriendly.stadiumName || league?.stadiumName || null,
        stadiumMapUrl: raw.nextFriendly.stadium_map_url || raw.nextFriendly.stadiumMapUrl || league?.stadiumMapUrl || null,
        status: String(raw.nextFriendly.status || "draft"),
        roundType: "friendly",
        confirmedPlayers: Number(raw.nextFriendly.confirmedPlayers || raw.nextFriendly.round_players?.[0]?.count || 0),
      }
    : null;

  const liveMatch: DashboardLiveMatch | null = raw.liveMatch
    ? {
        id: String(raw.liveMatch.id || ""),
        scoreA: Number(raw.liveMatch.score_a ?? raw.liveMatch.scoreA ?? 0),
        scoreB: Number(raw.liveMatch.score_b ?? raw.liveMatch.scoreB ?? 0),
        status: String(raw.liveMatch.status || "live"),
        timerStartedAt: raw.liveMatch.timer_started_at || raw.liveMatch.timerStartedAt || null,
        timerAccumulatedSeconds: Number(
          raw.liveMatch.timer_accumulated_seconds ?? raw.liveMatch.timerAccumulatedSeconds ?? 0,
        ),
        round: {
          id: String(raw.liveMatch.round?.id || ""),
          number: Number(raw.liveMatch.round?.number || 0),
          seasonId: String(raw.liveMatch.round?.season_id || raw.liveMatch.round?.seasonId || ""),
        },
        teamA: raw.liveMatch.teamA || raw.liveMatch.team_a || null,
        teamB: raw.liveMatch.teamB || raw.liveMatch.team_b || null,
      }
    : null;

  return {
    nextRound,
    nextFriendly,
    liveMatch,
    matchDuration,
    venue: {
      name: nextRound?.stadiumName || league?.stadiumName || null,
      mapUrl: nextRound?.stadiumMapUrl || league?.stadiumMapUrl || null,
    },
    eventDurationMinutes,
    preseasonEnabled,
    activeCallup: mappedCallups[0] || null,
    activeCallups: mappedCallups,
    lastRound: raw.lastRound || null,
  };
}

