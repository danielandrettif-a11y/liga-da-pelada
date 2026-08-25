import { createClient } from "@supabase/supabase-js";

/**
 * Cliente usado somente por webhooks internos. Nunca é exposto ao navegador.
 * O service role permite que o agendador envie o push sem depender de cookies
 * de um administrador aberto no celular.
 */
export function createServiceClient() {
  // `SUPABASE_URL` is the server-side name shown by the current Supabase
  // dashboard. Keep the public variant for existing deployments.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  // Supabase now calls the replacement for service_role `SUPABASE_SECRET_KEY`.
  // Accept both names so Coolify can use the value shown in its dashboard.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
