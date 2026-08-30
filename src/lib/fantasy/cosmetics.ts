export type CosmeticSlot = "banner" | "frame" | "title" | "aura" | "nameplate" | "background";
export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";

export type CosmeticItem = {
  id: string;
  slug: string;
  slot: CosmeticSlot;
  rarity: CosmeticRarity;
  name: string;
  description: string;
  assetKey: string;
};

const LEGACY_FRAME_ASSET_KEYS = new Set([
  "frame-alambrado",
  "frame-rede",
  "frame-neon",
  "frame-capitao",
  "frame-linha-lateral",
  "frame-grama-raiz",
]);

/** Molduras antigas continuam validas para quem ja as conquistou, mas nao
 * devem aparecer no catalogo do provador administrativo nem ser oferecidas
 * como novas recompensas do Passe. */
export function isLegacyFrameAsset(assetKey?: string | null) {
  return LEGACY_FRAME_ASSET_KEYS.has((assetKey || "").toLowerCase());
}

export const COSMETIC_SLOT_LABELS: Record<CosmeticSlot, string> = {
  banner: "Capa", frame: "Moldura", title: "Título", aura: "Aura", nameplate: "Nameplate", background: "Fundo",
};

export function cosmeticVisual(assetKey?: string | null) {
  const key = assetKey || "";
  if (key.includes("alambrado-noturno")) return "from-[#9fe6ef] via-[#75bf72] to-[#d8f071]";
  if (key.includes("vestiario-concreto")) return "from-[#f5dd9d] via-[#9ed39f] to-[#57a98a]";
  if (key.includes("garoa-refletores")) return "from-[#88dce7] via-[#48b9a5] to-[#bfe56f]";
  if (key.includes("gramado-bairro")) return "from-[#65c8ed] via-[#67b94c] to-[#e9e55e]";
  if (key.includes("arquibancada-vazia")) return "from-[#55d1c0] via-[#a2db63] to-[#f4d760]";
  if (key.includes("por-do-sol-quadra")) return "from-[#f1a36f] via-[#655fb4] to-[#32bea8]";
  if (key.includes("lenda")) return "from-[#4b3108] via-[#b98a20] to-[#e7c85f]";
  if (key.includes("rei")) return "from-[#031b18] via-[#0b6a51] to-[#bcff00]";
  if (key.includes("chuva")) return "from-[#071520] via-[#1d4151] to-[#6fa2ba]";
  if (key.includes("vestiario")) return "from-[#151712] via-[#4a4436] to-[#867c61]";
  if (key.includes("concreto") || key.includes("quadra")) return "from-[#1a201c] via-[#4b5a48] to-[#a9be72]";
  if (key.includes("sumula")) return "from-[#2c2417] via-[#a68b58] to-[#efe0a8]";
  if (key.includes("fim-de-tarde")) return "from-[#3b1b16] via-[#9b5731] to-[#e6b55d]";
  if (key.includes("linha-lateral")) return "from-[#092014] via-[#267744] to-[#e8f3b0]";
  if (key.includes("varzea") || key.includes("campo") || key.includes("gramado")) return "from-[#031109] via-[#0d4527] to-[#71a840]";
  if (key.includes("arquibancada") || key.includes("neon") || key.includes("energia")) return "from-[#0c1024] via-[#174b3d] to-[#baff00]";
  if (key.includes("fumaca")) return "from-[#07170e] via-[#1a5a32] to-[#83c69b]";
  if (key.includes("flash") || key.includes("refletor")) return "from-[#15202b] via-[#5d7180] to-[#d5f4ef]";
  if (key.includes("retro")) return "from-[#481c14] via-[#c66a2d] to-[#f0bd53]";
  if (key.includes("prancheta")) return "from-[#1c2720] via-[#61734c] to-[#c6bc78]";
  if (key.includes("rede")) return "from-[#15233a] via-[#3d6e86] to-[#c6f3eb]";
  if (key.includes("faixa") || key.includes("capitao")) return "from-[#602219] via-[#c94928] to-[#f5be6b]";
  return "from-[#132519] via-[#315b31] to-[#9fc74e]";
}

