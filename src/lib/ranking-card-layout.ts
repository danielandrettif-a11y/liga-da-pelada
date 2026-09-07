export type RankingCardTier = "gold" | "silver" | "bronze" | "ranked";
export type RankingCardPhotoShape = "circle" | "silver-shield" | "bronze-cutout" | "ranked-shield";

export type RankingCardBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type RankingCardLayout = {
  tier: RankingCardTier;
  photoShape: RankingCardPhotoShape;
  header: RankingCardBox;
  score: RankingCardBox;
  photo: RankingCardBox;
  name: RankingCardBox;
  awards: RankingCardBox;
  stats: RankingCardBox;
};

const CARD_LAYOUTS: Record<RankingCardTier, RankingCardLayout> = {
  gold: {
    tier: "gold",
    photoShape: "circle",
    header: { left: 29, top: 9.2, width: 42, height: 4.3 },
    score: { left: 14.5, top: 17.8, width: 27, height: 25 },
    photo: { left: 50.7, top: 16.9, width: 34, height: 22.7 },
    name: { left: 13.5, top: 49.3, width: 73, height: 8.2 },
    awards: { left: 21, top: 59.1, width: 58, height: 4.8 },
    stats: { left: 18.5, top: 65.7, width: 63, height: 24.8 },
  },
  silver: {
    tier: "silver",
    photoShape: "silver-shield",
    header: { left: 28, top: 11.6, width: 44, height: 4.2 },
    score: { left: 14, top: 18.7, width: 27, height: 25 },
    photo: { left: 51.2, top: 17.4, width: 31, height: 27 },
    name: { left: 10.5, top: 55.2, width: 79, height: 8.3 },
    awards: { left: 17, top: 65.2, width: 66, height: 5.1 },
    stats: { left: 15, top: 72.8, width: 70, height: 18.5 },
  },
  bronze: {
    tier: "bronze",
    photoShape: "bronze-cutout",
    header: { left: 30, top: 8.1, width: 40, height: 4.1 },
    score: { left: 14.2, top: 17.1, width: 27, height: 25 },
    photo: { left: 52.5, top: 16.4, width: 29, height: 27.5 },
    name: { left: 12, top: 50.7, width: 76, height: 8.3 },
    awards: { left: 18, top: 61.8, width: 64, height: 5 },
    stats: { left: 16.5, top: 69.1, width: 67, height: 17.5 },
  },
  ranked: {
    tier: "ranked",
    photoShape: "ranked-shield",
    header: { left: 30, top: 8, width: 40, height: 4 },
    score: { left: 14, top: 18, width: 27, height: 25 },
    photo: { left: 52, top: 16.6, width: 30, height: 27.5 },
    name: { left: 11.5, top: 53.2, width: 77, height: 8.2 },
    awards: { left: 18, top: 63.7, width: 64, height: 5 },
    stats: { left: 15, top: 70.2, width: 70, height: 19.2 },
  },
};

export function getRankingCardLayout(position: number): RankingCardLayout {
  if (position === 1) return CARD_LAYOUTS.gold;
  if (position === 2) return CARD_LAYOUTS.silver;
  if (position === 3) return CARD_LAYOUTS.bronze;
  return CARD_LAYOUTS.ranked;
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
