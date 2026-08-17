// ============================================
// Liga da Pelada — Database Types
// Tipos TypeScript baseados no schema PostgreSQL
// ============================================

// ============================================
// Tipos base das tabelas
// ============================================

export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
};

export type PlayerProfile = 'offensive' | 'midfield' | 'defensive';
export type MemberCategory = 'player' | 'guest' | 'wag' | 'supporter';
export type RoundType = 'official' | 'friendly';
export type TeamFormationMode = 'manual' | 'random' | 'balanced';
export type CallupStatus = 'open' | 'locked' | 'converted' | 'closed';
export type CallupEntryStatus = 'confirmed' | 'waitlist';
export type RegistrationSource = 'legacy' | 'site_signup' | 'admin';
export type RoundPreparationStage = 'prelist' | 'teams_ready';
export type FantasyMarketStatus = 'open' | 'in_progress' | 'finished';
export type FantasyLineupStatus = 'draft' | 'locked' | 'missed' | 'scored' | 'needs_review';
export type FantasyChallengeType = 'REI_DAS_VITORIAS' | 'MITO_DA_RODADA' | 'APOSTA_DA_RODADA' | 'VAI_GUARDAR';

export type FantasyLineupPlayer = {
  id: string;
  lineup_id: string;
  player_id: string;
  price_locked: number;
  price_after: number | null;
  base_points: number;
  captain_bonus: number;
  total_points: number;
  player_name_locked?: string | null;
  avatar_url_locked?: string | null;
};

export type FantasyLineup = {
  id: string;
  fantasy_round_id: string;
  user_id: string;
  status: FantasyLineupStatus;
  captain_player_id: string | null;
  challenge_player_id?: string | null;
  challenge_snapshot?: Record<string, unknown>;
  predictions_snapshot?: Record<string, unknown>;
  score_breakdown?: Record<string, unknown>;
  budget_before: number;
  lineup_cost: number;
  cash_remaining: number;
  budget_after: number | null;
  total_points: number;
  fantasy_lineup_players?: FantasyLineupPlayer[];
};

export type Player = {
  id: string;
  name: string;
  nickname: string | null;
  profile_bio: string | null;
  avatar_url: string | null;
  player_profile: PlayerProfile | null;
  is_goalkeeper: boolean;
  member_category: MemberCategory;
  is_selectable: boolean;
  show_fitness_stats: boolean;
  registration_source: RegistrationSource;
  created_by_user_id: string | null;
  created_at: string;
};

export type PlayerRegistrationEvent = {
  id: number;
  player_id: string | null;
  player_name: string;
  avatar_url: string | null;
  member_category: MemberCategory;
  source: RegistrationSource;
  created_by_user_id: string | null;
  created_at: string;
};

export type RosterUnreadState = {
  count: number;
  lastSeenAt: string | null;
};

export type Stadium = {
  id: string;
  league_id: string;
  name: string;
  address: string | null;
  google_maps_url: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type League = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  is_active: boolean;
  match_duration: number;
  players_per_team: number;
  teams_per_round: number;
  stadium_name: string | null;
  stadium_map_url: string | null;
  event_duration_minutes: number;
  created_at: string;
};

export type LeagueMember = {
  id: string;
  league_id: string;
  player_id: string;
  role: 'admin' | 'player';
  is_active: boolean;
  joined_at: string;
};

export type RankingRule = {
  id: string;
  league_id: string;
  event_type: EventType;
  points: number;
};

export type EventType = 'goal' | 'assist' | 'win' | 'draw' | 'loss' | 'best_goalkeeper';

export type RoundStatus = 'draft' | 'active' | 'finished';

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

