/**
 * Mapeamento e Gerenciador de Artes Visuais das Cartas do Cartola V3.
 * 
 * Todas as artes oficiais em alta resolução (PNG ~700x1080px com fundo preto orgânico)
 * estão localizadas em `/public/images/cards/`.
 */

export const CARD_ART_MAP: Record<string, string> = {
  // LENDÁRIAS 👑
  super_captain: "/images/cards/super_captain.jpg",
  dream_team: "/images/cards/dream_team.jpg",

  // ÉPICAS 🟣
  scout: "/images/cards/scout.jpg",
  all_in: "/images/cards/all_in.jpg",
  triple_crown: "/images/cards/triple_crown.jpg",
  bagre_or_craque: "/images/cards/bagre_or_craque.jpg",
  vice_captain: "/images/cards/vice_captain.jpg",
  emergency_sub: "/images/cards/emergency_sub.png",

  // RARAS 🔵
  double_prediction: "/images/cards/double_prediction.jpg",
  duo: "/images/cards/duo.jpg",
  my_mvp: "/images/cards/my_mvp.jpg",
  head_to_head: "/images/cards/head_to_head.jpg",
  bagre_insurance: "/images/cards/bagre_insurance.jpg",
  bagre_value_shield: "/images/cards/bagre_value_shield.jpg",
  safe_prediction: "/images/cards/safe_prediction.png",

  // COMUNS ⚪
  extra_credit: "/images/cards/extra_credit.png",
  bargain: "/images/cards/bargain.png",
  golden_goal: "/images/cards/golden_goal.jpg",
  golden_assist: "/images/cards/golden_assist.jpg",
  so_vim_pela_resenha: "/images/cards/so_vim_pela_resenha.jpg",
  samu_do_cartola: "/images/cards/samu_do_cartola.jpg",
  tava_em_campo: "/images/cards/tava_em_campo.jpg",
};

/**
 * Retorna o caminho direto e limpo da arte oficial da carta pelo slug.
 */
export function getCardArtUrl(slug?: string): string | null {
  if (!slug) return null;
  return CARD_ART_MAP[slug] || null;
}

const preloadedCardArts = new Set<string>();

/**
 * Antecipação leve da arte sob intenção do usuário (toque/foco/hover).
 * Evita baixar todo o catálogo, mas deixa a ampliação praticamente imediata.
 */
export function preloadCardArt(slug?: string) {
  const src = getCardArtUrl(slug);
  if (!src || typeof window === "undefined" || preloadedCardArts.has(src)) return;

  preloadedCardArts.add(src);
  const image = new window.Image();
  image.decoding = "async";
  image.src = src;
}
