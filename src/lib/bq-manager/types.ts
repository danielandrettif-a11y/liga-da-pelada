import type { PlayerProfile } from "@/lib/types";

export const POSITIONS = ["DEF", "ALA_MEI", "ATA", "GOL"] as const;
export type Position = typeof POSITIONS[number];
export type Ratings = Record<Position, number>;
export type Trend = "rising" | "steady" | "falling";
export type Attributes = Record<"finishing" | "passing" | "defense" | "speed" | "physical", number>;

/** Only public football data crosses the app -> game bridge. */
export type AthleteSource = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  snapshotId: string;
  formula: string;
  capturedAt: string;
  overall: number;
  positions: Ratings;
  traits: PlayerProfile[];
  goalkeeperEligible: boolean;
  trend: Trend;
  stats: { rounds: number; goals: number; assists: number };
};

export type ManagerCard = {
  id: string;
  source: AthleteSource;
  acquiredAt: string;
  inherited: Ratings;
  training: Ratings;
  fusion: Ratings;
  attributes: Attributes;
  attributesReviewed: boolean;
  bound: boolean;
};

export type ManagerPack = {
  id: string;
  kind: "choice" | "guaranteed" | "standard";
  label: string;
  bound: boolean;
  /** Set by future Várzea rewards to ensure positional coverage. */
  preferredPosition?: Position;
  status: "sealed" | "offered" | "claimed";
  offers: AthleteSource[];
  claimedCardId?: string;
};

export type ClubIdentity = {
  name: string;
  abbreviation: string;
  color: string;
  crest: "shield" | "round";
  kit: "solid" | "stripes";
};

export type ManagerState = {
  schemaVersion: 1;
  club: ClubIdentity;
  cards: ManagerCard[];
  /** Permanent album; consuming a card never removes its discovery. */
  discovered: AthleteSource[];
  packs: ManagerPack[];
};

export type ManagerSave = { version: number; state: ManagerState };
export type ManagerCommand =
  | { type: "open-pack"; packId: string }
  | { type: "claim-pack"; packId: string; playerId: string }
  | { type: "fuse"; targetId: string; donorIds: string[]; position: Position; mode: "inherit" | "four" };

export type ManagerResult =
  | { ok: true; save: ManagerSave; message: string }
  | { ok: false; message: string };
