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

/**
 * Retorna o nome de exibição do jogador (nickname se disponível, senão primeiro nome).
 */
export function getDisplayName(name: string, nickname: string | null): string {
  return nickname || name.split(' ')[0];
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
