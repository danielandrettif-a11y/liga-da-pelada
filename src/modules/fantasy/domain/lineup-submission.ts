import type { FantasyLineupSlot } from "@/lib/fantasy/lineup-positions";
import type { FantasyReserveRole } from "@/lib/fantasy/reserve";

export type FantasyLineupSubmission = {
  fantasySeasonId: string;
  roundId: string | null;
  playerIds: string[];
  slotAssignments: FantasyLineupSlot[];
  captainId: string | null;
  scorerId: string | null;
  assistId: string | null;
  challengeId: string | null;
  reservePlayerId: string | null;
  reserveRole: FantasyReserveRole | null;
};

export function validateFantasyLineupSubmission(
  input: FantasyLineupSubmission,
  maxPlayers: number,
): string | null {
  if (input.playerIds.length !== maxPlayers || !input.captainId) {
    return `Para salvar a escalação, escolha exatamente ${maxPlayers} jogadores e um capitão.`;
  }
  if (input.playerIds.length > maxPlayers || new Set(input.playerIds).size !== input.playerIds.length) {
    return `A escalação enviada é inválida. Aceita no máximo ${maxPlayers} jogadores.`;
  }
  if (Boolean(input.reservePlayerId) !== Boolean(input.reserveRole)) {
    return "Escolha o jogador e a posição do banco de reserva.";
  }
  if (input.reserveRole && !(["GOL", "DEF", "ATA"] as const).includes(input.reserveRole)) {
    return "A posição do banco de reserva é inválida.";
  }
  if (input.reservePlayerId && input.playerIds.includes(input.reservePlayerId)) {
    return "O jogador do banco não pode estar entre os titulares.";
  }
  const slots = input.slotAssignments;
  const validSlots = slots.length === input.playerIds.length
    && new Set(slots.map((slot) => slot.playerId)).size === input.playerIds.length
    && new Set(slots.map((slot) => slot.slotIndex)).size === input.playerIds.length
    && slots.every((slot) => input.playerIds.includes(slot.playerId)
      && Number.isInteger(slot.slotIndex) && slot.slotIndex >= 0
      && ["GOL", "DEF", "ATA"].includes(slot.slotRole));
  if (!validSlots) return "As posições da escalação são inválidas. Ajuste o time e tente novamente.";
  return null;
}

export function lineupSlotsForDatabase(input: FantasyLineupSubmission) {
  return input.slotAssignments.map((slot) => ({
    player_id: slot.playerId,
    slot_index: slot.slotIndex,
    slot_role: slot.slotRole,
  }));
}
