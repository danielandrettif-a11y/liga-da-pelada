"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import type { Player, CreatePlayerInput, PlayerProfile } from "../types";
import { getActiveSeasonRoundIds } from "./seasons";
import { getAdminClient, getCurrentAccount } from "../auth";

const AVATAR_BUCKET = "player-avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function revalidatePlayerPaths(id?: string) {
  revalidatePath("/");
  revalidatePath("/jogadores");
  revalidatePath("/ranking");
  revalidatePath("/admin/jogadores");
  revalidatePath("/admin/rodada");
  if (id) revalidatePath(`/jogadores/${id}`);
}

function avatarPathFromUrl(avatarUrl: string | null) {
  if (!avatarUrl) return null;

  try {
    const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
    const pathname = new URL(avatarUrl).pathname;
    const markerIndex = pathname.indexOf(marker);
    return markerIndex >= 0
      ? decodeURIComponent(pathname.slice(markerIndex + marker.length))
      : null;
  } catch {
    return null;
  }
}

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

  const roundIds = await getActiveSeasonRoundIds();
  const statsResult = roundIds.length > 0
    ? await supabase.from("player_round_stats").select("*").in("round_id", roundIds)
    : { data: [], error: null };
  const { data: stats, error: statsError } = statsResult;

  const finishedRoundsResult = roundIds.length > 0
    ? await supabase.from("rounds").select("id").in("id", roundIds).eq("status", "finished")
    : { data: [], error: null };
  const finishedRoundIds = finishedRoundsResult.data?.map((round) => round.id) || [];
  const attendanceResult = finishedRoundIds.length > 0
    ? await supabase.from("round_players").select("player_id, round_id").in("round_id", finishedRoundIds)
    : { data: [], error: null };
  const { data: attendance, error: attendanceError } = attendanceResult;

  if (statsError) {
    console.error("Erro ao buscar estatísticas:", statsError);
    return [];
  }

  // Agrega as estatísticas por jogador
  if (finishedRoundsResult.error || attendanceError) {
    console.error("Erro ao buscar presencas:", finishedRoundsResult.error || attendanceError);
    return [];
  }

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
      rounds: new Set(
        attendance
          .filter((entry) => entry.player_id === player.id)
          .map((entry) => entry.round_id)
      ).size,
      ...aggregated,
    };
  });

  return playersWithStats.sort((a, b) => b.points - a.points);
}

export async function getPlayerRoundHistory(playerId: string) {
  const roundIds = await getActiveSeasonRoundIds();
  if (roundIds.length === 0) return [];

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
    .in("round_id", roundIds)
    .order("rounds(number)", { ascending: false });

  if (error) {
    console.error("Erro ao buscar histórico do jogador:", error);
    return [];
  }

  return data;
}

export async function getPlayerGoalkeeperAwards(playerId: string) {
  const { data, error } = await supabase
    .from("rounds")
    .select("id, number, date")
    .eq("best_goalkeeper_player_id", playerId)
    .eq("status", "finished")
    .order("date", { ascending: false });

  if (error) {
    console.error("Erro ao buscar premios de melhor goleiro:", error);
    return [];
  }

  return data || [];
}

export async function createPlayer(input: CreatePlayerInput) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem criar jogadores." };

  const { data, error } = await client
    .from("players")
    .insert([
      {
        name: input.name,
        nickname: input.nickname || null,
        avatar_url: input.avatar_url || null,
        player_profile: input.player_profile || "midfield",
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar jogador:", error);
    return { success: false, error: error.message };
  }

  revalidatePlayerPaths(data.id);
  return { success: true, data };
}

export async function updatePlayer(id: string, input: Partial<CreatePlayerInput>) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem editar outros jogadores." };

  const safeInput = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.nickname !== undefined ? { nickname: input.nickname.trim() || null } : {}),
    ...(input.avatar_url !== undefined ? { avatar_url: input.avatar_url || null } : {}),
    ...(input.player_profile !== undefined ? { player_profile: input.player_profile } : {}),
  };

  const { data, error } = await client
    .from("players")
    .update(safeInput)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Erro ao atualizar jogador:", error);
    return { success: false, error: error.message };
  }

  revalidatePlayerPaths(id);
  return { success: true, data };
}

