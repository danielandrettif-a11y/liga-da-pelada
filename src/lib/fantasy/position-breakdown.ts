/**
 * Breakdown autoritativo da pontuação por posição — BQ v5.
 *
 * Usado na prévia ao vivo, processamento final e histórico para garantir
 * uma representação única e consistente em todas as interfaces.
 */

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
// Constantes BQ v5
// ---------------------------------------------------------------------------

/** Teto do bônus posicional DEF por rodada. */
const DEF_BONUS_CAP = 10;

/** Clean sheet por partida para DEF (excluindo partidas como goleiro). */
const DEF_CLEAN_SHEET_BONUS = 1.5;
/** Partida com exatamente 1 gol sofrido para DEF. */
const DEF_ONE_GOAL_BONUS = 0.5;
/** Bônus Muralha: ≥3 clean sheets na rodada. */
const DEF_MURALHA_THRESHOLD = 3;
const DEF_MURALHA_BONUS = 3;

/** Bônus por assistência para MEI (além dos +2.5 básicos). */
const MEI_ASSIST_BONUS = 1;
/** Maestro: ≥2 assistências na rodada. */
const MEI_MAESTRO_THRESHOLD = 2;
const MEI_MAESTRO_BONUS = 3;

/** Artilheiro: ≥2 gols na rodada. */
const ATA_ARTILHEIRO_THRESHOLD = 2;
const ATA_ARTILHEIRO_BONUS = 3;

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
  return playerProfile === "offensive";
}

/**
 * Calcula o breakdown completo do bônus posicional para um atleta.
 */
export function calculatePositionBreakdown(input: PositionBreakdownInput): PositionBonusBreakdown {
  const { slotRole, playerProfile } = input;

  // GOL — clean sheet quando realmente atuou no gol
  if (slotRole === "GOL") {
    const cleanSheetBonus = input.goalkeeperGames > 0 ? input.cleanSheets * GOL_CLEAN_SHEET_BONUS : 0;
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
      const value = Math.round(input.defensiveCleanGames * DEF_CLEAN_SHEET_BONUS * 100) / 100;
      events.push({ label: "Clean sheet", count: input.defensiveCleanGames, value });
      gross += value;
    }
    if (input.defensiveOneGoalGames > 0) {
      const value = Math.round(input.defensiveOneGoalGames * DEF_ONE_GOAL_BONUS * 100) / 100;
      events.push({ label: "Proteção parcial (1 gol)", count: input.defensiveOneGoalGames, value });
      gross += value;
    }

    const muralhaActivated = input.defensiveCleanGames >= DEF_MURALHA_THRESHOLD;
    const specialBonus: SpecialBonus = {
      name: "Muralha",
      activated: muralhaActivated,
      value: muralhaActivated ? DEF_MURALHA_BONUS : 0,
      progress: muralhaActivated ? null : `${input.defensiveCleanGames}/${DEF_MURALHA_THRESHOLD} clean sheets`,
    };
    if (muralhaActivated) {
      gross += DEF_MURALHA_BONUS;
    }

    const applied = Math.min(gross, DEF_BONUS_CAP);
    return {
      position: "DEF",
      events,
      specialBonus,
      grossBonus: Math.round(gross * 100) / 100,
      cap: DEF_BONUS_CAP,
      appliedBonus: Math.round(applied * 100) / 100,
      capReached: gross > DEF_BONUS_CAP,
    };
  }

  // MEI — +1 por assistência + Maestro
  if (slotRole === "MEI") {
    const events: PositionBonusEvent[] = [];
    let gross = 0;

    if (input.assists > 0) {
      const value = input.assists * MEI_ASSIST_BONUS;
      events.push({ label: "Bônus assistência", count: input.assists, value });
      gross += value;
    }

    const maestroActivated = input.assists >= MEI_MAESTRO_THRESHOLD;
    const specialBonus: SpecialBonus = {
      name: "Maestro",
      activated: maestroActivated,
      value: maestroActivated ? MEI_MAESTRO_BONUS : 0,
      progress: maestroActivated ? null : `${input.assists}/${MEI_MAESTRO_THRESHOLD} assistências`,
    };
    if (maestroActivated) {
      gross += MEI_MAESTRO_BONUS;
    }

    return {
      position: "MEI",
      events,
      specialBonus,
      grossBonus: gross,
      cap: null,
      appliedBonus: gross,
      capReached: false,
    };
  }

  // ATA — somente Artilheiro (gol básico +4 já está na base)
  const artilheiroActivated = input.goals >= ATA_ARTILHEIRO_THRESHOLD;
  const specialBonus: SpecialBonus = {
    name: "Artilheiro",
    activated: artilheiroActivated,
    value: artilheiroActivated ? ATA_ARTILHEIRO_BONUS : 0,
    progress: artilheiroActivated ? null : `${input.goals}/${ATA_ARTILHEIRO_THRESHOLD} gols`,
  };
  const gross = artilheiroActivated ? ATA_ARTILHEIRO_BONUS : 0;

  return {
    position: "ATA",
    events: [],
    specialBonus,
    grossBonus: gross,
    cap: null,
    appliedBonus: gross,
    capReached: false,
  };
}

/**
 * Calcula o valor numérico do bônus posicional (compatível com a assinatura
 * existente de calculateFantasyPositionPackageBonus).
 */
export function calculatePositionBonusValue(input: PositionBreakdownInput): number {
  return calculatePositionBreakdown(input).appliedBonus;
}
