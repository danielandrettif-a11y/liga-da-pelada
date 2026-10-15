-- O chat da Coletiva exige membro da pelada Completa correta.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_collective_chat(p_callup_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.callups callup
    JOIN public.leagues league ON league.id = callup.league_id
    LEFT JOIN public.rounds round_item ON round_item.id = callup.round_id
    WHERE callup.id = p_callup_id
      AND league.feature_tier = 'complete'
      AND public.is_league_member(callup.league_id)
      AND (
        public.is_league_admin(callup.league_id)
        OR (
          callup.status = 'converted'
          AND EXISTS (
            SELECT 1 FROM public.account_profiles profile
            JOIN public.players player ON player.id = profile.player_id
            JOIN public.league_members member
              ON member.player_id = player.id AND member.league_id = callup.league_id
            WHERE profile.user_id = auth.uid()
              AND member.is_active AND player.member_category = 'player'
          )
          AND (
            round_item.id IS NULL OR round_item.status <> 'finished'
            OR callup.date >= CURRENT_DATE - 14
          )
        )
      )
  );
$$;

-- Drafts ainda usam esta funcao. Mantem o comportamento de convocados e
-- ADMs, mas nenhum ADM global acessa convocacao de outra pelada.
CREATE OR REPLACE FUNCTION public.can_access_collective(p_callup_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.callups callup
    LEFT JOIN public.rounds round_item ON round_item.id = callup.round_id
    WHERE callup.id = p_callup_id
      AND public.is_league_member(callup.league_id)
      AND (
        public.is_league_admin(callup.league_id)
        OR (
          callup.status = 'converted'
          AND EXISTS (
            SELECT 1 FROM public.callup_entries entry
            JOIN public.account_profiles profile ON profile.player_id = entry.player_id
            WHERE entry.callup_id = callup.id AND profile.user_id = auth.uid()
          )
          AND (
            round_item.id IS NULL OR round_item.status <> 'finished'
            OR callup.date >= CURRENT_DATE - 14
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS collective_messages_update ON public.collective_messages;
CREATE POLICY collective_messages_update ON public.collective_messages FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.callups callup WHERE callup.id = callup_id
    AND public.is_league_admin(callup.league_id))
  OR (sender_user_id = auth.uid() AND public.can_access_collective_chat(callup_id))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.callups callup WHERE callup.id = callup_id
    AND public.is_league_admin(callup.league_id))
  OR (sender_user_id = auth.uid() AND public.can_access_collective_chat(callup_id))
);

-- Alterar a associacao da mensagem poderia mover conteudo para outra pelada.
CREATE OR REPLACE FUNCTION public.keep_collective_message_ownership()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.callup_id IS DISTINCT FROM OLD.callup_id
    OR NEW.round_id IS DISTINCT FROM OLD.round_id
    OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
    OR NEW.sender_player_id IS DISTINCT FROM OLD.sender_player_id
    OR NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION 'A associacao da mensagem nao pode ser alterada.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS collective_messages_keep_ownership ON public.collective_messages;
CREATE TRIGGER collective_messages_keep_ownership
BEFORE UPDATE ON public.collective_messages
FOR EACH ROW EXECUTE FUNCTION public.keep_collective_message_ownership();

-- O round_id da mensagem nao pode apontar para uma rodada diferente da
-- convocacao, mesmo se o cliente enviar diretamente a requisicao SQL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.collective_messages message
    JOIN public.callups callup ON callup.id = message.callup_id
    WHERE message.round_id IS NOT NULL
      AND message.round_id IS DISTINCT FROM callup.round_id
  ) THEN
    RAISE EXCEPTION 'Mensagens da Coletiva com rodada diferente da convocacao; corrija antes da 268.';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.validate_collective_message_round()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.round_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.callups callup
    WHERE callup.id = NEW.callup_id AND callup.round_id = NEW.round_id
  ) THEN
    RAISE EXCEPTION 'A rodada da mensagem deve ser a rodada da convocacao.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS collective_messages_validate_round ON public.collective_messages;
CREATE TRIGGER collective_messages_validate_round
BEFORE INSERT OR UPDATE OF callup_id, round_id ON public.collective_messages
FOR EACH ROW EXECUTE FUNCTION public.validate_collective_message_round();

DROP POLICY IF EXISTS collective_media_delete ON storage.objects;
CREATE POLICY collective_media_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'collective-media' AND (
    EXISTS (
      SELECT 1 FROM public.callups callup
      WHERE callup.id = ((storage.foldername(name))[1])::uuid
        AND public.is_league_admin(callup.league_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.collective_messages message
      WHERE message.media_path = name AND message.sender_user_id = auth.uid()
        AND public.can_access_collective_chat(message.callup_id)
    )
  )
);

REVOKE ALL ON FUNCTION public.can_access_collective_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_collective(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.keep_collective_message_ownership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_collective_message_round() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_collective_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_collective(uuid) TO authenticated;

COMMIT;
