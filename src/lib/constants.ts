// ============================================
// Liga da Pelada — Constantes e Configuração
// ============================================

/** Regras de pontuação padrão (usadas ao criar uma nova liga) */
export const DEFAULT_RANKING_RULES = {
  goal: 3,
  assist: 2,
  win: 2,
  draw: 1,
  loss: 0,
} as const;

/** Cores padrão dos times */
export const TEAM_COLORS = {
  Azul: '#3B82F6',
  Vermelho: '#EF4444',
  Preto: '#1F2937',
  Verde: '#22C55E',
  Amarelo: '#EAB308',
  Branco: '#F8FAFC',
} as const;

/** Nomes dos times disponíveis (ordenados) */
export const TEAM_NAMES = Object.keys(TEAM_COLORS) as (keyof typeof TEAM_COLORS)[];

/** Número padrão de jogadores por time */
export const DEFAULT_PLAYERS_PER_TEAM = 5;
export const MAX_PLAYERS_PER_TEAM = 10;
export const PLAYERS_PER_TEAM = DEFAULT_PLAYERS_PER_TEAM;

/** Número padrão de times por rodada */
export const TEAMS_PER_ROUND = 3;
export const MIN_TEAMS_PER_ROUND = 2;
export const MAX_TEAMS_PER_ROUND = 6;

/** Labels amigáveis para tipos de evento */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  goal: 'Gol',
  assist: 'Assistência',
  win: 'Vitória',
  draw: 'Empate',
  loss: 'Derrota',
};

/** Labels amigáveis para status da rodada */
export const ROUND_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Em Andamento',
  finished: 'Finalizada',
};

/** Labels amigáveis para status da partida */
export const MATCH_STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando',
  live: 'Em Andamento',
  finished: 'Finalizada',
};
