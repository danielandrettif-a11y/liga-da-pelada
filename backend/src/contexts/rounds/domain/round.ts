export type RoundStatus = "draft" | "active" | "finished";
export type RoundType = "official" | "friendly";
export type RoundPreparationStage = "prelist" | "teams_ready" | "in_progress" | "completed";
export type TeamFormationMode = "auto" | "manual" | "balanced" | "draft";

export type RoundPlayerAttendance = "pending" | "present";
export type RoundPlayerAvailability = "available" | "injured";

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
  round_players?: Array<{ count: number }>;
  matches?: Array<{ count: number }>;
};

export type RoundMatchSetup = {
  id: string;
  status: RoundStatus;
  date: string;
  round_type: RoundType;
  teams: Array<{
    id: string;
    name: string;
    color: string;
    crest_url: string | null;
    position: number;
    team_players: Array<{
      player_id: string;
      goalkeeper_order: number | null;
      loan_order?: number | null;
      player: {
        id: string;
        name: string;
        nickname: string | null;
        avatar_url: string | null;
        player_profile: string | null;
        is_goalkeeper: boolean;
        member_category: string;
      };
    }>;
  }>;
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
