import type { PlayerProfile } from "./types";

export const PLAYER_PROFILE_OPTIONS: Array<{
  value: PlayerProfile;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: "offensive",
    label: "Ofensivo",
    shortLabel: "ATA",
    description: "Atua mais perto do gol e cria chances.",
  },
  {
    value: "midfield",
    label: "Meio-Campo",
    shortLabel: "MEI",
    description: "Organiza o jogo e cria oportunidades com assistências.",
  },
  {
    value: "wing",
    label: "Ala",
    shortLabel: "ALA",
    description: "Ataca pelos lados e recompõe para proteger o time.",
  },
  {
    value: "defensive",
    label: "Defensivo",
    shortLabel: "DEF",
    description: "Prioriza a marcacao e a protecao do time.",
  },
];

export function getPlayerProfile(profile?: PlayerProfile | null) {
  return PLAYER_PROFILE_OPTIONS.find((option) => option.value === profile)
    ?? PLAYER_PROFILE_OPTIONS[1];
}

export const PLAYER_PROFILE_STYLES: Record<PlayerProfile, string> = {
  offensive: "bg-danger/10 text-danger border-danger/20",
  midfield: "bg-warning/10 text-warning border-warning/20",
  wing: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  defensive: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};
