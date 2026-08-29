"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { verifyCartolaUnsubscribeToken } from "@/lib/cartola-reminders";

export async function cancelCartolaEmailReminders(userId: string, token: string) {
  if (!verifyCartolaUnsubscribeToken(userId, token)) return { success: false, error: "Este link de cancelamento é inválido." };
  const service = createServiceClient();
  if (!service) return { success: false, error: "Serviço indisponível." };
  const { error } = await service.from("user_notification_preferences").upsert({ user_id: userId, cartola_email_enabled: false, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { success: false, error: "Não foi possível cancelar agora." };
  return { success: true };
}
