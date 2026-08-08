"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import type { Player, CreatePlayerInput } from "../types";

export async function getPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .order("name");

  if (error) {
    console.error("Erro ao buscar jogadores:", error);
    return [];
  }

  return data as Player[];
}

export async function getPlayer(id: string) {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Erro ao buscar jogador:", error);
    return null;
  }

  return data as Player;
}

export async function getPlayersWithStats() {
  // Busca jogadores e suas estatísticas agregadas de todas as rodadas
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*");

  if (playersError) {
    console.error("Erro ao buscar jogadores:", playersError);
    return [];
  }

  const { data: stats, error: statsError } = await supabase
    .from("player_round_stats")
    .select("*");

  if (statsError) {
    console.error("Erro ao buscar estatísticas:", statsError);
    return [];
  }

  // Agrega as estatísticas por jogador
  const playersWithStats = players.map((player) => {
    const playerStats = stats.filter((s) => s.player_id === player.id);
    
    const aggregated = playerStats.reduce(
      (acc, curr) => ({
        games: acc.games + curr.games,
        goals: acc.goals + curr.goals,
        assists: acc.assists + curr.assists,
        wins: acc.wins + curr.wins,
        draws: acc.draws + curr.draws,
        losses: acc.losses + curr.losses,
        points: acc.points + curr.points,
      }),
      { games: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, points: 0 }
    );

    return {
      ...player,
      ...aggregated,
    };
  });

  return playersWithStats.sort((a, b) => b.points - a.points);
}

export async function getPlayerRoundHistory(playerId: string) {
  const { data, error } = await supabase
    .from("player_round_stats")
    .select(`
      *,
      rounds (
        number,
        date
      )
    `)
    .eq("player_id", playerId)
    .order("rounds(number)", { ascending: false });

  if (error) {
    console.error("Erro ao buscar histórico do jogador:", error);
    return [];
  }

  return data;
}

export async function createPlayer(input: CreatePlayerInput) {
  const { data, error } = await supabase
    .from("players")
    .insert([
      {
        name: input.name,
        nickname: input.nickname || null,
        avatar_url: input.avatar_url || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar jogador:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/jogadores");
  revalidatePath("/admin/jogadores");
  return { success: true, data };
}

export async function updatePlayer(id: string, input: Partial<CreatePlayerInput>) {
  const { data, error } = await supabase
    .from("players")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Erro ao atualizar jogador:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/jogadores");
  revalidatePath(`/jogadores/${id}`);
  revalidatePath("/admin/jogadores");
  return { success: true, data };
}

export async function deletePlayer(id: string) {
  const { error } = await supabase
    .from("players")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Erro ao deletar jogador:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/jogadores");
  revalidatePath("/admin/jogadores");
  return { success: true };
}
