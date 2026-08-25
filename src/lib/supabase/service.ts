import { createClient } from "@supabase/supabase-js";

/**
 * Cliente usado somente por webhooks internos. Nunca é exposto ao navegador.
 * O service role permite que o agendador envie o push sem depender de cookies
 * de um administrador aberto no celular.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
