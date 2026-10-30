"use server";

import { httpNotificationGateway } from "@/modules/notifications/infrastructure/http-notification-gateway";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyCartolaUnsubscribeToken } from "@/lib/cartola-reminders";

export async function cancelCartolaEmailReminders(userId: string, token: string) {
  const backendUrl =
    process.env.NOTIFICATIONS_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL;

  if (process.env.NOTIFICATIONS_API_ENABLED === "true" && backendUrl) {
    const gateway = httpNotificationGateway(backendUrl);
    try {
      return await gateway.cancelCartolaEmailReminders(userId, token);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Não foi possível cancelar agora.",
      };
    }
  }

  if (!verifyCartolaUnsubscribeToken(userId, token)) {
    return { success: false, error: "Este link de cancelamento é inválido." };
  }

  const service = createServiceClient();
  if (!service) return { success: false, error: "Serviço indisponível." };

  const { error } = await service
    .from("user_notification_preferences")
    .upsert(
      { user_id: userId, cartola_email_enabled: false, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (error) return { success: false, error: "Não foi possível cancelar agora." };
  return { success: true };
}
