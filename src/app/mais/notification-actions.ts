"use server";

import { getCurrentAccount } from "@/lib/auth";

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
  const publicKey = process.env.VAPID_PUBLIC_KEY
    || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    || "";

  if (!publicKey) {
    return {
      success: false,
      publicKey: "",
      error: "As chaves VAPID ainda não foram configuradas no servidor.",
    };
  }

  return { success: true, publicKey };
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
