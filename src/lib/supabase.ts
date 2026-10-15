import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configuração do Supabase ausente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

// Os canais realtime precisam carregar a sessão do navegador. Um cliente
// anônimo funcionava enquanto as tabelas eram públicas, mas não após o
// isolamento por pelada no RLS.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
