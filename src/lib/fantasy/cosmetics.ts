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

export const COSMETIC_SLOT_LABELS: Record<CosmeticSlot, string> = {
  banner: "Capa", frame: "Moldura", title: "Título", aura: "Aura", nameplate: "Nameplate", background: "Fundo",
};

export function cosmeticVisual(assetKey?: string | null) {
  const key = assetKey || "";
  if (key.includes("lenda")) return "from-[#4b3108] via-[#b98a20] to-[#e7c85f]";
  if (key.includes("rei")) return "from-[#031b18] via-[#0b6a51] to-[#bcff00]";
  if (key.includes("chuva")) return "from-[#071520] via-[#1d4151] to-[#6fa2ba]";
  if (key.includes("vestiario")) return "from-[#151712] via-[#4a4436] to-[#867c61]";
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
  if (key.includes("campo-noite")) return "/images/cosmetics/campo-a-noite.png";
  if (key.includes("arquibancada")) return "/images/cosmetics/arquibancada-neon.png";
  if (key.includes("tunel")) return "/images/cosmetics/tunel-estadio.png";
  if (key.includes("torcida")) return "/images/cosmetics/torcida-bq.png";
  if (key.includes("vestiario")) return "/images/cosmetics/vestiario.png";
  if (key.includes("chuva")) return "/images/cosmetics/chuva-estadio.png";
  if (key.includes("lenda")) return "/images/cosmetics/lenda-varzea.png";
  if (key.includes("rei")) return "/images/cosmetics/rei-estadio.png";
  return null;
}

export function rarityClass(rarity: CosmeticRarity) {
  return ({ common: "border-white/20 text-white/80", rare: "border-sky-300/50 text-sky-200", epic: "border-fuchsia-300/55 text-fuchsia-200", legendary: "border-amber-300/70 text-amber-200" })[rarity];
}
