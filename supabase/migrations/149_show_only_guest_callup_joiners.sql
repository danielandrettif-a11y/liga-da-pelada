-- Só exibe o responsável quando ele adicionou outra pessoa à convocação.
-- Quem entra usando a própria conta não recebe a etiqueta "amigo de".
CREATE OR REPLACE FUNCTION public.get_callup_entry_joiners(p_callup_ids UUID[])
RETURNS TABLE (
  callup_entry_id UUID,
  joined_by_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    entry.id AS callup_entry_id,
    COALESCE(NULLIF(TRIM(joiner.nickname), ''), joiner.name) AS joined_by_name
  FROM public.callup_entries AS entry
  JOIN public.callups AS callup ON callup.id = entry.callup_id
  JOIN public.account_profiles AS account ON account.user_id = entry.joined_by
  JOIN public.players AS joiner ON joiner.id = account.player_id
  WHERE entry.callup_id = ANY(COALESCE(p_callup_ids, ARRAY[]::UUID[]))
    AND callup.status IN ('open', 'locked')
    AND joiner.id IS DISTINCT FROM entry.player_id;
$$;

REVOKE ALL ON FUNCTION public.get_callup_entry_joiners(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_callup_entry_joiners(UUID[]) TO anon, authenticated;
