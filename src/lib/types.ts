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

export type Player = {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  player_profile: PlayerProfile;
  created_at: string;
};

export type League = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  is_active: boolean;
  match_duration: number;
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
  status: RoundStatus;
  notes: string | null;
  payment_pix: string | null;
  payment_total: number | null;
  best_goalkeeper_player_id: string | null;
  created_at: string;
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
};

export type TeamPlayer = {
  id: string;
  team_id: string;
  player_id: string;
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
  avatar_url?: string;
  player_profile?: PlayerProfile;
};

export type CreateRoundInput = {
  league_id: string;
  date: string;
  notes?: string;
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
};

export type RegisterGoalInput = {
  match_id: string;
  player_id: string;
  assist_player_id?: string;
  team_id: string;
  minute?: number;
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
        Insert: Omit<League, 'id' | 'created_at' | 'is_active' | 'match_duration'> & { id?: string; created_at?: string; is_active?: boolean; match_duration?: number };
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
        Insert: Omit<Round, 'id' | 'created_at' | 'status' | 'payment_pix' | 'payment_total' | 'best_goalkeeper_player_id'> & { id?: string; created_at?: string; status?: RoundStatus; payment_pix?: string | null; payment_total?: number | null; best_goalkeeper_player_id?: string | null };
        Update: Partial<Omit<Round, 'id'>>;
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
        Insert: Omit<RoundPlayer, 'id'> & { id?: string };
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
      teams: {
        Row: Team;
        Insert: Omit<Team, 'id'> & { id?: string };
        Update: Partial<Omit<Team, 'id'>>;
      };
      team_players: {
        Row: TeamPlayer;
        Insert: Omit<TeamPlayer, 'id'> & { id?: string };
        Update: Partial<Omit<TeamPlayer, 'id'>>;
      };
      matches: {
        Row: Match;
        Insert: Omit<Match, 'id' | 'created_at' | 'score_a' | 'score_b' | 'status'> & { id?: string; created_at?: string; score_a?: number; score_b?: number; status?: MatchStatus };
        Update: Partial<Omit<Match, 'id'>>;
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
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
};
