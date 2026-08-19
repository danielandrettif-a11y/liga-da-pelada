/**
 * Mapeamento e Gerenciador de Artes Visuais das Cartas do Cartola V3.
 * 
 * Todas as artes oficiais em alta resolução (PNG ~700x1080px com fundo preto orgânico)
 * estão localizadas em `/public/images/cards/`.
 */

export const CARD_ART_MAP: Record<string, string> = {
  // LENDÁRIAS 👑
  super_captain: "/images/cards/super_captain.png",

  // ÉPICAS 🟣
  scout: "/images/cards/scout.png",
  all_in: "/images/cards/all_in.png",
  emergency_sub: "/images/cards/emergency_sub.png",

  // RARAS 🔵
  double_prediction: "/images/cards/double_prediction.png",
  vice_captain: "/images/cards/vice_captain.png",
  duo: "/images/cards/duo.png",
  safe_prediction: "/images/cards/safe_prediction.png",

  // COMUNS ⚪
  extra_credit: "/images/cards/extra_credit.png",
  bargain: "/images/cards/bargain.png",
  golden_goal: "/images/cards/golden_goal.png",
  golden_assist: "/images/cards/golden_assist.png",
};

/**
 * Retorna o caminho direto e limpo da arte oficial da carta pelo slug.
 */
export function getCardArtUrl(slug?: string): string | null {
  if (!slug) return null;
  return CARD_ART_MAP[slug] || null;
}
