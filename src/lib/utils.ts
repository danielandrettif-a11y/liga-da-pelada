// ============================================
// Liga da Pelada — Funções Utilitárias
// ============================================

/**
 * Retorna as iniciais do nome para usar como avatar fallback.
 * Ex: "Daniel Silva" → "DS", "João" → "JO"
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Formata data ISO para formato brasileiro.
 * Ex: "2026-08-08" → "08/08/2026"
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formata data ISO para formato curto.
 * Ex: "2026-08-08" → "08/08"
 */
export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * Calcula o aproveitamento (win rate) em porcentagem.
 * Considera vitórias e empates (empate = 1/3 de vitória).
 * Fórmula: (vitórias * 3 + empates) / (jogos * 3) * 100
 */
export function calculateWinRate(wins: number, draws: number, games: number): number {
  if (games === 0) return 0;
  return Math.round(((wins * 3 + draws) / (games * 3)) * 100);
}

export type AggregatedPlayerStats = {
  rounds: number;
  games: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
};

/**
 * Agrega estatísticas pontuais a partir de um array de histórico de partidas.
 */
export function aggregatePlayerStats(rows: Array<{
  games?: number | null;
  goals?: number | null;
  assists?: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  points?: number | null;
}> = []): AggregatedPlayerStats {
  const initial: AggregatedPlayerStats = {
    rounds: 0,
    games: 0,
    goals: 0,
    assists: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
  };

  return rows.reduce<AggregatedPlayerStats>(
    (acc, curr) => ({
      rounds: acc.rounds + 1,
      games: acc.games + (Number(curr.games) || 0),
      goals: acc.goals + (Number(curr.goals) || 0),
      assists: acc.assists + (Number(curr.assists) || 0),
      wins: acc.wins + (Number(curr.wins) || 0),
      draws: acc.draws + (Number(curr.draws) || 0),
      losses: acc.losses + (Number(curr.losses) || 0),
      points: acc.points + (Number(curr.points) || 0),
    }),
    initial
  );
}

/**
 * Retorna o nome do jogador para listas e seleções.
 */
export function getDisplayName(name: string): string {
  return name.trim();
}

/**
 * Gera uma cor de fundo com opacidade para badges/cards.
 * Ex: "#3B82F6" → "rgba(59, 130, 246, 0.15)"
 */
export function colorWithOpacity(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Ordena array por uma propriedade numérica (decrescente por padrão).
 */
export function sortByNumber<T>(arr: T[], key: keyof T, descending = true): T[] {
  return [...arr].sort((a, b) => {
    const valA = Number(a[key]);
    const valB = Number(b[key]);
    return descending ? valB - valA : valA - valB;
  });
}

/**
 * Retorna "hoje", "amanhã", "ontem", ou a data formatada.
 */
export function getRelativeDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr + 'T00:00:00');
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Amanhã';
  if (diffDays === -1) return 'Ontem';
  return formatDate(dateStr);
}
