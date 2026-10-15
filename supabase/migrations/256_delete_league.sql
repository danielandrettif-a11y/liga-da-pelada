-- Exclusao permanente de uma pelada por um ADM dela. Nao executar antes das
-- migrations 253-255 e dos testes de isolamento entre duas peladas.
-- A identidade global (auth.users, account_profiles, players) e preservada;
-- somente dados dependentes da liga sao removidos pelas FKs ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.delete_league_permanently(
  p_league_id uuid,
  p_confirm_name text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente um ADM desta pelada pode exclui-la.';
  END IF;

  -- Enquanto a criacao de ligas nao estiver disponivel no app, nunca deixar
  -- os usuarios sem uma pelada ativa. Serializa exclusoes concorrentes.
  LOCK TABLE public.leagues IN SHARE ROW EXCLUSIVE MODE;
  SELECT name INTO target_name FROM public.leagues
  WHERE id = p_league_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pelada nao encontrada ou inativa.';
  END IF;
  IF p_confirm_name IS DISTINCT FROM target_name THEN
    RAISE EXCEPTION 'Digite o nome exato da pelada para confirmar a exclusao.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leagues WHERE id <> p_league_id AND is_active) THEN
    RAISE EXCEPTION 'Nao e possivel excluir a ultima pelada ativa antes de liberar a criacao de novas peladas.';
  END IF;

  -- Falha de modo seguro se uma migration futura ligar outra tabela a leagues
  -- sem exclusao em cascata. O DELETE tambem e atomico: uma falha em qualquer
  -- dependencia desfaz a operacao inteira.
  IF EXISTS (
    SELECT 1 FROM pg_constraint constraint_item
    WHERE constraint_item.contype = 'f'
      AND constraint_item.confrelid = 'public.leagues'::regclass
      AND constraint_item.confdeltype <> 'c'
  ) THEN
    RAISE EXCEPTION 'Existem dependencias da pelada sem exclusao em cascata. Revise o esquema antes de excluir.';
  END IF;

  DELETE FROM public.leagues WHERE id = p_league_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_league_permanently(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_league_permanently(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
