"use server";

import { getCurrentAccount } from "@/lib/auth";
import { schedulePushTestAlert } from "@/lib/match-timer-scheduler";
import { getWebPushConfiguration } from "@/lib/push-notifications";
import { getActiveLeague } from "@/lib/actions/rounds";
import { createServiceClient } from "@/lib/supabase/service";
import { sendCartolaReminderTest } from "@/lib/cartola-reminders";
import { scheduleCartolaRoundReminders } from "@/lib/cartola-reminder-scheduler";
import { revalidatePath } from "next/cache";

export type SerializedPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
};

export async function getPushPublicKey() {
  const { publicKey, configured, error: configurationError } = getWebPushConfiguration();
  const backgroundAlertsConfigured = Boolean(
    process.env.QSTASH_TOKEN
    && process.env.MATCH_TIMER_WEBHOOK_SECRET
    && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
  );

  if (!publicKey || !configured) {
    return {
      success: false,
      publicKey: "",
      backgroundAlertsConfigured,
      error: configurationError || "As chaves VAPID do servidor ainda não estão completas.",
    };
  }

  return { success: true, publicKey, backgroundAlertsConfigured };
}

export async function getPushSystemStatus() {
  const { configured, error } = getWebPushConfiguration();
  return {
    pushConfigured: configured,
    pushConfigurationError: error,
    backgroundAlertsConfigured: Boolean(
      process.env.QSTASH_TOKEN
      && process.env.MATCH_TIMER_WEBHOOK_SECRET
      && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
    ),
  };
}

function isValidSubscription(subscription: SerializedPushSubscription) {
  return subscription.endpoint.startsWith("https://")
    && subscription.endpoint.length <= 4096
    && subscription.keys.p256dh.length > 0
    && subscription.keys.p256dh.length <= 512
    && subscription.keys.auth.length > 0
    && subscription.keys.auth.length <= 512;
}

export async function subscribeToPush(subscription: SerializedPushSubscription) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para ativar notificações." };
  if (!isValidSubscription(subscription)) return { success: false, error: "Assinatura de notificação inválida." };

  const { error } = await account.client
    .from("push_subscriptions")
    .upsert({
      user_id: account.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expiration_time: subscription.expirationTime,
      user_agent: subscription.userAgent?.slice(0, 500) || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });

  if (error) {
    console.error("Erro ao salvar assinatura push:", error);
    return { success: false, error: "Não foi possível ativar as notificações agora." };
  }

  return { success: true };
}

export async function unsubscribeFromPush(endpoint: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Sessão expirada." };

  const { error } = await account.client
    .from("push_subscriptions")
    .delete()
    .eq("user_id", account.user.id)
    .eq("endpoint", endpoint);

  if (error) {
    console.error("Erro ao remover assinatura push:", error);
    return { success: false, error: "Não foi possível desativar as notificações agora." };
  }

  return { success: true };
}

export async function sendPushTest() {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para testar as notificações." };

  try {
    await schedulePushTestAlert(account.user.id);
    return { success: true, scheduled: true };
  } catch (error) {
    console.error("Erro ao enviar teste de push:", error);
    // O teste é também o diagnóstico inicial de produção. Antes ele ocultava
    // a mensagem do Supabase e deixava impossível distinguir chave, tabela ou
    // assinatura. A mensagem é segura para exibição e o erro completo segue
    // disponível nos logs do Coolify.
    const errorRecord = error && typeof error === "object"
      ? error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
      : null;
    const message = error instanceof Error
      ? error.message
      : typeof errorRecord?.message === "string"
        ? errorRecord.message
        : "";
    const context = [
      typeof errorRecord?.code === "string" ? `código ${errorRecord.code}` : "",
      typeof errorRecord?.details === "string" ? errorRecord.details : "",
      typeof errorRecord?.hint === "string" ? errorRecord.hint : "",
    ].filter(Boolean).join(" · ");
    const detail = message.trim() || context || "erro desconhecido no servidor";
    return { success: false, error: `Falha no teste: ${detail}` };
  }
}

