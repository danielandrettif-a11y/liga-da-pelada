-- A retirada feita pelo criador precisa promover a fila na mesma transacao.
-- normalize_callup_positions continua interna: nunca conceder EXECUTE direto
-- a authenticated, pois isso permitiria alterar outras convocacoes.
BEGIN;

CREATE OR REPLACE FUNCTION public.remove_my_added_callup_player(
  p_callup_id uuid,
  p_player_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  added_by_user_id uuid;
  created_by_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para alterar a lista.';
  END IF;

  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convocação não encontrada.';
  END IF;
  IF NOT public.is_league_member(current_callup.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito aos membros desta pelada.';
  END IF;
  IF current_callup.status <> 'open' THEN
    RAISE EXCEPTION 'Depois do sorteio, somente o administrador pode retirar outro jogador.';
  END IF;

  SELECT entry.joined_by, player.created_by_user_id
    INTO added_by_user_id, created_by_user_id
  FROM public.callup_entries AS entry
  JOIN public.players AS player ON player.id = entry.player_id
  WHERE entry.callup_id = p_callup_id
    AND entry.player_id = p_player_id
  FOR UPDATE OF entry;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogador não encontrado na convocação.';
  END IF;
  IF added_by_user_id IS DISTINCT FROM auth.uid()
    AND created_by_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Você só pode remover convidados cadastrados por você.';
  END IF;

  -- Esta funcao interna faz DELETE, promove a fila e sincroniza a pre-lista
  -- na mesma transacao, inclusive para bases com rodadas vinculadas.
  RETURN public.remove_callup_player_before_first_match(p_callup_id, p_player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_my_added_callup_player(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_my_added_callup_player(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_my_added_callup_player(uuid, uuid) IS
  'Retira entrada criada pela conta em convocacao aberta e promove a fila atomicamente.';

NOTIFY pgrst, 'reload schema';
COMMIT;
