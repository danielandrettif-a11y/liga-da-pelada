/**
 * Mapeamento e Gerenciador de Artes Visuais das Cartas do Cartola V3.
 * 
 * COMO ADICIONAR OU TROCAR A ARTE DE UMA CARTA:
 * 1. Salve a imagem da carta na pasta `/public/images/cards/` com o nome do slug (ex: `super_captain.png`, `scout.webp`, etc.)
 * 2. Ou declare a URL diretamente no objeto `CARD_ART_MAP` abaixo.
 * 3. Se a imagem não for encontrada ou ainda não tiver sido criada, o sistema renderiza automaticamente
 *    um design premium vetorial com os ícones, badges de raridade e acabamento metálico/foil.
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
 * Versão dos assets para forçar atualização no cache de navegadores e celulares.
 */
const ASSET_VERSION = "v=20260818_hd_3";

/**
 * Retorna a URL da arte customizada da carta pelo slug (com cache-buster).
 */
export function getCardArtUrl(slug?: string): string | null {
  if (!slug) return null;
  const path = CARD_ART_MAP[slug];
  if (!path) return null;
  return `${path}?${ASSET_VERSION}`;
}
