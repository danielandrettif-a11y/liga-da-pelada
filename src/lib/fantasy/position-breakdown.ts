/**
 * Breakdown autoritativo da pontuação por posição — BQ v6.
 *
 * Usado na prévia ao vivo, processamento final e histórico para garantir
 * uma representação única e consistente em todas as interfaces.
 */

import type { FantasySettings } from "./config";
import type { FantasySlotRole } from "./lineup-positions";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PositionBonusEvent = {
  label: string;
  count: number;
  value: number;
};

export type SpecialBonus = {
  name: string;
  activated: boolean;
  value: number;
  /** Progresso exibido quando não ativado, ex: "1/2 assistências" */
  progress: string | null;
};

export type PositionBonusBreakdown = {
  position: FantasySlotRole;
  events: PositionBonusEvent[];
  specialBonus: SpecialBonus | null;
  grossBonus: number;
  cap: number | null;
  appliedBonus: number;
  capReached: boolean;
};

// ---------------------------------------------------------------------------
// Valores históricos usados apenas como fallback de snapshots incompletos
// ---------------------------------------------------------------------------

/** Bônus Muralha: ≥3 clean sheets na rodada. */
const DEF_MURALHA_THRESHOLD = 3;

/** Maestro: ≥2 assistências na rodada. */
const MEI_MAESTRO_THRESHOLD = 2;

/** Artilheiro: ≥2 gols na rodada. */
const ATA_ARTILHEIRO_THRESHOLD = 2;

/** GOL: clean sheet quando o atleta realmente atuou no gol. */
const GOL_CLEAN_SHEET_BONUS = 4;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type PositionBreakdownInput = {
  slotRole: FantasySlotRole;
  playerProfile: string | null | undefined;
  goals: number;
  assists: number;
  /** Partidas finalizadas como jogador de linha (excl. goleiro) com 0 gols sofridos */
  defensiveCleanGames: number;
  /** Partidas finalizadas com exatamente 1 gol sofrido */
  defensiveOneGoalGames: number;
  /** Partidas em que atuou como goleiro */
  goalkeeperGames: number;
  /** Clean sheets como goleiro */
  cleanSheets: number;
  suppressGoalkeeperRewards?: boolean;
  settings?: FantasySettings;
};

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

/**
 * Verifica se o perfil do jogador corresponde ao slot atribuído.
 * GOL é deliberadamente aberto — qualquer atleta pode assumir.
 */
function isCorrectSlot(slotRole: FantasySlotRole, playerProfile: string | null | undefined): boolean {
  if (slotRole === "GOL") return true;
  if (slotRole === "DEF") return playerProfile === "defensive";
  if (slotRole === "MEI") return playerProfile === "midfield";
  if (slotRole === "ALA") return playerProfile === "wing";
  return playerProfile === "offensive";
}

/**
 * Calcula o breakdown completo do bônus posicional para um atleta.
 */
