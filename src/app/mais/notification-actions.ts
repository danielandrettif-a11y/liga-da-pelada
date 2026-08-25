"use server";

import { getCurrentAccount } from "@/lib/auth";
import { getWebPushConfiguration, sendPushTestNotification } from "@/lib/push-notifications";

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
    const delivery = await sendPushTestNotification(account.client, account.user.id);
    if (delivery.disabled) {
      return { success: false, error: getWebPushConfiguration().error || "As chaves VAPID do servidor ainda não estão completas." };
    }
    if (delivery.sent === 0) {
      return { success: false, error: delivery.failed > 0
        ? `O provedor recusou a notificação${delivery.failureReasons?.[0] ? `: ${delivery.failureReasons[0]}` : "."}`
        : "Este aparelho ainda não possui uma assinatura de notificação ativa." };
    }
    return { success: true };
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
