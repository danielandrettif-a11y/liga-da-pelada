import type { RankingEntry } from "./ranking";

export type RankingCardTier = "gold" | "silver" | "bronze" | "ranked";
export type RankingCardPhotoShape = "shield";

export type RankingCardBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type RankingCardLayout = {
  photoShape: RankingCardPhotoShape;
  header: RankingCardBox;
  score: RankingCardBox;
  photo: RankingCardBox;
  name: RankingCardBox;
  awards: RankingCardBox;
  stats: RankingCardBox;
};

export type RankingCardTheme = {
  tier: RankingCardTier;
  artwork: string;
  base: string;
  light: string;
  deep: string;
  edge: string;
  ink: string;
  glow: string;
  label: string;
};

export type RankingCardAwardKey = "roundMvp" | "topScorer" | "topAssister" | "kingOfWins";

export type RankingCardContent = {
  header: string;
  points: string;
  profile: string;
  placement: string;
  name: string;
  title: string | null;
  awards: Array<{ key: RankingCardAwardKey; label: string; value: number }>;
  stats: Array<{ label: string; value: string }>;
};

/** All card tiers use this exact 2:3 content grid. */
export const RANKING_CARD_LAYOUT: RankingCardLayout = {
  photoShape: "shield",
  header: { left: 29, top: 10.5, width: 42, height: 4.8 },
  score: { left: 13.5, top: 18, width: 29, height: 29 },
  photo: { left: 52, top: 17.8, width: 32, height: 29.2 },
  name: { left: 8.5, top: 54.1, width: 83, height: 8.6 },
  awards: { left: 12.8, top: 64.4, width: 74.4, height: 12.3 },
  stats: { left: 12.8, top: 78.7, width: 74.4, height: 12.8 },
};

const CARD_THEMES: Record<RankingCardTier, RankingCardTheme> = {
  gold: {
    tier: "gold",
    artwork: "/images/ranking-cards/ranking-card-gold-v2.webp",
    base: "#c99520",
    light: "#fff0a6",
    deep: "#6f4806",
    edge: "#ffe77a",
    ink: "#ffffff",
    glow: "rgba(255,199,47,.42)",
    label: "OURO",
  },
  silver: {
    tier: "silver",
    artwork: "/images/ranking-cards/ranking-card-silver-v2.webp",
    base: "#a8b1bd",
    light: "#f8fbff",
    deep: "#515b68",
    edge: "#e8f1f8",
    ink: "#ffffff",
    glow: "rgba(210,224,240,.35)",
    label: "PRATA",
  },
  bronze: {
    tier: "bronze",
    artwork: "/images/ranking-cards/ranking-card-bronze-v2.webp",
    base: "#a9612f",
    light: "#f0c09a",
    deep: "#512713",
    edge: "#efad77",
    ink: "#ffffff",
    glow: "rgba(195,105,53,.38)",
    label: "BRONZE",
  },
  ranked: {
    tier: "ranked",
    artwork: "/images/ranking-cards/ranking-card-neutral-v2.webp",
    base: "#123e28",
    light: "#4f8d67",
    deep: "#06150d",
    edge: "#ccff00",
    ink: "#ffffff",
    glow: "rgba(204,255,0,.2)",
    label: "RANKED",
  },
};

const PROFILE_LABELS = {
  offensive: "ATA",
  midfield: "MEI/ALA",
  defensive: "DEF",
} as const;

export function getRankingCardTier(position: number): RankingCardTier {
  if (position === 1) return "gold";
  if (position === 2) return "silver";
  if (position === 3) return "bronze";
  return "ranked";
}

export function getRankingCardLayout() {
  return RANKING_CARD_LAYOUT;
}

export function getRankingCardTheme(position: number) {
  return CARD_THEMES[getRankingCardTier(position)];
}

export function buildRankingCardContent(entry: RankingEntry, position: number): RankingCardContent {
  const theme = getRankingCardTheme(position);
  const profile = `${PROFILE_LABELS[entry.player.player_profile || "midfield"]}${entry.player.is_goalkeeper ? " / GOL" : ""}`;

  return {
    header: `PBQ • ${theme.label}`,
    points: String(entry.points),
    profile,
    placement: `${position}º`,
    name: entry.player.name,
    title: entry.cosmetics?.titleName || null,
    awards: [
      { key: "roundMvp", label: "Craque", value: entry.awards.roundMvp },
      { key: "topScorer", label: "Artilheiro", value: entry.awards.topScorer },
      { key: "topAssister", label: "Garçom", value: entry.awards.topAssister },
      { key: "kingOfWins", label: "Rei das Vitórias", value: entry.awards.kingOfWins },
    ],
    stats: [
      { value: String(entry.goals), label: "GOL" },
      { value: String(entry.assists), label: "AST" },
      { value: String(entry.wins), label: "VIT" },
      { value: String(entry.games), label: "JOG" },
      { value: String(entry.losses), label: "DER" },
      { value: `${entry.winRate}%`, label: "APR" },
    ],
  };
}

export function rankingCardBoxStyle(box: RankingCardBox) {
  return {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
  };
}

export function rankingCardBoxPixels(
  box: RankingCardBox,
  card: { x: number; y: number; width: number; height: number },
) {
  return {
    x: card.x + card.width * box.left / 100,
    y: card.y + card.height * box.top / 100,
    width: card.width * box.width / 100,
    height: card.height * box.height / 100,
  };
}
