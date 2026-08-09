"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getCurrentAccount } from "../auth";
import type { Player, RoundStatus } from "../types";
import { getActiveSeason } from "./seasons";
import { getActiveLeague } from "./rounds";

export type PaymentRound = {
  id: string;
  number: number;
  date: string;
  status: RoundStatus;
  payment_pix: string | null;
  payment_total: number | null;
};

export type PaymentPlayer = Player & {
  paid: boolean;
  paid_at: string | null;
};

export async function getPaymentRounds(): Promise<PaymentRound[]> {
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return [];

  const { data, error } = await supabase
    .from("rounds")
    .select("id, number, date, status, payment_pix, payment_total")
    .eq("season_id", season.id)
    .order("number", { ascending: false });

  if (error) {
    console.error("Erro ao buscar rodadas para pagamento:", error);
    return [];
  }

  return data as PaymentRound[];
}

export async function getRoundPaymentPlayers(roundId: string): Promise<PaymentPlayer[]> {
  const [{ data: participants, error: participantError }, { data: payments, error: paymentError }] = await Promise.all([
    supabase.from("round_players").select("player_id").eq("round_id", roundId),
    supabase.from("round_payments").select("player_id, paid, paid_at").eq("round_id", roundId),
  ]);

  if (participantError || paymentError) {
    console.error("Erro ao buscar pagamentos:", participantError || paymentError);
    return [];
  }

  const playerIds = participants.map((participant) => participant.player_id);
  if (playerIds.length === 0) return [];

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*")
    .in("id", playerIds)
    .order("name");

  if (playersError) {
    console.error("Erro ao buscar jogadores dos pagamentos:", playersError);
    return [];
  }

  const paymentByPlayer = new Map(payments.map((payment) => [payment.player_id, payment]));
  return (players as Player[]).map((player) => ({
    ...player,
    paid: paymentByPlayer.get(player.id)?.paid || false,
    paid_at: paymentByPlayer.get(player.id)?.paid_at || null,
  }));
}

export async function setPlayerPayment(roundId: string, playerId: string, paid: boolean) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para confirmar pagamentos." };
  const client = account.client;

  const { data: round } = await client
    .from("rounds")
    .select("status")
    .eq("id", roundId)
    .maybeSingle();

  if (round?.status !== "finished") {
    return { success: false, error: "Os pagamentos so podem ser marcados depois do fim da rodada." };
  }

  const { data: participant } = await client
    .from("round_players")
    .select("id")
    .eq("round_id", roundId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (!participant) return { success: false, error: "Este jogador nao participou da rodada." };

  const { error } = await client.from("round_payments").upsert({
    round_id: roundId,
    player_id: playerId,
    paid,
    paid_at: paid ? new Date().toISOString() : null,
  }, { onConflict: "round_id,player_id" });

  if (error) {
    console.error("Erro ao atualizar pagamento:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/pagamentos");
  return { success: true };
}