export function cosmeticImage(assetKey?: string | null) {
  const key = assetKey || "";
  // Títulos usam uma prévia tipográfica própria. Nunca reaproveitar fotos
  // genéricas de capas ou fundos apenas porque a chave contém "rei", etc.
  if (key.startsWith("title-")) return null;
  // Os fundos reformulados usam URLs versionadas para invalidar o cache de
  // imagens do Next/CDN sem alterar os asset_keys já gravados no banco.
  if (key.includes("alambrado-noturno")) return "/images/cosmetics/backgrounds/manha-campinho-2026.webp";
  if (key.includes("vestiario-concreto")) return "/images/cosmetics/backgrounds/vestiario-resenha-2026.webp";
  if (key.includes("garoa-refletores")) return "/images/cosmetics/backgrounds/depois-chuva-2026.webp";
  if (key.includes("gramado-bairro")) return "/images/cosmetics/backgrounds/domingo-sol-2026.webp";
  if (key.includes("arquibancada-vazia")) return "/images/cosmetics/backgrounds/torcida-chegando-2026.webp";
  if (key.includes("por-do-sol-quadra")) return "/images/cosmetics/backgrounds/luzes-pelada-2026.webp";
  if (key.includes("campo-domingo")) return "/images/cosmetics/covers/campo-domingo-v2.webp";
  if (key.includes("arquibancada-concreto")) return "/images/cosmetics/covers/arquibancada-concreto-v2.webp";
  if (key.includes("vestiario-pos-jogo")) return "/images/cosmetics/covers/vestiario-pos-jogo-v2.webp";
  if (key.includes("tunel-quadra")) return "/images/cosmetics/covers/tunel-quadra-v2.webp";
  if (key.includes("chuva-campo")) return "/images/cosmetics/covers/chuva-campo-v2.webp";
  if (key.includes("bar-campo")) return "/images/cosmetics/covers/bar-campo-v2.webp";
  if (key.includes("banner-lenda-varzea")) return "/images/cosmetics/covers/lenda-varzea-v2.webp";
  if (key.includes("banner-rei-estadio")) return "/images/cosmetics/covers/rei-estadio-v2.webp";
  if (key.includes("campo-noite")) return "/images/cosmetics/campo-a-noite.webp";
  if (key.includes("arquibancada")) return "/images/cosmetics/arquibancada-neon.webp";
  if (key.includes("tunel")) return "/images/cosmetics/tunel-estadio.webp";
  if (key.includes("torcida")) return "/images/cosmetics/torcida-bq.webp";
  if (key.includes("vestiario")) return "/images/cosmetics/vestiario.webp";
  if (key.includes("chuva")) return "/images/cosmetics/chuva-estadio.webp";
  if (key.includes("lenda")) return "/images/cosmetics/lenda-varzea.webp";
  if (key.includes("rei")) return "/images/cosmetics/rei-estadio.webp";
  return null;
}

/**
 * Retorna a arte-fonte sem a compressao agressiva usada nas miniaturas.
 * Telas de perfil e cards maiores entregam esta fonte ao next/image, que gera
 * uma variante responsiva adequada ao DPR do celular sem carregar o PNG
 * original inteiro no navegador.
 */
export function cosmeticHighResolutionImage(assetKey?: string | null) {
  const image = cosmeticImage(assetKey);
  if (image?.endsWith("-v2.webp")) return image;
  return image?.endsWith(".webp") ? image.replace(/\.webp$/, ".png") : image;
}

export function cosmeticBackgroundPosition(slot?: CosmeticSlot | null, assetKey?: string | null): string {
  const key = (assetKey || "").toLowerCase();
  if (slot === "background" || key.includes("background")) {
    return "center center";
  }
  if (slot === "banner" || key.includes("covers") || key.includes("banner")) {
    if (key.includes("bar-campo")) return "center 35%";
    if (key.includes("chuva-campo")) return "center 25%";
    if (key.includes("vestiario-pos-jogo")) return "center 30%";
    return "center 20%";
  }
  return "center 20%";
}

export function rarityClass(rarity: CosmeticRarity) {
  return ({ common: "border-white/20 text-white/80", rare: "border-sky-300/50 text-sky-200", epic: "border-fuchsia-300/55 text-fuchsia-200", legendary: "border-amber-300/70 text-amber-200" })[rarity];
}

export function cosmeticFrameClass(assetKey?: string | null): string {
  if (!assetKey) return "";
  if (cosmeticFrameImage(assetKey)) return "";
  const key = assetKey.toLowerCase();
  if (key.includes("neon")) return "!ring-[3.5px] !ring-[#ccff00] shadow-[0_0_20px_rgba(204,255,0,0.85)]";
  if (key.includes("capitao") || key.includes("faixa")) return "!ring-[3.5px] !ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.85)]";
  if (key.includes("rede")) return "!ring-[3.5px] !ring-sky-300 ring-offset-2 ring-offset-black shadow-[0_0_16px_rgba(125,211,252,0.75)]";
  if (key.includes("linha-lateral")) return "!ring-[3.5px] !ring-lime-200 ring-offset-2 ring-offset-emerald-950 shadow-[0_0_16px_rgba(190,242,100,.72)]";
  if (key.includes("grama-raiz")) return "!ring-[3px] !ring-emerald-300 ring-dashed shadow-[0_0_14px_rgba(52,211,153,.64)]";
  if (key.includes("alambrado")) return "!ring-[3px] !ring-zinc-300 ring-dashed shadow-[0_0_12px_rgba(255,255,255,0.5)]";
  return "!ring-[3px] !ring-accent/90 shadow-[0_0_14px_rgba(204,255,0,0.5)]";
}

