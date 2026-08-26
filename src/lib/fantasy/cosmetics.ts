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
  if (key.includes("concreto") || key.includes("quadra")) return "from-[#1a201c] via-[#4b5a48] to-[#a9be72]";
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

export function cosmeticFrameClass(assetKey?: string | null): string {
  if (!assetKey) return "";
  const key = assetKey.toLowerCase();
  if (key.includes("neon")) return "!ring-[3.5px] !ring-[#ccff00] shadow-[0_0_20px_rgba(204,255,0,0.85)]";
  if (key.includes("capitao") || key.includes("faixa")) return "!ring-[3.5px] !ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.85)]";
  if (key.includes("rede")) return "!ring-[3.5px] !ring-sky-300 ring-offset-2 ring-offset-black shadow-[0_0_16px_rgba(125,211,252,0.75)]";
  if (key.includes("linha-lateral")) return "!ring-[3.5px] !ring-lime-200 ring-offset-2 ring-offset-emerald-950 shadow-[0_0_16px_rgba(190,242,100,.72)]";
  if (key.includes("grama-raiz")) return "!ring-[3px] !ring-emerald-300 ring-dashed shadow-[0_0_14px_rgba(52,211,153,.64)]";
  if (key.includes("alambrado")) return "!ring-[3px] !ring-zinc-300 ring-dashed shadow-[0_0_12px_rgba(255,255,255,0.5)]";
  return "!ring-[3px] !ring-accent/90 shadow-[0_0_14px_rgba(204,255,0,0.5)]";
}

export function cosmeticAuraClass(assetKey?: string | null): string {
  if (!assetKey) return "";
  const key = assetKey.toLowerCase();
  if (key.includes("fumaca")) return "shadow-[0_0_12px_4px_rgba(16,185,129,.72),0_0_34px_rgba(16,185,129,.72)] animate-pulse motion-reduce:animate-none";
  if (key.includes("flash") || key.includes("refletor")) return "shadow-[0_0_10px_3px_rgba(255,255,255,.72),0_0_32px_rgba(255,255,255,.72)]";
  if (key.includes("energia")) return "shadow-[0_0_10px_3px_rgba(204,255,0,.68),0_0_30px_rgba(204,255,0,.72)]";
  if (key.includes("luz-de-quadra")) return "shadow-[0_0_9px_3px_rgba(253,224,71,.7),0_0_28px_rgba(250,204,21,.62)] animate-pulse motion-reduce:animate-none";
  return "shadow-[0_0_20px_rgba(204,255,0,0.6)]";
}

export function cosmeticNameplateClass(assetKey?: string | null): string {
  if (!assetKey) return "border-white/10 bg-black/40 text-foreground";
  const key = assetKey.toLowerCase();
  if (key.includes("placar")) return "border-emerald-400/50 bg-black/85 text-emerald-300 font-mono shadow-[inset_0_0_16px_rgba(52,211,153,.16),0_0_16px_rgba(52,211,153,.2)]";
  if (key.includes("faixa")) return "border-amber-400/60 bg-[linear-gradient(135deg,#3b1708,#8a3d0d,#3b1708)] text-amber-100 shadow-[0_5px_18px_rgba(245,158,11,.25)]";
  if (key.includes("retro")) return "border-orange-300/55 bg-[repeating-linear-gradient(135deg,#431407_0_7px,#70280e_7px_14px)] text-orange-100 shadow-[0_5px_16px_rgba(249,115,22,.24)]";
  if (key.includes("prancheta")) return "border-lime-300/50 bg-[linear-gradient(90deg,#172a16_0_49%,rgba(163,230,53,.18)_50%,#172a16_51%)] text-lime-100 shadow-[inset_0_0_18px_rgba(163,230,53,.12)]";
  if (key.includes("varzea-raiz")) return "border-emerald-300/55 bg-[repeating-linear-gradient(135deg,#092916_0_7px,#134a24_7px_14px)] text-lime-100 shadow-[0_5px_16px_rgba(74,222,128,.22)]";
  return "border-accent/30 bg-black/50 text-accent";
}
