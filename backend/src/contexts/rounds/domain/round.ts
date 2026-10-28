export type RoundStatus = "draft" | "active" | "finished";
export type RoundType = "official" | "friendly";
export type RoundPreparationStage = "prelist" | "teams_ready" | "in_progress" | "completed";
export type TeamFormationMode = "manual" | "random" | "balanced" | "speed" | "adaptive" | "draft";

export type RoundPlayerAttendance = "pending" | "present";
export type RoundPlayerAvailability = "available" | "injured";

export const ROUND_VEST_COLORS = new Set([
  "#22c55e",
  "#f97316",
  "#3b82f6",
  "#ef4444",
  "#eab308",
  "#1e293b",
  "#f8fafc",
  "#ec4899",
]);

export const ROUND_TEAM_CREST_URLS = new Set([
  "/team-crests/meia-boca-juniors.webp",
  "/team-crests/patetico-de-madrid.webp",
  "/team-crests/milamb.webp",
  "/team-crests/inter-de-meiao.webp",
]);

export type RoundPlayer = {
  id: string;
  round_id: string;
  player_id: string;
  availability_status: RoundPlayerAvailability;
  availability_updated_at?: string;
  attendance_status: RoundPlayerAttendance;
  attendance_order: number | null;
  attendance_marked_at: string | null;
};

export type RoundTeamMember = {
  player_id: string;
  goalkeeper_order: number | null;
  loan_order?: number | null;
};

export type RoundTeam = {
  id: string;
  round_id: string;
  name: string;
  color: string;
  crest_url: string | null;
  position: number;
  captain_player_id: string | null;
  team_players: RoundTeamMember[];
};

export type Round = {
  id: string;
  league_id: string;
  season_id: string;
  number: number;
  date: string;
  start_time: string | null;
  status: RoundStatus;
  round_type: RoundType;
  formation_mode: TeamFormationMode;
  target_players_per_team?: number | null;
  target_teams_per_round?: number | null;
  suppress_goalkeeper_rewards?: boolean;
  arrival_order_enabled: boolean;
  preparation_stage: RoundPreparationStage;
  stadium_id?: string | null;
  stadium_name?: string | null;
  stadium_map_url?: string | null;
  notes: string | null;
  payment_pix: string | null;
  payment_total: number | null;
  best_goalkeeper_player_id: string | null;
  created_at: string;
};

export type RoundWithCounts = Round & {
  playersCount: number;
  matchesCount: number;
  round_players?: Array<{ count: number }>;
  matches?: Array<{ count: number }>;
};

export type PlayerReadModel = {
  id: string;
  name: string;
  nickname?: string | null;
  avatar_url?: string | null;
  player_profile?: string | null;
  is_goalkeeper: boolean;
  member_category?: string;
  [key: string]: unknown;
};

export type RoundDetail = Round & {
  round_players: Array<{
    player_id: string;
    availability_status: RoundPlayerAvailability;
    availability_updated_at: string | null;
    attendance_status: RoundPlayerAttendance;
    attendance_order: number | null;
    attendance_marked_at: string | null;
    players: PlayerReadModel;
  }>;
  teams: Array<RoundTeam & {
    captain_player_id: string | null;
    fixed_goalkeeper_player_id: string | null;
    team_players: Array<RoundTeamMember & { players: PlayerReadModel }>;
    [key: string]: unknown;
  }>;
  matches: Array<{
    id: string;
    team_a_id: string;
    team_b_id: string;
    score_a: number;
    score_b: number;
    status: string;
    match_order: number | null;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
    match_events: Array<Record<string, unknown>>;
    match_players: Array<{ player_id: string; team_id: string; original_team_id: string }>;
    match_goalkeepers: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }>;
  callups: Array<{ id: string; status: string }>;
  league: {
    stadium_name: string | null;
    stadium_map_url: string | null;
    event_duration_minutes: number;
    players_per_team: number;
  };
};