export async function savePlayer(playerId: string | null, formData: FormData) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Sessão expirada. Entre novamente." };

  const ownsPlayer = !!playerId && account.profile?.player_id === playerId;
  if (!account.isAdmin && !ownsPlayer) {
    return { success: false, error: "Você só pode editar o seu próprio perfil." };
  }
  if (!playerId && !account.isAdmin) {
    return { success: false, error: "Somente administradores podem criar jogadores." };
  }
  const client = account.client;

  const name = String(formData.get("name") || "").trim();
  const nickname = String(formData.get("nickname") || "").trim();
  const playerProfile = String(formData.get("player_profile") || "midfield") as PlayerProfile;
  const removeAvatar = formData.get("remove_avatar") === "true";
  const avatar = formData.get("avatar");
  const hasNewAvatar = avatar instanceof File && avatar.size > 0;

  if (!["offensive", "midfield", "defensive"].includes(playerProfile)) {
    return { success: false, error: "Escolha um perfil de jogo valido." };
  }

  if (!name) return { success: false, error: "O nome é obrigatório." };
  if (name.length > 120) return { success: false, error: "O nome deve ter no máximo 120 caracteres." };
  if (nickname.length > 60) return { success: false, error: "O apelido deve ter no máximo 60 caracteres." };

  if (hasNewAvatar) {
    if (!AVATAR_EXTENSIONS[avatar.type]) {
      return { success: false, error: "Use uma imagem JPG, PNG ou WebP." };
    }
    if (avatar.size > MAX_AVATAR_SIZE) {
      return { success: false, error: "A foto deve ter no máximo 5 MB." };
    }
  }

  let currentAvatarUrl: string | null = null;
  const id = playerId || crypto.randomUUID();

  if (playerId) {
    const { data: currentPlayer, error: currentPlayerError } = await client
      .from("players")
      .select("avatar_url")
      .eq("id", playerId)
      .single();

    if (currentPlayerError) {
      return { success: false, error: "Jogador não encontrado." };
    }
    currentAvatarUrl = currentPlayer.avatar_url;
  }

  let uploadedPath: string | null = null;
  let nextAvatarUrl = removeAvatar ? null : currentAvatarUrl;

  if (hasNewAvatar) {
    const extension = AVATAR_EXTENSIONS[avatar.type];
    uploadedPath = `${id}/${crypto.randomUUID()}.${extension}`;
    const bytes = await avatar.arrayBuffer();
    const { error: uploadError } = await client.storage
      .from(AVATAR_BUCKET)
      .upload(uploadedPath, bytes, {
        contentType: avatar.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Erro ao enviar foto do jogador:", uploadError);
      return { success: false, error: `Não foi possível enviar a foto: ${uploadError.message}` };
    }

    nextAvatarUrl = client.storage.from(AVATAR_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
  }

  const playerData = {
    id,
    name,
    nickname: nickname || null,
    avatar_url: nextAvatarUrl,
    player_profile: playerProfile,
  };

  const query = playerId
    ? client.from("players").update({
        name: playerData.name,
        nickname: playerData.nickname,
        avatar_url: playerData.avatar_url,
        player_profile: playerData.player_profile,
      }).eq("id", id)
    : client.from("players").insert([playerData]);

  const { error: saveError } = await query;

  if (saveError) {
    if (uploadedPath) await client.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
    console.error("Erro ao salvar jogador:", saveError);
    return { success: false, error: saveError.message };
  }

  const oldAvatarPath = avatarPathFromUrl(currentAvatarUrl);
  if ((hasNewAvatar || removeAvatar) && oldAvatarPath && oldAvatarPath !== uploadedPath) {
    const { error: cleanupError } = await client.storage.from(AVATAR_BUCKET).remove([oldAvatarPath]);
    if (cleanupError) console.error("Erro ao remover foto antiga:", cleanupError);
  }

  revalidatePlayerPaths(id);
  return { success: true, data: { id } };
}

export async function deletePlayer(id: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem excluir jogadores." };

  const { data: player } = await client
    .from("players")
    .select("avatar_url")
    .eq("id", id)
    .single();

  const { error } = await client
    .from("players")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Erro ao deletar jogador:", error);
    return { success: false, error: error.message };
  }

  const avatarPath = avatarPathFromUrl(player?.avatar_url || null);
  if (avatarPath) {
    const { error: storageError } = await client.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    if (storageError) console.error("Erro ao remover foto do jogador:", storageError);
  }

  revalidatePlayerPaths(id);
  return { success: true };
}
