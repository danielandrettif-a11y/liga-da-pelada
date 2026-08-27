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
  if (key.includes("alambrado-noturno")) return "from-[#020806] via-[#0a2516] to-[#486e38]";
  if (key.includes("vestiario-concreto")) return "from-[#151714] via-[#403e36] to-[#8f856c]";
  if (key.includes("garoa-refletores")) return "from-[#06121a] via-[#17465a] to-[#7ca7b4]";
  if (key.includes("gramado-bairro")) return "from-[#07160a] via-[#246337] to-[#90b94e]";
  if (key.includes("arquibancada-vazia")) return "from-[#07120c] via-[#214631] to-[#6f8f4c]";
  if (key.includes("por-do-sol-quadra")) return "from-[#2d170d] via-[#9e4d23] to-[#e7ae4c]";
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
  if (key.includes("alambrado-noturno")) return "/images/cosmetics/backgrounds/alambrado-noturno.png";
  if (key.includes("vestiario-concreto")) return "/images/cosmetics/backgrounds/vestiario-concreto.png";
  if (key.includes("garoa-refletores")) return "/images/cosmetics/backgrounds/garoa-refletores.png";
  if (key.includes("gramado-bairro")) return "/images/cosmetics/backgrounds/gramado-bairro.png";
  if (key.includes("arquibancada-vazia")) return "/images/cosmetics/backgrounds/arquibancada-vazia.png";
  if (key.includes("por-do-sol-quadra")) return "/images/cosmetics/backgrounds/por-do-sol-quadra.png";
  if (key.includes("campo-domingo")) return "/images/cosmetics/covers/campo-domingo.png";
  if (key.includes("arquibancada-concreto")) return "/images/cosmetics/covers/arquibancada-concreto.png";
  if (key.includes("vestiario-pos-jogo")) return "/images/cosmetics/covers/vestiario-pos-jogo.png";
  if (key.includes("tunel-quadra")) return "/images/cosmetics/covers/tunel-quadra.png";
  if (key.includes("chuva-campo")) return "/images/cosmetics/covers/chuva-campo.png";
  if (key.includes("bar-campo")) return "/images/cosmetics/covers/bar-campo.png";
  if (key.includes("banner-lenda-varzea")) return "/images/cosmetics/covers/lenda-varzea.png";
  if (key.includes("banner-rei-estadio")) return "/images/cosmetics/covers/rei-estadio.png";
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

export function cosmeticBackgroundPosition(slot?: CosmeticSlot | null, assetKey?: string | null): string {
  const key = (assetKey || "").toLowerCase();
  if (slot === "background" || key.includes("background")) {
    if (key.includes("vestiario")) return "center 30%";
    if (key.includes("por-do-sol")) return "center 15%";
    return "center top";
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
  const key = assetKey.toLowerCase();
  if (key.includes("neon")) return "!ring-[3.5px] !ring-[#ccff00] shadow-[0_0_20px_rgba(204,255,0,0.85)]";
  if (key.includes("capitao") || key.includes("faixa")) return "!ring-[3.5px] !ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.85)]";
  if (key.includes("rede")) return "!ring-[3.5px] !ring-sky-300 ring-offset-2 ring-offset-black shadow-[0_0_16px_rgba(125,211,252,0.75)]";
  if (key.includes("linha-lateral")) return "!ring-[3.5px] !ring-lime-200 ring-offset-2 ring-offset-emerald-950 shadow-[0_0_16px_rgba(190,242,100,.72)]";
  if (key.includes("grama-raiz")) return "!ring-[3px] !ring-emerald-300 ring-dashed shadow-[0_0_14px_rgba(52,211,153,.64)]";
  if (key.includes("alambrado")) return "!ring-[3px] !ring-zinc-300 ring-dashed shadow-[0_0_12px_rgba(255,255,255,0.5)]";
  if (key.includes("prancheta") || key.includes("placar") || key.includes("arquibancada") || key.includes("vestiario") || key.includes("apito") || key.includes("luvas") || key.includes("colete") || key.includes("area-tecnica") || key.includes("escanteio")) return "!ring-[2px] !ring-amber-300/80 shadow-[0_0_16px_rgba(251,191,36,.48)]";
  return "!ring-[3px] !ring-accent/90 shadow-[0_0_14px_rgba(204,255,0,0.5)]";
}

export function cosmeticFrameImage(assetKey?: string | null) {
  const key = assetKey || "";
  const frame = ["prancheta-tecnico", "placar-estadio", "arquibancada", "vestiario", "apito-arbitro", "luvas-goleiro", "colete-treino", "area-tecnica", "escanteio"].find((name) => key.includes(name));
  return frame ? `/images/cosmetics/frames/${frame}.png` : null;
}

export function cosmeticAuraClass(assetKey?: string | null): string {
  if (!assetKey) return "";
  const key = assetKey.toLowerCase();
  if (key.includes("fumaca-torcida")) return "shadow-[0_0_13px_5px_rgba(22,163,74,.72),0_0_38px_rgba(74,222,128,.68)] animate-pulse motion-reduce:animate-none";
  if (key.includes("chuva-jogo")) return "shadow-[0_0_11px_3px_rgba(125,211,252,.75),0_0_30px_rgba(59,130,246,.58)]";
  if (key.includes("sinalizador-verde")) return "shadow-[0_0_15px_6px_rgba(74,222,128,.88),0_0_44px_rgba(22,163,74,.75)] animate-pulse motion-reduce:animate-none";
  if (key.includes("noite-decisao")) return "shadow-[0_0_13px_4px_rgba(251,191,36,.82),0_0_40px_rgba(180,83,9,.68)] animate-pulse motion-reduce:animate-none";
  if (key.includes("refletores-acesos")) return "shadow-[0_0_11px_3px_rgba(255,255,255,.82),0_0_34px_rgba(163,230,53,.62)]";
  if (key.includes("fumaca")) return "shadow-[0_0_12px_4px_rgba(16,185,129,.72),0_0_34px_rgba(16,185,129,.72)] animate-pulse motion-reduce:animate-none";
  if (key.includes("flash") || key.includes("refletor")) return "shadow-[0_0_10px_3px_rgba(255,255,255,.72),0_0_32px_rgba(255,255,255,.72)]";
  if (key.includes("luz-de-quadra")) return "shadow-[0_0_9px_3px_rgba(253,224,71,.7),0_0_28px_rgba(250,204,21,.62)] animate-pulse motion-reduce:animate-none";
  return "shadow-[0_0_20px_rgba(204,255,0,0.6)]";
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
