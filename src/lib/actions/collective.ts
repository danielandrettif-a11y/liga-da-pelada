"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentAccount } from "../auth";
import { sendPushNotificationsToUsers } from "../push-notifications";
import { createServiceClient } from "../supabase/service";
import { getSelectedLeague } from "../league-context";
import {
  readCollectivePage,
  type CollectivePageCursor,
  type CollectivePageMessage,
} from "@/modules/collective/infrastructure/supabase-collective-reader";
import { collectiveApiFor } from "@/modules/collective/infrastructure/collective-api-session";

export type CollectiveSummary = {
  callupId: string;
  roundId: string | null;
  roundNumber: number | null;
  date: string;
  status: string | null;
  unreadCount: number;
};

export type CollectiveMessage = CollectivePageMessage;

export type CollectiveRoomData = {
  summary: CollectiveSummary;
  callupIds: string[];
  messages: CollectiveMessage[];
  isAdmin: boolean;
  currentUserId: string;
  firstUnreadMessageId: string | null;
  lastReadMessageId: string | null;
  hasOlderMessages: boolean;
  nextCursor: CollectivePageCursor | null;
};

async function listCollectiveCandidates() {
  const account = await getCurrentAccount();
  if (!account.user) return { account, callups: [] as any[] };
  const league = await getSelectedLeague();
  if (!league || league.featureTier !== "complete") return { account, callups: [] as any[] };
  const api = await collectiveApiFor(account.client, "candidates");
  if (!api) return { account, callups: [] as any[] };
  try {
    return { account, callups: await api.getCandidates(league.id) };
  } catch (error) {
    console.error("Falha ao carregar conversas da Coletiva:", error);
    return { account, callups: [] as any[] };
  }
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

function isCollectiveVisible(callup: any) {
  if (callup.status !== "converted") return false;
  const round = Array.isArray(callup.round) ? callup.round[0] : callup.round;
  if (!round || round.status !== "finished") return true;
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return String(callup.date) >= cutoff;
}

function collectiveSummary(callup: any, unreadCount: number): CollectiveSummary {
  const round = Array.isArray(callup.round) ? callup.round[0] : callup.round;
  return {
    callupId: callup.id,
    roundId: round?.id || callup.round_id || null,
    roundNumber: round?.number || null,
    date: callup.date,
    status: round?.status || null,
    unreadCount,
  };
}

async function readSelectedCollectivePage(client: Parameters<typeof readCollectivePage>[0], userId: string, callupIds: string[], cursor: CollectivePageCursor | null = null, limit = 60) {
  const api = await collectiveApiFor(client, "page");
  const league = api ? await getSelectedLeague() : null;
  if (!api || !league) return null;
  return readCollectivePage(client, userId, callupIds, cursor, limit,
    () => api.getPage(league.id, callupIds, cursor, limit));
}

export async function getActiveCollectiveSummary(): Promise<CollectiveSummary | null> {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const { callups } = await listCollectiveCandidates();
  const visibleCallups = callups.filter(isCollectiveVisible);
  const callup = callups.find(isCollectiveOpen) || visibleCallups[0];
  if (!callup) return null;
  const page = await readSelectedCollectivePage(account.client, account.user.id, visibleCallups.map((item) => item.id), null, 1);
  return collectiveSummary(callup, page?.unreadCount || 0);
}

export async function getCollectiveRoom(callupId?: string): Promise<CollectiveRoomData | null> {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const { callups } = await listCollectiveCandidates();
  const visibleCallups = callups.filter(isCollectiveVisible);
  const activeCallup = callupId
    ? visibleCallups.find((callup) => callup.id === callupId)
    : callups.find(isCollectiveOpen) || visibleCallups[0];
  if (!activeCallup || !visibleCallups.length) return null;
  const summary = collectiveSummary(activeCallup, 0);
  const callupIds = visibleCallups.map((item) => item.id);
  const page = await readSelectedCollectivePage(account.client, account.user.id, callupIds);
  if (!page) return null;
  summary.unreadCount = page.unreadCount;
  return {
    summary,
    callupIds,
    messages: page.messages,
    isAdmin: (await getSelectedLeague())?.role === "admin",
    currentUserId: account.user.id,
    firstUnreadMessageId: page.firstUnreadMessageId,
    lastReadMessageId: null,
    hasOlderMessages: page.hasMore,
    nextCursor: page.nextCursor,
  };
}

export async function getOlderCollectiveMessages(
  callupId: string,
  cursor: CollectivePageCursor,
) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false as const, messages: [], error: "Entre para carregar a conversa." };
  const { callups } = await listCollectiveCandidates();
  const visibleCallups = callups.filter(isCollectiveVisible);
  if (!visibleCallups.some((callup) => callup.id === callupId)) {
    return { success: false as const, messages: [], error: "Coletiva fora da pelada selecionada." };
  }
  const page = await readSelectedCollectivePage(account.client, account.user.id, visibleCallups.map((item) => item.id), cursor);
  if (!page) return { success: false as const, messages: [], error: "Não foi possível carregar mensagens anteriores." };
  return {
    success: true as const,
    messages: page.messages,
    hasOlderMessages: page.hasMore,
    nextCursor: page.nextCursor,
  };
}