export function calculatePositionBreakdown(input: PositionBreakdownInput): PositionBonusBreakdown {
  const { slotRole, playerProfile } = input;
  const setting = (key: keyof FantasySettings, fallback: number) => Number(input.settings?.[key] ?? fallback);

  // GOL — clean sheet quando realmente atuou no gol
  if (slotRole === "GOL") {
    const cleanSheetBonus = !input.suppressGoalkeeperRewards && input.goalkeeperGames > 0
      ? input.cleanSheets * setting("goalkeeperSlotCleanSheetPoints", GOL_CLEAN_SHEET_BONUS)
      : 0;
    return {
      position: "GOL",
      events: input.goalkeeperGames > 0 && input.cleanSheets > 0
        ? [{ label: "Clean sheet no gol", count: input.cleanSheets, value: cleanSheetBonus }]
        : [],
      specialBonus: null,
      grossBonus: cleanSheetBonus,
      cap: null,
      appliedBonus: cleanSheetBonus,
      capReached: false,
    };
  }

  // Posição incorreta — sem bônus
  if (!isCorrectSlot(slotRole, playerProfile)) {
    return {
      position: slotRole,
      events: [],
      specialBonus: null,
      grossBonus: 0,
      cap: null,
      appliedBonus: 0,
      capReached: false,
    };
  }

  // DEF — proteção por partida + Muralha com teto
  if (slotRole === "DEF") {
    const events: PositionBonusEvent[] = [];
    let gross = 0;

    if (input.defensiveCleanGames > 0) {
      const value = Math.round(input.defensiveCleanGames * setting("defCleanSheetBonus", 1.25) * 100) / 100;
      events.push({ label: "Clean sheet", count: input.defensiveCleanGames, value });
      gross += value;
    }
    if (input.defensiveOneGoalGames > 0) {
      const value = Math.round(input.defensiveOneGoalGames * setting("defOneGoalBonus", 0.5) * 100) / 100;
      events.push({ label: "Proteção parcial (1 gol)", count: input.defensiveOneGoalGames, value });
      gross += value;
    }

    const muralhaThreshold = setting("defMuralhaThreshold", DEF_MURALHA_THRESHOLD);
    const muralhaBonus = setting("defMuralhaBonus", 2.5);
    const muralhaActivated = input.defensiveCleanGames >= muralhaThreshold;
    const specialBonus: SpecialBonus = {
      name: "Muralha",
      activated: muralhaActivated,
      value: muralhaActivated ? muralhaBonus : 0,
      progress: muralhaActivated ? null : `${input.defensiveCleanGames}/${muralhaThreshold} clean sheets`,
    };
    if (muralhaActivated) {
      gross += muralhaBonus;
    }

    const cap = setting("defBonusCap", 8);
    const applied = Math.min(gross, cap);
    return {
      position: "DEF",
      events,
      specialBonus,
      grossBonus: Math.round(gross * 100) / 100,
      cap,
      appliedBonus: Math.round(applied * 100) / 100,
      capReached: gross > cap,
    };
  }

  // MEI — bônus por assistência + Maestro, com teto
  if (slotRole === "MEI") {
    const events: PositionBonusEvent[] = [];
    let gross = 0;

    if (input.assists > 0) {
      const value = input.assists * setting("meiAssistBonus", 0.75);
      events.push({ label: "Bônus assistência", count: input.assists, value });
      gross += value;
    }

    const maestroThreshold = setting("meiMaestroThreshold", MEI_MAESTRO_THRESHOLD);
    const maestroBonus = setting("meiMaestroBonus", 2.5);
    const maestroActivated = input.assists >= maestroThreshold;
    const specialBonus: SpecialBonus = {
      name: "Maestro",
      activated: maestroActivated,
      value: maestroActivated ? maestroBonus : 0,
      progress: maestroActivated ? null : `${input.assists}/${maestroThreshold} assistências`,
    };
    if (maestroActivated) {
      gross += maestroBonus;
    }

    return {
      position: "MEI",
      events,
      specialBonus,
      grossBonus: gross,
      cap: setting("meiBonusCap", 6),
      appliedBonus: Math.min(gross, setting("meiBonusCap", 6)),
      capReached: gross > setting("meiBonusCap", 6),
    };
  }

  if (slotRole === "ALA") {
    const events: PositionBonusEvent[] = [];
    const goalValue = Math.round(input.goals * setting("alaGoalBonus", 0.5) * 100) / 100;
    const assistValue = Math.round(input.assists * setting("alaAssistBonus", 0.5) * 100) / 100;
    const cleanValue = Math.round(input.defensiveCleanGames * setting("alaCleanSheetBonus", 0.5) * 100) / 100;
    const protectedValue = Math.round(input.defensiveOneGoalGames * setting("alaOneGoalBonus", 0.25) * 100) / 100;
    if (input.goals > 0) events.push({ label: "Participação com gol", count: input.goals, value: goalValue });
    if (input.assists > 0) events.push({ label: "Participação com assistência", count: input.assists, value: assistValue });
    if (input.defensiveCleanGames > 0) events.push({ label: "Recomposição com clean sheet", count: input.defensiveCleanGames, value: cleanValue });
    if (input.defensiveOneGoalGames > 0) events.push({ label: "Recomposição com 1 gol sofrido", count: input.defensiveOneGoalGames, value: protectedValue });
    let gross = goalValue + assistValue + cleanValue + protectedValue;
    const attackThreshold = setting("alaAttackThreshold", 2);
    const defenseThreshold = setting("alaDefenseThreshold", 2);
    const vaiEVoltaActivated = input.goals + input.assists >= attackThreshold
      && input.defensiveCleanGames + input.defensiveOneGoalGames >= defenseThreshold;
    const vaiEVoltaBonus = setting("alaVaiEVoltaBonus", 2);
    const specialBonus: SpecialBonus = {
      name: "Vai e Volta",
      activated: vaiEVoltaActivated,
      value: vaiEVoltaActivated ? vaiEVoltaBonus : 0,
      progress: vaiEVoltaActivated ? null : `${Math.min(input.goals + input.assists, attackThreshold)}/${attackThreshold} ataque · ${Math.min(input.defensiveCleanGames + input.defensiveOneGoalGames, defenseThreshold)}/${defenseThreshold} proteção`,
    };
    if (vaiEVoltaActivated) gross += vaiEVoltaBonus;
    const cap = setting("alaBonusCap", 6);
    return {
      position: "ALA",
      events,
      specialBonus,
      grossBonus: Math.round(gross * 100) / 100,
      cap,
      appliedBonus: Math.round(Math.min(gross, cap) * 100) / 100,
      capReached: gross > cap,
    };
  }

  // ATA — bônus por gol + Artilheiro (gol básico +4 já está na base)
  const artilheiroThreshold = setting("ataArtilheiroThreshold", ATA_ARTILHEIRO_THRESHOLD);
  const artilheiroBonus = setting("ataArtilheiroBonus", 2);
  const goalBonus = input.goals * setting("ataGoalBonus", 0.5);
  const artilheiroActivated = input.goals >= artilheiroThreshold;
  const specialBonus: SpecialBonus = {
    name: "Artilheiro",
    activated: artilheiroActivated,
    value: artilheiroActivated ? artilheiroBonus : 0,
    progress: artilheiroActivated ? null : `${input.goals}/${artilheiroThreshold} gols`,
  };
  const gross = goalBonus + (artilheiroActivated ? artilheiroBonus : 0);
  const cap = setting("ataBonusCap", 4);

  return {
    position: "ATA",
    events: input.goals > 0 ? [{ label: "Bônus por gol", count: input.goals, value: goalBonus }] : [],
    specialBonus,
    grossBonus: gross,
    cap,
    appliedBonus: Math.min(gross, cap),
    capReached: gross > cap,
  };
}

/**
 * Calcula o valor numérico do bônus posicional (compatível com a assinatura
 * existente de calculateFantasyPositionPackageBonus).
 */
export function calculatePositionBonusValue(input: PositionBreakdownInput): number {
  return calculatePositionBreakdown(input).appliedBonus;
}