export type NotificationPreferences = {
  matchPushEnabled: boolean;
  cartolaPushEnabled: boolean;
  cartolaEmailEnabled: boolean;
  collectiveEnabled: boolean;
  emailTestedAt: string | null;
  emailConfigured: boolean;
};

export async function getNotificationPreferences(): Promise<NotificationPreferences | null> {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const league = await getActiveLeague();
  const [{ data: preference }, { data: leagueSettings }] = await Promise.all([
    account.client.from("user_notification_preferences").select("match_push_enabled, cartola_push_enabled, cartola_email_enabled").eq("user_id", account.user.id).maybeSingle(),
    account.client.from("leagues").select("cartola_reminders_enabled, cartola_email_tested_at").eq("id", league.id).maybeSingle(),
  ]);
  return {
    matchPushEnabled: preference?.match_push_enabled !== false,
    cartolaPushEnabled: preference?.cartola_push_enabled !== false,
    cartolaEmailEnabled: preference?.cartola_email_enabled !== false,
    collectiveEnabled: leagueSettings?.cartola_reminders_enabled === true,
    emailTestedAt: leagueSettings?.cartola_email_tested_at || null,
    emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && process.env.EMAIL_UNSUBSCRIBE_SECRET),
  };
}

export async function updateNotificationPreferences(input: {
  matchPushEnabled: boolean;
  cartolaPushEnabled: boolean;
  cartolaEmailEnabled: boolean;
}) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para alterar as notificações." };
  const { error } = await account.client.from("user_notification_preferences").upsert({
    user_id: account.user.id,
    match_push_enabled: input.matchPushEnabled,
    cartola_push_enabled: input.cartolaPushEnabled,
    cartola_email_enabled: input.cartolaEmailEnabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return { success: false, error: error.message };
  revalidatePath("/mais/notificacoes");
  return { success: true };
}

export async function sendCartolaEmailTest() {
  const account = await getCurrentAccount();
  if (!account.user?.email || !account.isAdmin) return { success: false, error: "Somente um ADM com e-mail pode executar o teste." };
  try {
    const league = await getActiveLeague();
    await sendCartolaReminderTest({
      userId: account.user.id,
      email: account.user.email,
      name: String(account.user.user_metadata?.name || account.user.email.split("@")[0]).split(" ")[0],
    });
    const service = createServiceClient();
    if (!service) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
    const testedAt = new Date().toISOString();
    const { error } = await service.from("leagues").update({ cartola_email_tested_at: testedAt }).eq("id", league.id);
    if (error) throw error;
    revalidatePath("/mais/notificacoes");
    return { success: true, testedAt };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Não foi possível enviar o teste." };
  }
}

export async function setCartolaRemindersEnabled(enabled: boolean) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores podem alterar o envio geral." };
  const league = await getActiveLeague();
  const service = createServiceClient();
  if (!service) return { success: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada." };
  const { data: config, error: configError } = await service.from("leagues").select("cartola_email_tested_at").eq("id", league.id).single();
  if (configError) return { success: false, error: configError.message };
  if (enabled && !config.cartola_email_tested_at) return { success: false, error: "Envie e confirme primeiro o teste no seu e-mail." };
  const { error } = await service.from("leagues").update({ cartola_reminders_enabled: enabled }).eq("id", league.id);
  if (error) return { success: false, error: error.message };

  if (enabled) {
    const { data: active } = await service
      .from("fantasy_rounds")
      .select("round:round_id(id, date, start_time, status, round_type), fantasy_season:fantasy_season_id!inner(league_id)")
      .eq("fantasy_season.league_id", league.id)
      .eq("market_status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const round = Array.isArray(active?.round) ? active?.round[0] : active?.round;
    if (round?.id && round.round_type === "official" && round.status !== "finished") {
      await scheduleCartolaRoundReminders({ roundId: round.id, date: round.date, startTime: round.start_time || "08:00", includeOpening: false });
    }
  }
  revalidatePath("/mais/notificacoes");
  return { success: true };
}