async function pushCollectiveMessage(callupId: string, senderUserId: string, senderPlayerId: string, fallbackSenderName: string, kind: string, body: string | null) {
  const service = createServiceClient();
  if (!service) return;
  const [{ data: callup }, { data: sender }] = await Promise.all([
    service.from("callups").select("league_id").eq("id", callupId).maybeSingle(),
    service.from("players").select("name").eq("id", senderPlayerId).maybeSingle(),
  ]);
  if (!callup?.league_id) return;
  const { data: members } = await service.from("league_members")
    .select("user_id")
    .eq("league_id", callup.league_id)
    .eq("is_active", true);
  const userIds = [...new Set((members || []).map((member: any) => member.user_id).filter((id) => id && id !== senderUserId))];
  if (!userIds.length) return;
  const { data: preferences } = await service.from("user_notification_preferences").select("user_id, collective_push_enabled").in("user_id", userIds);
  const disabled = new Set((preferences || []).filter((item: any) => item.collective_push_enabled === false).map((item: any) => item.user_id));
  const preview = kind === "image" ? "enviou uma foto" : kind === "audio" ? "enviou um áudio" : String(body || "Nova mensagem").slice(0, 110);
  const senderName = String(sender?.name || fallbackSenderName || "Jogador");
  await sendPushNotificationsToUsers(service, userIds.filter((id) => !disabled.has(id)), {
    title: `${senderName} na Coletiva`, body: preview, tag: "collective", url: "/coletiva",
  }, "/coletiva");
}

async function cleanupCollectiveMedia(client: any, mediaPath: string | null) {
  if (!mediaPath) return;
  const cleanupClient = createServiceClient() || client;
  const { error } = await cleanupClient.storage.from("collective-media").remove([mediaPath]);
  if (error) console.error("Falha ao limpar upload rejeitado da Coletiva:", error);
}

