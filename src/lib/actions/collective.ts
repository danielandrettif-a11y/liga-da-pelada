"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentAccount } from "../auth";
import { sendPushNotificationsToUsers } from "../push-notifications";
import { createServiceClient } from "../supabase/service";

export type CollectiveSummary = {
  callupId: string;
  roundId: string | null;
  roundNumber: number | null;
  date: string;
  status: string | null;
  unreadCount: number;
};

export type CollectiveMessage = {
  id: string;
  callupId: string;
  senderUserId: string | null;
  senderPlayerId: string | null;
  senderName: string;
  senderAvatarUrl: string | null;
  kind: "text" | "image" | "audio" | "system";
  body: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  duration: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  own: boolean;
  replyTo: { id: string; senderName: string; kind: string; body: string | null } | null;
};

export type CollectiveRoomData = {
  summary: CollectiveSummary;
  messages: CollectiveMessage[];
  isAdmin: boolean;
  currentUserId: string;
  firstUnreadMessageId: string | null;
  lastReadMessageId: string | null;
};

function unreadMessages(rows: any[], userId: string, lastReadMessageId: string | null) {
  const markerIndex = lastReadMessageId ? rows.findIndex((row) => row.id === lastReadMessageId) : -1;
  const candidates = markerIndex >= 0 ? rows.slice(markerIndex + 1) : rows;
  return candidates.filter((row) => row.sender_user_id !== userId && row.kind !== "system" && !row.deleted_at);
}

async function collectiveUnreadState(client: any, callupId: string, userId: string) {
  const { data: read } = await client.from("collective_reads").select("read_at, last_read_message_id").eq("callup_id", callupId).eq("user_id", userId).maybeSingle();
  let query = client.from("collective_messages").select("id, sender_user_id, kind, deleted_at, created_at").eq("callup_id", callupId);
  if (read?.read_at) query = query.gte("created_at", read.read_at);
  const { data: rows } = await query.order("created_at", { ascending: true }).order("id", { ascending: true });
  const unread = unreadMessages(rows || [], userId, read?.last_read_message_id || null);
  return { count: unread.length, firstUnreadMessageId: unread[0]?.id || null, lastReadMessageId: read?.last_read_message_id || null };
}

async function listCollectiveCandidates() {
  const account = await getCurrentAccount();
  if (!account.user) return { account, callups: [] as any[] };
  let callupIds: string[] = [];
  if (account.isAdmin) {
    const { data } = await account.client.from("callups").select("id").order("created_at", { ascending: false }).limit(12);
    callupIds = (data || []).map((row: any) => row.id);
  } else if (account.profile?.player_id) {
    const { data } = await account.client.from("callup_entries").select("callup_id").eq("player_id", account.profile.player_id).order("created_at", { ascending: false }).limit(12);
    callupIds = (data || []).map((row: any) => row.callup_id);
  }
  if (!callupIds.length) return { account, callups: [] as any[] };
  const { data: callups } = await account.client
    .from("callups")
    .select("id, date, created_at, round_id, status, round:round_id(id, number, status, payment_pix, payment_total, round_players(player_id), round_payments(player_id, paid)), team_drafts(id, status)")
    .in("id", [...new Set(callupIds)])
    .order("date", { ascending: false });
  return { account, callups: callups || [] };
}

function isCollectiveOpen(callup: any) {
  const round = Array.isArray(callup.round) ? callup.round[0] : callup.round;
  // Antes dos times serem confirmados, a Coletiva fica exclusivamente dentro
  // da Convocação. Só então ela substitui o Elenco no menu inferior.
  if (callup.status !== "converted") return false;
  if (!round || round.status !== "finished") return true;
  if (!round.payment_pix || Number(round.payment_total) <= 0) return false;
  const payments = round.round_payments || [];
  const paidIds = new Set(payments.filter((payment: any) => payment.paid).map((payment: any) => payment.player_id));
  return (round.round_players || []).some((participant: any) => !paidIds.has(participant.player_id));
}

export async function getActiveCollectiveSummary(): Promise<CollectiveSummary | null> {
  const { account, callups } = await listCollectiveCandidates();
  if (!account.user) return null;
  const callup = callups.find(isCollectiveOpen);
  if (!callup) return null;
  const round = Array.isArray(callup.round) ? callup.round[0] : callup.round;
  const unreadCount = (await collectiveUnreadState(account.client, callup.id, account.user.id)).count;
  return { callupId: callup.id, roundId: round?.id || callup.round_id || null, roundNumber: round?.number || null, date: callup.date, status: round?.status || null, unreadCount };
}

