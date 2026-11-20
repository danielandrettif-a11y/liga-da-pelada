import { createClient } from "@supabase/supabase-js";

/**
 * Cliente usado somente por webhooks internos. Nunca é exposto ao navegador.
 * O service role permite que o agendador envie o push sem depender de cookies
 * de um administrador aberto no celular.
 */
export function createServiceClient() {
  // Server-only requests must use the Docker gateway when it is configured.
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  // Aceitamos a chave nova (`sb_secret_...`) e a chave legacy (`service_role`).
  // Quando ambas existirem, a variável explicitamente destinada ao webhook
  // precisa vencer: assim uma chave antiga em SUPABASE_SECRET_KEY não rebaixa
  // o job para as políticas RLS.
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