export function cosmeticFrameImage(assetKey?: string | null) {
  const key = (assetKey || "").toLowerCase();
  const upgradedFrame = ([
    ["apito-arbitro", "apito-arbitro-v2.webp"],
    ["vestiario", "vestiario-v2.webp"],
    ["luvas-goleiro", "luvas-goleiro-v2.webp"],
    ["area-tecnica", "area-tecnica-v2.webp"],
  ] as const).find(([name]) => key.includes(name));
  if (upgradedFrame) return `/images/cosmetics/frames/${upgradedFrame[1]}`;
  const frame = ["prancheta-tecnico", "placar-estadio", "arquibancada", "vestiario", "apito-arbitro", "luvas-goleiro", "colete-treino", "area-tecnica", "escanteio"].find((name) => key.includes(name));
  // Os WebPs antigos destas molduras perderam o alpha e criam um quadrado
  // preto/pixelado ao redor do avatar. Os PNGs sao leves, nitidos e preservam
  // a transparencia real em qualquer fundo.
  return frame ? `/images/cosmetics/frames/${frame}.png` : null;
}

export function cosmeticAuraClass(assetKey?: string | null): string {
  const variant = cosmeticAuraVariant(assetKey);
  return variant ? `cosmetic-aura-host cosmetic-aura-host--${variant}` : "";
}

export type CosmeticAuraVariant = "smoke" | "spotlight" | "rain" | "radar" | "glory" | "energy";

/**
 * Mantem as chaves ja salvas no banco, mas converte cada uma em um efeito
 * leve e animado. A arte da aura e feita em CSS para continuar nitida em
 * avatares pequenos e nao disputar espaco com as molduras ilustradas.
 */
export function cosmeticAuraVariant(assetKey?: string | null): CosmeticAuraVariant | null {
  if (!assetKey) return null;
  const key = assetKey.toLowerCase();
  if (key.includes("fumaca-torcida") || key.includes("fumaca-churras") || key.includes("fumaca")) return "smoke";
  if (key.includes("refletores-acesos") || key.includes("holofote") || key.includes("flash") || key.includes("refletor")) return "spotlight";
  if (key.includes("chuva-jogo")) return "rain";
  if (key.includes("sinalizador-verde") || key.includes("radar-olheiro")) return "radar";
  if (key.includes("noite-decisao") || key.includes("gloria-decisao") || key.includes("luz-de-quadra")) return "glory";
  return "energy";
}

export function cosmeticNameplateClass(assetKey?: string | null): string {
  if (!assetKey) return "border-white/10 bg-black/40 text-foreground";
  const key = assetKey.toLowerCase();
  if (key.includes("ficha-vestiario")) return "border-amber-200/55 bg-[repeating-linear-gradient(0deg,#26160d_0_4px,#3e2616_4px_8px)] text-amber-100 shadow-[inset_0_0_12px_rgba(245,158,11,.16),0_5px_16px_rgba(0,0,0,.35)]";
  if (key.includes("placar-quadra")) return "border-lime-300/55 bg-black text-lime-300 font-mono shadow-[inset_0_0_16px_rgba(163,230,53,.24),0_0_16px_rgba(163,230,53,.25)]";
  if (key.includes("faixa-torcida")) return "border-amber-400/60 bg-[repeating-linear-gradient(135deg,#214b26_0_9px,#08250f_9px_18px)] text-amber-100 shadow-[0_5px_18px_rgba(34,197,94,.22)]";
  if (key.includes("prancheta-tatica")) return "border-lime-300/50 bg-[linear-gradient(90deg,#172a16_0_49%,rgba(163,230,53,.18)_50%,#172a16_51%)] text-lime-100 shadow-[inset_0_0_18px_rgba(163,230,53,.12)]";
  if (key.includes("sumula-juiz")) return "border-[#f6df9a]/70 bg-[repeating-linear-gradient(0deg,#dfcf9d_0_2px,#eee0b6_2px_7px)] text-[#382613] shadow-[0_5px_18px_rgba(245,158,11,.25)]";
  return "border-accent/30 bg-black/50 text-accent";
}