export async function getCollectiveRoom(callupId?: string): Promise<CollectiveRoomData | null> {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const summary = callupId
    ? await (async () => {
        const { data: callup } = await account.client.from("callups").select("id, date, round_id, round:round_id(id, number, status)").eq("id", callupId).maybeSingle();
        if (!callup) return null;
        const { data: allowed } = await account.client.rpc("can_access_collective", { p_callup_id: callupId });
        if (!allowed) return null;
        const round: any = Array.isArray(callup.round) ? callup.round[0] : callup.round;
        return { callupId, roundId: round?.id || callup.round_id || null, roundNumber: round?.number || null, date: callup.date, status: round?.status || null, unreadCount: 0 };
      })()
    : await getActiveCollectiveSummary();
  if (!summary) return null;
  const [{ data: descendingRows, error }, readState] = await Promise.all([account.client
    .from("collective_messages")
    .select("*, sender:sender_player_id(name, avatar_url)")
    .eq("callup_id", summary.callupId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(300), collectiveUnreadState(account.client, summary.callupId, account.user.id)]);
  if (error) return null;
  const rows = [...(descendingRows || [])].reverse();
  summary.unreadCount = readState.count;
  const replyIds = [...new Set((rows || []).map((row: any) => row.reply_to_message_id).filter(Boolean))];
  const replyById = new Map<string, any>();
  if (replyIds.length) {
    const { data: replies } = await account.client.from("collective_messages").select("id, kind, body, deleted_at, sender:sender_player_id(name)").in("id", replyIds);
    (replies || []).forEach((reply: any) => replyById.set(reply.id, reply));
  }
  const mediaPaths = (rows || []).map((row: any) => row.media_path).filter(Boolean);
  const signedByPath = new Map<string, string>();
  if (mediaPaths.length) {
    const { data: signed } = await account.client.storage.from("collective-media").createSignedUrls(mediaPaths, 3600);
    (signed || []).forEach((item: any, index: number) => {
      if (item.signedUrl) signedByPath.set(mediaPaths[index], item.signedUrl);
    });
  }
  const messages: CollectiveMessage[] = (rows || []).map((row: any) => {
    const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
    const reply = row.reply_to_message_id ? replyById.get(row.reply_to_message_id) : null;
    const replySender = Array.isArray(reply?.sender) ? reply.sender[0] : reply?.sender;
    return {
      id: row.id,
      callupId: row.callup_id,
      senderUserId: row.sender_user_id,
      senderPlayerId: row.sender_player_id,
      senderName: row.kind === "system" ? "Draft BQ" : sender?.name || "Usuário",
      senderAvatarUrl: sender?.avatar_url || null,
      kind: row.kind,
      body: row.body,
      mediaUrl: row.media_path ? signedByPath.get(row.media_path) || null : null,
      mediaMime: row.media_mime,
      duration: row.audio_duration_seconds,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      own: row.sender_user_id === account.user!.id,
      replyTo: reply ? { id: reply.id, senderName: replySender?.name || "Usuário", kind: reply.kind, body: reply.deleted_at ? "Mensagem removida" : reply.body } : null,
    };
  });
  return { summary, messages, isAdmin: account.isAdmin, currentUserId: account.user.id, firstUnreadMessageId: readState.firstUnreadMessageId, lastReadMessageId: readState.lastReadMessageId };
}

async function pushCollectiveMessage(callupId: string, senderUserId: string, senderPlayerId: string, fallbackSenderName: string, kind: string, body: string | null) {
  const service = createServiceClient();
  if (!service) return;
  const [{ data: entries }, { data: sender }] = await Promise.all([
    service.from("callup_entries").select("player_id").eq("callup_id", callupId),
    service.from("players").select("name").eq("id", senderPlayerId).maybeSingle(),
  ]);
  const playerIds = [...new Set((entries || []).map((entry: any) => entry.player_id).filter(Boolean))];
  const [{ data: participants }, { data: admins }] = await Promise.all([
    playerIds.length ? service.from("account_profiles").select("user_id").in("player_id", playerIds) : Promise.resolve({ data: [] as any[] }),
    service.from("account_profiles").select("user_id").eq("role", "admin"),
  ]);
  const userIds = [...new Set([...(participants || []), ...(admins || [])].map((row: any) => row.user_id).filter((id) => id && id !== senderUserId))];
  if (!userIds.length) return;
  const { data: preferences } = await service.from("user_notification_preferences").select("user_id, collective_push_enabled").in("user_id", userIds);
  const disabled = new Set((preferences || []).filter((item: any) => item.collective_push_enabled === false).map((item: any) => item.user_id));
  const preview = kind === "image" ? "enviou uma foto" : kind === "audio" ? "enviou um áudio" : String(body || "Nova mensagem").slice(0, 110);
  const senderName = String(sender?.name || fallbackSenderName || "Jogador");
  await sendPushNotificationsToUsers(service, userIds.filter((id) => !disabled.has(id)), {
    title: `${senderName} na Coletiva`, body: preview, tag: `collective-${callupId}`, url: `/coletiva?callup=${callupId}`,
  }, `/coletiva?callup=${callupId}`);
}

export async function sendCollectiveMessage(formData: FormData) {
  const account = await getCurrentAccount();
  if (!account.user || !account.profile?.player_id) return { success: false, error: "Entre com um jogador vinculado para conversar." };
  const callupId = String(formData.get("callup_id") || "");
  const body = String(formData.get("body") || "").trim();
  const file = formData.get("media");
  const duration = Math.trunc(Number(formData.get("duration") || 0));
  const replyToMessageId = String(formData.get("reply_to_message_id") || "").trim() || null;
  const { data: allowed } = await account.client.rpc("can_access_collective", { p_callup_id: callupId });
  if (!allowed) return { success: false, error: "A Coletiva não está disponível para esta conta." };
  let kind: "text" | "image" | "audio" = "text";
  let mediaPath: string | null = null;
  let mediaMime: string | null = null;
  let mediaSize: number | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) return { success: false, error: "O arquivo pode ter no máximo 8 MB." };
    kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "text";
    if (kind === "text") return { success: false, error: "Envie uma imagem ou um áudio válido." };
    if (kind === "audio" && (duration < 1 || duration > 60)) return { success: false, error: "O áudio pode ter no máximo 60 segundos." };
    const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || (kind === "image" ? "webp" : "webm");
    mediaPath = `${callupId}/${account.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await account.client.storage.from("collective-media").upload(mediaPath, file, { contentType: file.type, upsert: false });
    if (uploadError) return { success: false, error: uploadError.message };
    mediaMime = file.type;
    mediaSize = file.size;
  }
  if (!body && !mediaPath) return { success: false, error: "Escreva uma mensagem ou anexe uma mídia." };
  if (body.length > 1000) return { success: false, error: "A mensagem pode ter no máximo 1.000 caracteres." };
  const { data: callup } = await account.client.from("callups").select("round_id").eq("id", callupId).maybeSingle();
  if (replyToMessageId) {
    const { data: replied } = await account.client.from("collective_messages").select("id").eq("id", replyToMessageId).eq("callup_id", callupId).maybeSingle();
    if (!replied) return { success: false, error: "A mensagem respondida não pertence a esta Coletiva." };
  }
  const { data: inserted, error } = await account.client.from("collective_messages").insert({
    callup_id: callupId,
    round_id: callup?.round_id || null,
    sender_user_id: account.user.id,
    sender_player_id: account.profile.player_id,
    kind,
    body: body || (kind === "image" ? "Imagem" : "Áudio"),
    media_path: mediaPath,
    media_mime: mediaMime,
    media_size: mediaSize,
    audio_duration_seconds: kind === "audio" ? duration : null,
    reply_to_message_id: replyToMessageId,
  }).select("id").single();
  if (error) {
    if (mediaPath) await account.client.storage.from("collective-media").remove([mediaPath]);
    return { success: false, error: error.message };
  }
  revalidatePath("/coletiva");
  revalidatePath("/convocacao");
  if (inserted?.id) {
    const fallbackSenderName = String(account.user.user_metadata?.name || account.user.user_metadata?.full_name || "Jogador");
    after(async () => { try { await pushCollectiveMessage(callupId, account.user!.id, account.profile!.player_id!, fallbackSenderName, kind, body); } catch (pushError) { console.error("Falha no push da Coletiva:", pushError); } });
  }
  return { success: true };
}

export async function editCollectiveMessage(messageId: string, body: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para editar." };
  const clean = body.trim();
  if (!clean || clean.length > 1000) return { success: false, error: "Use entre 1 e 1.000 caracteres." };
  const { error } = await account.client.from("collective_messages").update({ body: clean, edited_at: new Date().toISOString() }).eq("id", messageId).eq("sender_user_id", account.user.id).eq("kind", "text").is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  revalidatePath("/coletiva");
  return { success: true };
}

export async function deleteCollectiveMessage(messageId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para apagar." };
  let query = account.client.from("collective_messages").update({ body: "Mensagem removida", deleted_at: new Date().toISOString() }).eq("id", messageId);
  if (!account.isAdmin) query = query.eq("sender_user_id", account.user.id);
  const { error } = await query;
  if (error) return { success: false, error: error.message };
  revalidatePath("/coletiva");
  return { success: true };
}

export async function markCollectiveRead(callupId: string, messageId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false };
  const { data: message } = await account.client.from("collective_messages").select("id, created_at").eq("id", messageId).eq("callup_id", callupId).maybeSingle();
  if (!message) return { success: false };
  const { error } = await account.client.from("collective_reads").upsert({ callup_id: callupId, user_id: account.user.id, read_at: message.created_at, last_read_message_id: message.id });
  return { success: !error };
}

export async function getAdminPreviousCollective(): Promise<CollectiveRoomData | null> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return null;
  const { data } = await account.client
    .from("callups")
    .select("id, date, round:round_id!inner(id, status)")
    .eq("round.status", "finished")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? getCollectiveRoom(data.id) : null;
}