export type Callup = {
  id: string;
  league_id: string;
  date: string;
  start_time?: string | null;
  round_type: RoundType;
  status: CallupStatus;
  capacity: number;
  waitlist_capacity: number;
  stadium_id?: string | null;
  stadium_name?: string | null;
  stadium_map_url?: string | null;
  round_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CallupEntry = {
  id: string;
  callup_id: string;
  player_id: string;
  status: CallupEntryStatus;
  position: number;
  joined_by: string | null;
  created_at: string;
};

export type PlayerRoundFitness = {
  id: string;
  player_id: string;
  round_id: string;
  distance_km: number;
  average_speed_kmh: number;
  created_at: string;
  updated_at: string;
};

export type AccountProfile = {
  user_id: string;
  role: 'admin' | 'player';
  player_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RoundPayment = {
  id: string;
  round_id: string;
  player_id: string;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
};

export type RoundPaymentAudit = {
  id: number;
  round_id: string;
  target_player_id: string | null;
  target_player_name: string;
  paid: boolean;
  changed_by_user_id: string | null;
  changed_by_player_id: string | null;
  changed_by_name: string;
  created_at: string;
};

export type SeasonStatus = 'active' | 'finished';

export type Season = {
  id: string;
  league_id: string;
  number: number;
  status: SeasonStatus;
  started_at: string;
  ended_at: string | null;
  stats_snapshot: SeasonSummary | null;
  created_at: string;
};

export type SeasonPlayerSummary = {
  id: string;
  name: string;
  nickname: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  points: number;
};

export type SeasonSummary = {
  seasonId: string;
  seasonNumber: number;
  leagueName: string;
  startedAt: string;
  endedAt: string;
  roundCount: number;
  matchCount: number;
  goalCount: number;
  playerCount: number;
  ranking: SeasonPlayerSummary[];
};

export type RoundPlayer = {
  id: string;
  round_id: string;
  player_id: string;
  availability_status: 'available' | 'injured';
  availability_updated_at: string;
  attendance_status: 'pending' | 'present';
  attendance_order: number | null;
  attendance_marked_at: string | null;
};

export type PushSubscriptionRecord = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

export type Team = {
  id: string;
  round_id: string;
  name: string;
  color: string;
  crest_url: string | null;
  position: number;
  captain_player_id: string | null;
};

export type TeamPlayer = {
  id: string;
  team_id: string;
  player_id: string;
  goalkeeper_order: number | null;
};

export type MatchStatus = 'pending' | 'live' | 'finished';

export type Match = {
  id: string;
  round_id: string;
  team_a_id: string;
  team_b_id: string;
  score_a: number;
  score_b: number;
  status: MatchStatus;
  match_order: number | null;
  started_at: string | null;
  finished_at: string | null;
  timer_started_at: string | null;
  timer_accumulated_seconds: number;
  eligibility_elapsed_offset_seconds: number;
  duration_seconds: number;
  created_at: string;
};

export type MatchPlayer = {
  id: string;
  match_id: string;
  player_id: string;
  team_id: string;
  original_team_id: string;
  is_starter: boolean;
  is_active: boolean;
  result_eligible: boolean;
  entered_elapsed_seconds: number;
  left_elapsed_seconds: number | null;
  created_at: string;
};

export type MatchSubstitutionReason = 'tired' | 'injury' | 'other';

export type MatchSubstitution = {
  id: string;
  match_id: string;
  team_id: string;
  player_out_id: string;
  player_in_id: string | null;
  player_in_original_team_id: string | null;
  reason: MatchSubstitutionReason;
  marked_injured: boolean;
  elapsed_seconds: number;
  created_by: string | null;
  created_at: string;
};

export type MatchEventType = 'goal';

export type MatchEvent = {
  id: string;
  match_id: string;
  event_type: MatchEventType;
  player_id: string;
  assist_player_id: string | null;
  team_id: string;
  minute: number | null;
  created_at: string;
};

export type PlayerRoundStats = {
  id: string;
  player_id: string;
  round_id: string;
  league_id: string;
  games: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
};

// ============================================
// Tipos derivados / compostos (para queries com joins)
// ============================================

/** Jogador com stats acumuladas (para ranking e lista de jogadores) */
export type PlayerWithStats = Player & {
  total_games: number;
  total_goals: number;
  total_assists: number;
  total_wins: number;
  total_draws: number;
  total_losses: number;
  total_points: number;
  win_rate: number; // aproveitamento em %
};

/** Jogador com stats de uma rodada específica */
export type PlayerRoundDetail = Player & {
  round_stats: PlayerRoundStats;
};

/** Time com seus jogadores */
export type TeamWithPlayers = Team & {
  players: Player[];
};

/** Partida com dados dos times */
export type MatchWithTeams = Match & {
  team_a: TeamWithPlayers;
  team_b: TeamWithPlayers;
  events: MatchEventWithPlayers[];
};

/** Evento com dados do jogador */
export type MatchEventWithPlayers = MatchEvent & {
  player: Player;
  assist_player: Player | null;
};

/** Rodada completa com times, partidas e stats */
export type RoundDetail = Round & {
  teams: TeamWithPlayers[];
  matches: MatchWithTeams[];
  player_stats: PlayerRoundStats[];
};

/** Membro da liga com dados do jogador */
export type LeagueMemberWithPlayer = LeagueMember & {
  player: Player;
};

/** Liga com contagem de membros */
export type LeagueWithCount = League & {
  member_count: number;
};

// ============================================
// Tipos para formulários / inputs
// ============================================

export type CreatePlayerInput = {
  name: string;
  nickname?: string;
  profile_bio?: string;
  avatar_url?: string;
  player_profile?: PlayerProfile;
  is_goalkeeper?: boolean;
  member_category?: MemberCategory;
  is_selectable?: boolean;
};

export type CreateRoundInput = {
  league_id: string;
  date: string;
  notes?: string;
  round_type?: RoundType;
  formation_mode?: TeamFormationMode;
};

export type CreateTeamInput = {
  round_id: string;
  name: string;
  color: string;
  player_ids: string[];
};

export type CreateMatchInput = {
  round_id: string;
  team_a_id: string;
  team_b_id: string;
  match_order?: number;
  replacements?: Array<{
    team_id: string;
    absent_player_id: string;
    replacement_player_id: string;
  }>;
};

export type SubstituteMatchPlayerInput = {
  match_id: string;
  team_id: string;
  player_out_id: string;
  player_in_id?: string;
  reason: MatchSubstitutionReason;
  mark_injured?: boolean;
};

export type RegisterGoalInput = {
  match_id: string;
  player_id: string;
  assist_player_id?: string;
  team_id: string;
  minute?: number;
  idempotency_key?: string;
};

export type UpdateRankingRulesInput = {
  league_id: string;
  rules: {
    event_type: EventType;
    points: number;
  }[];
};

// ============================================
// Tipo do Supabase Database (para tipagem do client)
// ============================================

export type Database = {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<User, 'id'>>;
      };
      players: {
        Row: Player;
        Insert: Omit<Player, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<Player, 'id'>>;
      };
      leagues: {
        Row: League;
        Insert: Omit<League, 'id' | 'created_at' | 'is_active' | 'match_duration' | 'players_per_team' | 'teams_per_round' | 'stadium_name' | 'stadium_map_url' | 'event_duration_minutes'> & { id?: string; created_at?: string; is_active?: boolean; match_duration?: number; players_per_team?: number; teams_per_round?: number; stadium_name?: string | null; stadium_map_url?: string | null; event_duration_minutes?: number };
        Update: Partial<Omit<League, 'id'>>;
      };
      league_members: {
        Row: LeagueMember;
        Insert: Omit<LeagueMember, 'id' | 'joined_at' | 'is_active' | 'role'> & { id?: string; joined_at?: string; is_active?: boolean; role?: 'admin' | 'player' };
        Update: Partial<Omit<LeagueMember, 'id'>>;
      };
      ranking_rules: {
        Row: RankingRule;
        Insert: Omit<RankingRule, 'id'> & { id?: string };
        Update: Partial<Omit<RankingRule, 'id'>>;
      };
      rounds: {
        Row: Round;
        Insert: Omit<Round, 'id' | 'created_at' | 'status' | 'formation_mode' | 'preparation_stage' | 'payment_pix' | 'payment_total' | 'best_goalkeeper_player_id'> & { id?: string; created_at?: string; status?: RoundStatus; formation_mode?: TeamFormationMode; preparation_stage?: RoundPreparationStage; payment_pix?: string | null; payment_total?: number | null; best_goalkeeper_player_id?: string | null };
        Update: Partial<Omit<Round, 'id'>>;
      };
      callups: {
        Row: Callup;
        Insert: Omit<Callup, 'id' | 'created_at' | 'updated_at' | 'status' | 'capacity' | 'waitlist_capacity' | 'round_id' | 'created_by'> & { id?: string; created_at?: string; updated_at?: string; status?: CallupStatus; capacity?: number; waitlist_capacity?: number; round_id?: string | null; created_by?: string | null };
        Update: Partial<Omit<Callup, 'id'>>;
      };
      callup_entries: {
        Row: CallupEntry;
        Insert: Omit<CallupEntry, 'id' | 'created_at' | 'joined_by'> & { id?: string; created_at?: string; joined_by?: string | null };
        Update: Partial<Omit<CallupEntry, 'id'>>;
      };
      player_round_fitness: {
        Row: PlayerRoundFitness;
        Insert: Omit<PlayerRoundFitness, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<PlayerRoundFitness, 'id'>>;
      };
      account_profiles: {
        Row: AccountProfile;
        Insert: Omit<AccountProfile, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string };
        Update: Partial<Omit<AccountProfile, 'user_id'>>;
      };
      seasons: {
        Row: Season;
        Insert: Omit<Season, 'id' | 'created_at' | 'status' | 'started_at' | 'ended_at' | 'stats_snapshot'> & { id?: string; created_at?: string; status?: SeasonStatus; started_at?: string; ended_at?: string | null; stats_snapshot?: SeasonSummary | null };
        Update: Partial<Omit<Season, 'id'>>;
      };
      round_players: {
        Row: RoundPlayer;
        Insert: Omit<RoundPlayer, 'id' | 'availability_status' | 'availability_updated_at' | 'attendance_status' | 'attendance_order' | 'attendance_marked_at'> & { id?: string; availability_status?: RoundPlayer['availability_status']; availability_updated_at?: string; attendance_status?: RoundPlayer['attendance_status']; attendance_order?: number | null; attendance_marked_at?: string | null };
        Update: Partial<Omit<RoundPlayer, 'id'>>;
      };
      push_subscriptions: {
        Row: PushSubscriptionRecord;
        Insert: Omit<PushSubscriptionRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<PushSubscriptionRecord, 'id' | 'user_id'>>;
      };
      round_payments: {
        Row: RoundPayment;
        Insert: Omit<RoundPayment, 'id' | 'created_at' | 'paid' | 'paid_at'> & { id?: string; created_at?: string; paid?: boolean; paid_at?: string | null };
        Update: Partial<Omit<RoundPayment, 'id'>>;
      };
      round_payment_audit: {
        Row: RoundPaymentAudit;
        Insert: Omit<RoundPaymentAudit, 'id' | 'created_at'> & { id?: number; created_at?: string };
        Update: never;
      };
      teams: {
        Row: Team;
        Insert: Omit<Team, 'id' | 'position' | 'captain_player_id'> & { id?: string; position?: number; captain_player_id?: string | null };
        Update: Partial<Omit<Team, 'id'>>;
      };
      team_players: {
        Row: TeamPlayer;
        Insert: Omit<TeamPlayer, 'id'> & { id?: string };
        Update: Partial<Omit<TeamPlayer, 'id'>>;
      };
      matches: {
        Row: Match;
        Insert: Omit<Match, 'id' | 'created_at' | 'score_a' | 'score_b' | 'status' | 'timer_started_at' | 'timer_accumulated_seconds' | 'eligibility_elapsed_offset_seconds' | 'duration_seconds'> & { id?: string; created_at?: string; score_a?: number; score_b?: number; status?: MatchStatus; timer_started_at?: string | null; timer_accumulated_seconds?: number; eligibility_elapsed_offset_seconds?: number; duration_seconds?: number };
        Update: Partial<Omit<Match, 'id'>>;
      };
      match_players: {
        Row: MatchPlayer;
        Insert: Omit<MatchPlayer, 'id' | 'created_at' | 'is_starter' | 'is_active' | 'result_eligible' | 'entered_elapsed_seconds' | 'left_elapsed_seconds'> & { id?: string; created_at?: string; is_starter?: boolean; is_active?: boolean; result_eligible?: boolean; entered_elapsed_seconds?: number; left_elapsed_seconds?: number | null };
        Update: Partial<Omit<MatchPlayer, 'id'>>;
      };
      match_substitutions: {
        Row: MatchSubstitution;
        Insert: Omit<MatchSubstitution, 'id' | 'created_at' | 'created_by'> & { id?: string; created_at?: string; created_by?: string | null };
        Update: Partial<Omit<MatchSubstitution, 'id'>>;
      };
      match_events: {
        Row: MatchEvent;
        Insert: Omit<MatchEvent, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<MatchEvent, 'id'>>;
      };
      player_round_stats: {
        Row: PlayerRoundStats;
        Insert: Omit<PlayerRoundStats, 'id' | 'games' | 'goals' | 'assists' | 'wins' | 'draws' | 'losses' | 'points'> & { id?: string; games?: number; goals?: number; assists?: number; wins?: number; draws?: number; losses?: number; points?: number };
        Update: Partial<Omit<PlayerRoundStats, 'id'>>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      manage_account_admin_role: {
        Args: { p_target_user_id: string; p_make_admin: boolean };
        Returns: "admin" | "player";
      };
      join_callup: {
        Args: { p_callup_id: string };
        Returns: CallupEntry;
      };
      leave_callup: {
        Args: { p_callup_id: string };
        Returns: boolean;
      };
      admin_add_callup_player: {
        Args: { p_callup_id: string; p_player_id: string };
        Returns: CallupEntry;
      };
      admin_remove_callup_player: {
        Args: { p_callup_id: string; p_player_id: string };
        Returns: boolean;
      };
      substitute_match_player: {
        Args: {
          p_match_id: string;
          p_team_id: string;
          p_player_out_id: string;
          p_player_in_id?: string | null;
          p_reason?: MatchSubstitutionReason;
          p_mark_injured?: boolean;
        };
        Returns: string;
      };
      undo_last_match_substitution: {
        Args: { p_substitution_id: string };
        Returns: boolean;
      };
      set_round_player_availability: {
        Args: {
          p_round_id: string;
          p_player_id: string;
          p_status: RoundPlayer['availability_status'];
        };
        Returns: boolean;
      };
      set_round_player_attendance: {
        Args: { p_round_id: string; p_player_id: string; p_present: boolean };
        Returns: boolean;
      };
      mark_round_team_arrived: {
        Args: { p_round_id: string; p_team_id: string };
        Returns: number;
      };
      swap_round_team_players: {
        Args: { p_round_id: string; p_player_a_id: string; p_player_b_id: string };
        Returns: boolean;
      };
      set_round_team_captain: {
        Args: { p_round_id: string; p_team_id: string; p_player_id: string | null };
        Returns: boolean;
      };
      delete_round_cascade: {
        Args: { p_round_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
};
