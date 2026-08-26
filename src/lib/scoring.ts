import type { EventType } from "./types";

export type ScoringPoints = Record<EventType, number>;

export const DEFAULT_SCORING_POINTS: ScoringPoints = {
  goal: 3,
  assist: 2,
  win: 2,
  draw: 1,
  loss: 0,
  best_goalkeeper: 6,
  goalkeeper_appearance: 3,
  goal_conceded: -1,
  own_goal: -2,
};

export const SCORING_RULE_FIELDS: Array<{
  eventType: EventType;
  label: string;
  description: string;
}> = [
  {
    eventType: "goal",
    label: "Gol",
    description: "Pontos para o jogador que marcar um gol.",
  },
  {
    eventType: "assist",
    label: "Assistência",
    description: "Pontos para quem der o passe do gol.",
  },
  {
    eventType: "win",
    label: "Vitória",
    description: "Pontos por vitória para cada jogador do time.",
  },
  {
    eventType: "draw",
    label: "Empate",
    description: "Pontos por empate para cada jogador do time.",
  },
  {
    eventType: "loss",
    label: "Derrota",
    description: "Pontos por derrota; pode ser um valor negativo.",
  },
  {
    eventType: "goalkeeper_appearance",
    label: "Atuação como goleiro",
    description: "Bônus por iniciar uma partida como goleiro.",
  },
  {
    eventType: "goal_conceded",
    label: "Gol sofrido",
    description: "Valor aplicado ao goleiro por cada gol sofrido; normalmente é negativo.",
  },
  {
    eventType: "own_goal",
    label: "Gol contra",
    description: "Desconto aplicado ao jogador que fizer gol contra.",
  },
];
