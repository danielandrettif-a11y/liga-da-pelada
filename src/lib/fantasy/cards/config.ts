export type FantasyCardRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

export type FantasyCardEffectType =
  | "CAPTAIN_MULTIPLIER"
  | "BUDGET_BONUS"
  | "PREDICTION_MULTIPLIER"
  | "PLAYER_DISCOUNT"
  | "VICE_CAPTAIN"
  | "CONDITIONAL_PLAYER_BONUS"
  | "CONDITIONAL_DUO_BONUS"
  | "SAFE_PREDICTION"
  | "EMERGENCY_SUB";

export const MAX_SPECIAL_CARDS_PER_ROUND = 1;
export const PACK_OPTIONS = 2;

export const FANTASY_RARITY_PROBABILITIES: Record<FantasyCardRarity, number> = {
  COMMON: 0.55,
  RARE: 0.30,
  EPIC: 0.12,
  LEGENDARY: 0.03,
};

export const RARITY_CONFIG: Record<
  FantasyCardRarity,
  {
    label: string;
    icon: string;
    border: string;
    bg: string;
    badgeBg: string;
    text: string;
    glow: string;
  }
> = {
  COMMON: {
    label: "Comum",
    icon: "⚪",
    border: "border-slate-400/30",
    bg: "bg-slate-900/60",
    badgeBg: "bg-slate-700/50 text-slate-300 border border-slate-500/30",
    text: "text-slate-200",
    glow: "shadow-[0_0_15px_rgba(148,163,184,0.15)]",
  },
  RARE: {
    label: "Rara",
    icon: "🔵",
    border: "border-sky-400/50",
    bg: "bg-sky-950/60",
    badgeBg: "bg-sky-500/20 text-sky-300 border border-sky-400/40",
    text: "text-sky-300",
    glow: "shadow-[0_0_20px_rgba(56,189,248,0.25)]",
  },
  EPIC: {
    label: "Épica",
    icon: "🟣",
    border: "border-purple-400/50",
    bg: "bg-purple-950/60",
    badgeBg: "bg-purple-500/20 text-purple-300 border border-purple-400/40",
    text: "text-purple-300",
    glow: "shadow-[0_0_25px_rgba(168,85,247,0.3)]",
  },
  LEGENDARY: {
    label: "Lendária",
    icon: "👑",
    border: "border-amber-400/60",
    bg: "bg-amber-950/60",
    badgeBg: "bg-amber-500/25 text-amber-300 border border-amber-400/50",
    text: "text-amber-300",
    glow: "shadow-[0_0_30px_rgba(245,158,11,0.4)]",
  },
};
