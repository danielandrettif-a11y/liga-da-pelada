"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { buildAwardSeasonsByPlayer } from "../awards";
import type { Player, CreatePlayerInput, MemberCategory, PlayerProfile, RoundType, SeasonStatus } from "../types";
import { getActiveSeason, getActiveSeasonRoundIds } from "./seasons";
import { getAdminClient, getCurrentAccount } from "../auth";
import { TEAM_PRESETS } from "../teamPresets";

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
  revalidatePath("/admin/prelistas");
  revalidatePath("/cartola");
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

export async function getPlayers(selectableOnly = false) {
  let query = supabase
    .from("players")
    .select("*")
    .order("name");
  if (selectableOnly) query = query.eq("is_selectable", true).in("member_category", ["player", "guest"]);
  const { data, error } = await query;

  if (error) {
    console.error("Erro ao buscar jogadores:", error);
    return [];
  }

  return data as Player[];
}

export async function getPlayer(id: string) {
  const { data, error } = await supabase
    .from("players")
    .select(`
      id,
      name,
      nickname,
      avatar_url,
      profile_bio,
      player_profile,
      is_goalkeeper,
      member_category,
      is_selectable,
      registration_source,
      created_at
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Erro ao buscar jogador:", error);
    return null;
  }

  return data as Player;
}

export async function getPlayersWithStats(roundType: RoundType = "official", selectableOnly = false) {
  const season = await getActiveSeason();

  // 1. Tentar buscar jogadores e stats agregados via View SQL
  if (season) {
    const playersQuery = selectableOnly
      ? supabase
          .from("players")
          .select("*")
          .eq("is_selectable", true)
          .in("member_category", ["player", "guest"])
          .order("name")
      : supabase.from("players").select("*").order("name");

    const statsQuery = supabase
      .from("player_season_stats")
      .select(`
        player_id,
        rounds_count,
        games,
        goals,
        assists,
        wins,
        draws,
        losses,
        points
      `)
      .eq("season_id", season.id)
      .eq("round_type", roundType);

    const [playersResult, statsResult] = await Promise.all([playersQuery, statsQuery]);

    if (!playersResult.error && !statsResult.error && playersResult.data) {
      const statsMap = new Map<string, any>();
      for (const stat of statsResult.data || []) {
        statsMap.set(stat.player_id, stat);
      }

      const playersWithStats = (playersResult.data as Player[]).map((player) => {
        const stat = statsMap.get(player.id);
        return {
          ...player,
          rounds: Number(stat?.rounds_count || 0),
          games: Number(stat?.games || 0),
          goals: Number(stat?.goals || 0),
          assists: Number(stat?.assists || 0),
          wins: Number(stat?.wins || 0),
          draws: Number(stat?.draws || 0),
          losses: Number(stat?.losses || 0),
          points: Number(stat?.points || 0),
        };
      });

      return playersWithStats.sort((a, b) => b.points - a.points);
    }
  }

  // Fallback seguro se a view ainda não estiver criada no banco
  const [playersResult, roundIds] = await Promise.all([
    selectableOnly
      ? supabase.from("players").select("*").eq("is_selectable", true).in("member_category", ["player", "guest"])
      : supabase.from("players").select("*"),
    getActiveSeasonRoundIds(season?.league_id, roundType),
  ]);
  const { data: players, error: playersError } = playersResult;

  if (playersError || !players) {
    if (playersError) console.error("Erro ao buscar jogadores:", playersError);
    return [];
  }

  const [statsResult, finishedRoundsResult] = roundIds.length > 0
    ? await Promise.all([
      supabase.from("player_round_stats").select("*").in("round_id", roundIds),
      supabase.from("rounds").select("id").in("id", roundIds).eq("status", "finished"),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const { data: stats, error: statsError } = statsResult;

  const finishedRoundIds = finishedRoundsResult.data?.map((round) => round.id) || [];
  const attendanceResult = finishedRoundIds.length > 0
    ? await supabase.from("round_players").select("player_id, round_id").in("round_id", finishedRoundIds)
    : { data: [], error: null };
  const { data: attendance, error: attendanceError } = attendanceResult;

  if (statsError || finishedRoundsResult.error || attendanceError) {
    console.error("Erro ao buscar dados complementares de jogadores:", statsError || finishedRoundsResult.error || attendanceError);
    return [];
  }

  const statsByPlayer = new Map<string, typeof stats>();
  for (const stat of stats || []) {
    const playerStats = statsByPlayer.get(stat.player_id) || [];
    playerStats.push(stat);
    statsByPlayer.set(stat.player_id, playerStats);
  }
  const roundsByPlayer = new Map<string, Set<string>>();
  for (const entry of attendance || []) {
    const playerRounds = roundsByPlayer.get(entry.player_id) || new Set<string>();
    playerRounds.add(entry.round_id);
    roundsByPlayer.set(entry.player_id, playerRounds);
  }

  const playersWithStats = players.map((player) => {
    const playerStats = statsByPlayer.get(player.id) || [];
    
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
      rounds: roundsByPlayer.get(player.id)?.size || 0,
      ...aggregated,
    };
  });

  return playersWithStats.sort((a, b) => b.points - a.points);
}

export async function getPlayerRoundHistory(playerId: string, roundType: RoundType = "official") {
  const roundIds = await getActiveSeasonRoundIds(undefined, roundType);
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

export type PlayerClubGoals = {
  key: string;
  name: string;
  color: string;
  crestUrl: string | null;
  officialGoals: number;
  friendlyGoals: number;
  totalGoals: number;
};

export async function getPlayerGoalsByClub(playerId: string): Promise<PlayerClubGoals[]> {
  const { data, error } = await supabase
    .from("match_events")
    .select(`
      team:team_id (id, name, color, crest_url),
      match:match_id!inner (
        round:round_id!inner (round_type)
      )
    `)
    .eq("player_id", playerId)
    .eq("event_type", "goal");

  if (error) {
    console.error("Erro ao buscar gols por clube:", error);
    return [];
  }

  const goalsByClub = new Map<string, PlayerClubGoals>();
  for (const event of (data || []) as any[]) {
    const team = event.team;
    if (!team) continue;
    const preset = TEAM_PRESETS.find((item) => item.crestUrl && item.crestUrl === team.crest_url);
    const key = team.crest_url || `legacy:${String(team.name).toLocaleLowerCase("pt-BR")}:${team.color}`;
    const current = goalsByClub.get(key) || {
      key,
      name: preset?.name || team.name,
      color: preset?.color || team.color,
      crestUrl: team.crest_url || null,
      officialGoals: 0,
      friendlyGoals: 0,
      totalGoals: 0,
    };
    const roundType = event.match?.round?.round_type === "friendly" ? "friendly" : "official";
    if (roundType === "friendly") current.friendlyGoals += 1;
    else current.officialGoals += 1;
    current.totalGoals += 1;
    goalsByClub.set(key, current);
  }

  return [...goalsByClub.values()].sort((a, b) => b.totalGoals - a.totalGoals || a.name.localeCompare(b.name, "pt-BR"));
}

export async function getPlayerAwardSeasons(playerId: string) {
  const [seasonsResult, roundsResult] = await Promise.all([
    supabase.from("seasons").select("id, number, status"),
    supabase
      .from("rounds")
      .select("id, number, date, season_id, best_goalkeeper_player_id, round_type")
      .eq("status", "finished")
      .eq("round_type", "official")
      .order("date", { ascending: false }),
  ]);

  if (seasonsResult.error || roundsResult.error) {
    console.error("Erro ao buscar histórico de insígnias:", seasonsResult.error || roundsResult.error);
    return [];
  }

  const rounds = roundsResult.data || [];
  if (rounds.length === 0) return [];

  const { data: stats, error: statsError } = await supabase
    .from("player_round_stats")
    .select("round_id, player_id, goals, assists, games")
    .in("round_id", rounds.map((round) => round.id));

  if (statsError) {
    console.error("Erro ao calcular histórico de insígnias:", statsError);
    return [];
  }

  const seasonsById = new Map((seasonsResult.data || []).map((season) => [season.id, season]));
  const awardSeasons = buildAwardSeasonsByPlayer(
    rounds.flatMap((round) => {
      const season = seasonsById.get(round.season_id);
      return season ? [{
        id: round.id,
        number: round.number,
        date: round.date,
        seasonId: season.id,
        seasonNumber: season.number,
        seasonStatus: season.status as SeasonStatus,
        bestGoalkeeperPlayerId: round.best_goalkeeper_player_id,
      }] : [];
    }),
    stats || [],
  );

  return awardSeasons.get(playerId) || [];
}

export async function createPlayer(input: CreatePlayerInput) {
  const account = await getCurrentAccount();
  const client = account.isAdmin ? account.client : null;
  if (!client || !account.user) return { success: false, error: "Somente administradores podem criar jogadores." };

  const { data, error } = await client
    .from("players")
    .insert([
      {
        name: input.name,
        nickname: input.nickname || null,
        avatar_url: input.avatar_url || null,
        player_profile: input.player_profile || "midfield",
        is_goalkeeper: false,
        member_category: input.member_category || "player",
        is_selectable: input.member_category === "wag" || input.member_category === "supporter"
          ? false
          : true,
        registration_source: "admin",
        created_by_user_id: account.user.id,
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
    ...(input.member_category !== undefined ? { member_category: input.member_category } : {}),
    ...(input.is_selectable !== undefined ? { is_selectable: input.is_selectable } : {}),
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
  const profileBio = String(formData.get("profile_bio") || "").trim();
  const playerProfile = String(formData.get("player_profile") || "midfield") as PlayerProfile;
  const requestedCategory = String(formData.get("member_category") || "player") as MemberCategory;
  const requestedSelectable = formData.get("is_selectable") !== "false";
  const removeAvatar = formData.get("remove_avatar") === "true";
  const avatar = formData.get("avatar");
  const hasNewAvatar = avatar instanceof File && avatar.size > 0;

  if (!["player", "guest", "wag", "supporter"].includes(requestedCategory)) {
    return { success: false, error: "Escolha uma categoria valida." };
  }
  if (!["offensive", "midfield", "defensive"].includes(playerProfile)) {
    return { success: false, error: "Escolha um perfil de jogo valido." };
  }

  if (!name) return { success: false, error: "O nome é obrigatório." };
  if (name.length > 120) return { success: false, error: "O nome deve ter no máximo 120 caracteres." };
  if (nickname.length > 60) return { success: false, error: "O apelido deve ter no máximo 60 caracteres." };
  if (profileBio.length > 500) return { success: false, error: "O texto do perfil deve ter no máximo 500 caracteres." };

  if (hasNewAvatar) {
    if (!AVATAR_EXTENSIONS[avatar.type]) {
      return { success: false, error: "Use uma imagem JPG, PNG ou WebP." };
    }
    if (avatar.size > MAX_AVATAR_SIZE) {
      return { success: false, error: "A foto deve ter no máximo 5 MB." };
    }
  }

  let currentAvatarUrl: string | null = null;
  let currentCategory: MemberCategory = "player";
  let currentSelectable = true;
  let currentPlayerProfile: PlayerProfile | null = "midfield";
  let currentIsGoalkeeper = false;
  const id = playerId || crypto.randomUUID();

  if (playerId) {
    const { data: currentPlayer, error: currentPlayerError } = await client
      .from("players")
      .select("avatar_url, member_category, is_selectable, player_profile, is_goalkeeper")
      .eq("id", playerId)
      .single();

    if (currentPlayerError) {
      return { success: false, error: "Jogador não encontrado." };
    }
    currentAvatarUrl = currentPlayer.avatar_url;
    currentCategory = currentPlayer.member_category as MemberCategory;
    currentSelectable = currentPlayer.is_selectable;
    currentPlayerProfile = currentPlayer.player_profile as PlayerProfile | null;
    currentIsGoalkeeper = Boolean(currentPlayer.is_goalkeeper);
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

  const memberCategory = account.isAdmin ? requestedCategory : currentCategory;
  const isSelectable = account.isAdmin
    ? (memberCategory === "wag" || memberCategory === "supporter" ? false : memberCategory === "guest" ? true : requestedSelectable)
    : currentSelectable;
  const playerData = {
    id,
    name,
    nickname: nickname || null,
    ...(account.isAdmin ? { profile_bio: profileBio || null } : {}),
    avatar_url: nextAvatarUrl,
    player_profile: memberCategory === "wag" || memberCategory === "supporter"
      ? null
      : playerProfile,
    // GOL deixou de ser uma tag de perfil. Mantemos o valor legado apenas para
    // o histórico operacional de partidas, sem expor ou editar pelo app.
    is_goalkeeper: memberCategory === "wag" || memberCategory === "supporter"
      ? false
      : currentIsGoalkeeper,
    member_category: memberCategory,
    is_selectable: isSelectable,
    ...(playerId ? {} : { registration_source: "admin", created_by_user_id: account.user.id }),
  };

  const query = playerId
    ? client.from("players").update({
        name: playerData.name,
        nickname: playerData.nickname,
        ...(account.isAdmin ? { profile_bio: playerData.profile_bio } : {}),
        avatar_url: playerData.avatar_url,
        player_profile: playerData.player_profile,
        is_goalkeeper: playerData.is_goalkeeper,
        member_category: playerData.member_category,
        is_selectable: playerData.is_selectable,
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

export async function getRosterGroups(roundType: RoundType = "official") {
  const players = await getPlayersWithStats(roundType);
  return {
    officialPlayers: players.filter((player) => player.member_category === "player"),
    activeGuests: players.filter((player) => player.member_category === "guest"),
    wags: players.filter((player) => player.member_category === "wag"),
    supporters: players.filter((player) => player.member_category === "supporter"),
  };
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