export type RoundMatchSetup = {
  id: string;
  league_id: string;
  number: number;
  target_players_per_team: number | null;
  formation_mode: TeamFormationMode;
  arrival_order_enabled: boolean;
  round_players: Array<{
    player_id: string;
    availability_status: RoundPlayerAvailability;
    attendance_status: RoundPlayerAttendance;
  }>;
  teams: Array<{
    id: string;
    name: string;
    color: string;
    crest_url: string | null;
    position: number;
    captain_player_id: string | null;
    fixed_goalkeeper_player_id: string | null;
    team_players: Array<{
      player_id: string;
      goalkeeper_order: number | null;
      loan_order?: number | null;
      players: {
        id: string;
        name: string;
        is_goalkeeper: boolean;
      };
    }>;
  }>;
  matches: Array<{
    id: string;
    team_a_id: string;
    team_b_id: string;
    match_order: number | null;
    started_at: string | null;
    created_at: string;
    match_players: Array<{ player_id: string; team_id: string; original_team_id: string }>;
    match_goalkeepers: Array<{ player_id: string; team_id: string; rotation_order: number | null }>;
  }>;
  league: { players_per_team: number };
};

export class InvalidRoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRoundError";
  }
}

export function parseRoundUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new InvalidRoundError(`${label} inválido.`);
  }
  return normalized;
}

export function validateRoundDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new InvalidRoundError("Informe uma data válida (AAAA-MM-DD).");
  }
  return date;
}

export function validateRoundTime(time: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new InvalidRoundError("Informe um horário válido (HH:MM).");
  }
  return time;
}

export function validateRoundType(value: string): RoundType {
  if (value !== "official" && value !== "friendly") {
    throw new InvalidRoundError("Tipo de rodada inválido.");
  }
  return value;
}

export function validateTeamSizes(playersPerTeam: number, teamsPerRound: number): {
  playersPerTeam: number;
  teamsPerRound: number;
} {
  if (!Number.isInteger(playersPerTeam) || playersPerTeam < 5 || playersPerTeam > 7) {
    throw new InvalidRoundError("Escolha 5, 6 ou 7 jogadores por time.");
  }
  if (!Number.isInteger(teamsPerRound) || teamsPerRound < 2 || teamsPerRound > 6) {
    throw new InvalidRoundError("Escolha de 2 a 6 times.");
  }
  return { playersPerTeam, teamsPerRound };
}

export function validateUnderfilledRoundTeams(
  teamSizes: number[],
  selectedPlayers: number,
  targetPlayersPerTeam: number,
): void {
  if (teamSizes.length < 2 || teamSizes.length > 6) {
    throw new InvalidRoundError("Escolha de 2 a 6 times.");
  }
  const minimumPlayers = teamSizes.length === 3
    ? Math.max(12, targetPlayersPerTeam * 2)
    : targetPlayersPerTeam * 2;
  if (selectedPlayers < minimumPlayers) {
    throw new InvalidRoundError(`Selecione pelo menos ${minimumPlayers} jogadores.`);
  }
  if (selectedPlayers > targetPlayersPerTeam * teamSizes.length) {
    throw new InvalidRoundError(`O modo ${targetPlayersPerTeam}x${targetPlayersPerTeam} aceita no máximo ${targetPlayersPerTeam * teamSizes.length} jogadores.`);
  }
  if (teamSizes.some((size) => size > targetPlayersPerTeam)) {
    throw new InvalidRoundError(`Cada time pode ter no máximo ${targetPlayersPerTeam} jogadores neste modo.`);
  }
  if (teamSizes.reduce((total, size) => total + size, 0) !== selectedPlayers) {
    throw new InvalidRoundError("Todos os jogadores selecionados precisam estar em um time.");
  }
  if (Math.max(...teamSizes) - Math.min(...teamSizes) > 1) {
    throw new InvalidRoundError("Distribua os jogadores igualmente: a diferença entre os times pode ser de no máximo 1 jogador.");
  }
}

export function drawRoundPlayerOrder(playerIds: string[], random: () => number = Math.random) {
  const shuffled = [...playerIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const raw = random();
    const safe = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.9999999999999999) : 0;
    const target = Math.floor(safe * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled.map((playerId, index) => ({ playerId, order: index + 1 }));
}