export async function sendCollectiveMessage(formData: FormData) {
  const account = await getCurrentAccount();
  if (!account.user || !account.profile?.player_id) return { success: false, error: "Entre com um jogador vinculado para conversar." };
  const callupId = String(formData.get("callup_id") || "");
  const file = formData.get("media");
  const body = String(formData.get("body") || "").trim();
  const duration = Math.trunc(Number(formData.get("duration") || 0));
  const replyToMessageId = String(formData.get("reply_to_message_id") || "").trim() || null;
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
    mediaMime = file.type;
    mediaSize = file.size;
  }
  if (!body && !mediaPath) return { success: false, error: "Escreva uma mensagem ou anexe uma mídia." };
  if (body.length > 1000) return { success: false, error: "A mensagem pode ter no máximo 1.000 caracteres." };
  const collectiveApi = await collectiveApiFor(account.client, "send");
  const league = await getSelectedLeague();
  if (!collectiveApi || !league) return { success: false, error: "O serviço da Coletiva está indisponível." };
  if (mediaPath && file instanceof File) {
    const { error: uploadError } = await account.client.storage.from("collective-media").upload(mediaPath, file, { contentType: file.type, upsert: false });
    if (uploadError) return { success: false, error: uploadError.message };
  }
  let res: { success: boolean; messageId?: string; error?: string };
  try {
    res = await collectiveApi.sendCollectiveMessage(league.id, {
      callupId,
      body: body || (kind === "image" ? "Imagem" : "Áudio"),
      kind,
      mediaPath,
      mediaMime,
      mediaSize,
      duration: kind === "audio" ? duration : null,
      replyToMessageId,
    });
  } catch (error) {
    await cleanupCollectiveMedia(account.client, mediaPath);
    console.error("Falha na API da Coletiva:", error);
    return { success: false, error: "O serviço da Coletiva está indisponível." };
  }
  if (!res.success) await cleanupCollectiveMedia(account.client, mediaPath);
  if (res.success) {
    revalidatePath("/coletiva");
    revalidatePath("/convocacao");
  }
  if (res.success && res.messageId) {
    const fallbackSenderName = String(account.user.user_metadata?.name || account.user.user_metadata?.full_name || "Jogador");
    after(async () => { try { await pushCollectiveMessage(callupId, account.user!.id, account.profile!.player_id!, fallbackSenderName, kind, body); } catch (pushError) { console.error("Falha no push da Coletiva:", pushError); } });
  }
  return res.success ? { success: true } : res;
}

export async function editCollectiveMessage(messageId: string, body: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para editar." };
  const collectiveApi = await collectiveApiFor(account.client, "edit");
  const league = await getSelectedLeague();
  if (!collectiveApi || !league) return { success: false, error: "O serviço da Coletiva está indisponível." };
  let res;
  try {
    res = await collectiveApi.editCollectiveMessage(league.id, messageId, body);
  } catch {
    return { success: false, error: "O serviço da Coletiva está indisponível." };
  }
  if (res.success) revalidatePath("/coletiva");
  return res;
}

export async function deleteCollectiveMessage(messageId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para apagar." };
  const collectiveApi = await collectiveApiFor(account.client, "delete");
  const league = await getSelectedLeague();
  if (!collectiveApi || !league) return { success: false, error: "O serviço da Coletiva está indisponível." };
  let res;
  try {
    res = await collectiveApi.deleteCollectiveMessage(league.id, messageId);
  } catch {
    return { success: false, error: "O serviço da Coletiva está indisponível." };
  }
  if (res.success) revalidatePath("/coletiva");
  return res;
}

export async function markCollectiveRead(readTargets: Array<{ callupId: string; messageId: string }>) {
  const account = await getCurrentAccount();
  if (!account.user || !readTargets.length) return { success: false };
  const collectiveApi = await collectiveApiFor(account.client, "read");
  const league = await getSelectedLeague();
  if (!collectiveApi || !league) return { success: false };
  try {
    return await collectiveApi.markCollectiveRead(league.id, readTargets);
  } catch {
    return { success: false };
  }
}

export async function getAdminPreviousCollective(): Promise<CollectiveRoomData | null> {
  const account = await getCurrentAccount();
  const league = await getSelectedLeague();
  if (!account.isAdmin || !league || league.role !== "admin") return null;
  const collectiveApi = await collectiveApiFor(account.client, "previous-id");
  if (!collectiveApi) return null;
  try {
    const { callupId } = await collectiveApi.getPreviousCallupId(league.id);
    return callupId ? getCollectiveRoom(callupId) : null;
  } catch {
    return null;
  }
}
