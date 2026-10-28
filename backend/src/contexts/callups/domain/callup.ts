export type CallupStatus = "open" | "locked" | "converted" | "cancelled";
export type CallupRoundType = "friendly" | "official";
export type CallupEntryStatus = "confirmed" | "waitlisted";

export type CallupPlayer = {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  player_profile: string;
  is_goalkeeper: boolean;
  member_category: string;
};

export type CallupEntry = {
  id: string;
  callup_id: string;
  player_id: string;
  status: CallupEntryStatus;
  position: number;
  created_at: string;
  joined_by_name: string | null;
  player: CallupPlayer;
};

export type CallupRoundTeam = {
  id: string;
  name: string;
  position?: number | null;
  color: string;
  crest_url?: string | null;
  team_players: Array<{ player_id: string }>;
};

export type CallupLinkedRound = {
  id: string;
  status: string;
  matches?: Array<{ id: string; status: string; started_at: string | null }>;
  teams?: CallupRoundTeam[];
};

export type Callup = {
  id: string;
  league_id: string;
  date: string;
  start_time: string;
  stadium_id: string | null;
  round_type: CallupRoundType;
  status: CallupStatus;
  is_public: boolean;
  players_per_team: number;
  teams_per_round: number;
  capacity: number;
  round_id: string | null;
  created_at: string;
  updated_at?: string;
  entries: CallupEntry[];
  round?: CallupLinkedRound | null;
};

export type AgendaCallup = {
  id: string;
  league_id: string;
  date: string;
  start_time: string;
  round_type: CallupRoundType;
  status: CallupStatus;
  round_id: string | null;
  created_at: string;
  playersCount: number;
};

export type OpenCallupInput = {
  date: string;
  startTime?: string | null;
  stadiumId?: string | null;
  roundType?: CallupRoundType;
  playersPerTeam?: number | null;
  teamsPerRound?: number | null;
};

export type UpdateCallupInput = {
  date: string;
  startTime?: string | null;
  stadiumId?: string | null;
  roundType?: CallupRoundType;
};

export class InvalidCallupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCallupError";
  }
}

export function parseCallupUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new InvalidCallupError(`${label} inválido.`);
  }
  return normalized;
}

export function validateOpenCallupInput(input: OpenCallupInput): {
  date: string;
  startTime: string;
  stadiumId: string | null;
  roundType: CallupRoundType;
  playersPerTeam: number;
  teamsPerRound: number;
  capacity: number;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new InvalidCallupError("Informe uma data válida (AAAA-MM-DD).");
  }
  const startTime = (input.startTime || "08:00").slice(0, 5) || "08:00";
  const stadiumId = input.stadiumId ? parseCallupUuid(input.stadiumId, "Estádio") : null;
  const roundType: CallupRoundType = input.roundType === "friendly" ? "friendly" : "official";
  const playersPerTeam = input.playersPerTeam ?? 6;
  const teamsPerRound = input.teamsPerRound ?? 4;

  if (!Number.isInteger(playersPerTeam) || playersPerTeam < 5 || playersPerTeam > 7) {
    throw new InvalidCallupError("Escolha 5, 6 ou 7 jogadores por time.");
  }
  if (!Number.isInteger(teamsPerRound) || teamsPerRound < 2 || teamsPerRound > 6) {
    throw new InvalidCallupError("Escolha de 2 a 6 times.");
  }

  return {
    date: input.date,
    startTime,
    stadiumId,
    roundType,
    playersPerTeam,
    teamsPerRound,
    capacity: playersPerTeam * teamsPerRound,
  };
}

export function validateUpdateCallupInput(input: UpdateCallupInput): {
  date: string;
  startTime: string;
  stadiumId: string | null;
  roundType: CallupRoundType;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new InvalidCallupError("Informe uma data válida (AAAA-MM-DD).");
  }
  const startTime = (input.startTime || "08:00").slice(0, 5) || "08:00";
  const stadiumId = input.stadiumId ? parseCallupUuid(input.stadiumId, "Estádio") : null;
  const roundType: CallupRoundType = input.roundType === "friendly" ? "friendly" : "official";

  return { date: input.date, startTime, stadiumId, roundType };
}
