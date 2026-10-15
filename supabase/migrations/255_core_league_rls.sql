-- Isolamento do nucleo por pelada. Executar somente depois de 253 e 254 e
-- validar com duas contas em ligas diferentes antes de publicar o aplicativo.
-- Os dados legados da BQ permanecem; apenas as permissoes mudam.

BEGIN;

-- Falhar de forma explicita se o historico ja contiver estatisticas ligadas
-- a uma liga diferente da liga da rodada. Nao corrigir silenciosamente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.player_round_stats stat
    JOIN public.rounds round_item ON round_item.id = stat.round_id
    WHERE stat.league_id IS DISTINCT FROM round_item.league_id
  ) THEN
    RAISE EXCEPTION 'player_round_stats contem liga diferente da rodada; corrija antes de aplicar 255';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.callup_withdrawals withdrawal
    JOIN public.callups callup ON callup.id = withdrawal.callup_id
    WHERE withdrawal.league_id IS DISTINCT FROM callup.league_id
  ) THEN
    RAISE EXCEPTION 'callup_withdrawals contem liga diferente da convocacao; corrija antes de aplicar 255';
  END IF;
END $$;

-- Esta funcao usa a tabela de membros sob SECURITY DEFINER para evitar
-- recursao nas politicas de league_members.
CREATE OR REPLACE FUNCTION public.is_admin_of_any_league()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.league_members member
    WHERE member.user_id = auth.uid() AND member.is_active AND member.role = 'admin'
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin_of_any_league() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_of_any_league() TO authenticated;

-- A RPC legada de uniao altera o jogador global. Ate ela ser redesenhada
-- para multiplas ligas, permitir somente perfis exclusivos da pelada atual.
CREATE OR REPLACE FUNCTION public.can_merge_profiles_in_league(
  p_league_id uuid, p_guest_id uuid, p_registered_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_league_admin(p_league_id)
    AND p_guest_id IS DISTINCT FROM p_registered_id
    AND EXISTS (SELECT 1 FROM public.league_members
      WHERE league_id = p_league_id AND player_id = p_guest_id AND is_active)
    AND EXISTS (SELECT 1 FROM public.league_members
      WHERE league_id = p_league_id AND player_id = p_registered_id AND is_active)
    AND NOT EXISTS (SELECT 1 FROM public.league_members
      WHERE player_id IN (p_guest_id, p_registered_id) AND league_id <> p_league_id);
$$;
REVOKE ALL ON FUNCTION public.can_merge_profiles_in_league(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_merge_profiles_in_league(uuid, uuid, uuid) TO authenticated;

-- A regra legada usava o papel global is_app_admin(), que daria a um ADM da
-- BQ acesso a convocacoes privadas de outra pelada da qual fosse apenas membro.
CREATE OR REPLACE FUNCTION public.can_access_callup(p_callup_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.callups callup
    WHERE callup.id = p_callup_id
      AND public.is_league_member(callup.league_id)
      AND (
        callup.is_public
        OR public.is_league_admin(callup.league_id)
        OR EXISTS (
          SELECT 1 FROM public.callup_invite_access access
          WHERE access.callup_id = callup.id AND access.user_id = auth.uid()
        )
      )
  );
$$;

-- Cada politica antiga e removida: politicas PERMISSIVE sao combinadas por
-- OR, portanto deixar uma unica regra antiga USING(true) anularia o RLS novo.
DO $$
DECLARE item record; old_policy record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('leagues',
       'public.is_league_member(id)',
       'public.is_league_admin(id)'),
      ('league_members',
       'public.is_league_member(league_id)',
       'public.is_league_admin(league_id)'),
      ('ranking_rules',
       'public.is_league_member(league_id)',
       'public.is_league_admin(league_id)'),
      ('seasons',
       'public.is_league_member(league_id)',
       'public.is_league_admin(league_id)'),
      ('rounds',
       'public.is_league_member(league_id)',
       'public.is_league_admin(league_id)'),
      ('round_players',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_member(parent.league_id) AND (parent.preparation_stage = ''teams_ready'' OR public.is_league_admin(parent.league_id)))',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_admin(parent.league_id))'),
      ('teams',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_admin(parent.league_id))'),
      ('team_players',
       'EXISTS (SELECT 1 FROM public.teams team JOIN public.rounds parent ON parent.id = team.round_id WHERE team.id = team_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.teams team JOIN public.rounds parent ON parent.id = team.round_id WHERE team.id = team_id AND public.is_league_admin(parent.league_id))'),
      ('matches',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_admin(parent.league_id))'),
      ('match_events',
       'EXISTS (SELECT 1 FROM public.matches match_item JOIN public.rounds parent ON parent.id = match_item.round_id WHERE match_item.id = match_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.matches match_item JOIN public.rounds parent ON parent.id = match_item.round_id WHERE match_item.id = match_id AND public.is_league_admin(parent.league_id))'),
      ('match_players',
       'EXISTS (SELECT 1 FROM public.matches match_item JOIN public.rounds parent ON parent.id = match_item.round_id WHERE match_item.id = match_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.matches match_item JOIN public.rounds parent ON parent.id = match_item.round_id WHERE match_item.id = match_id AND public.is_league_admin(parent.league_id))'),
      ('match_substitutions',
       'EXISTS (SELECT 1 FROM public.matches match_item JOIN public.rounds parent ON parent.id = match_item.round_id WHERE match_item.id = match_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.matches match_item JOIN public.rounds parent ON parent.id = match_item.round_id WHERE match_item.id = match_id AND public.is_league_admin(parent.league_id))'),
      ('match_goalkeepers',
       'EXISTS (SELECT 1 FROM public.matches match_item JOIN public.rounds parent ON parent.id = match_item.round_id WHERE match_item.id = match_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.matches match_item JOIN public.rounds parent ON parent.id = match_item.round_id WHERE match_item.id = match_id AND public.is_league_admin(parent.league_id))'),
      ('player_round_stats',
       'public.is_league_member(league_id) AND EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND parent.league_id = player_round_stats.league_id)',
       'public.is_league_admin(league_id) AND EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND parent.league_id = player_round_stats.league_id)'),
      ('round_payments',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_admin(parent.league_id))'),
      ('round_payment_audit',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_admin(parent.league_id))'),
      ('callups',
       'public.is_league_member(league_id) AND public.can_access_callup(id)',
       'public.is_league_admin(league_id)'),
      ('callup_entries',
       'EXISTS (SELECT 1 FROM public.callups callup WHERE callup.id = callup_id AND public.is_league_member(callup.league_id) AND public.can_access_callup(callup.id))',
       'EXISTS (SELECT 1 FROM public.callups callup WHERE callup.id = callup_id AND public.is_league_admin(callup.league_id))'),
      ('stadiums',
       'public.is_league_member(league_id)',
       'public.is_league_admin(league_id)'),
      ('player_round_stat_overrides',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_admin(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_admin(parent.league_id))'),
      ('callup_withdrawals',
       'public.is_league_member(league_id)',
       'public.is_league_admin(league_id)'),
      ('callup_replacement_slots',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_member(parent.league_id))',
       'EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id AND public.is_league_admin(parent.league_id))')
    ) AS scope(table_name, read_predicate, admin_predicate)
  LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NULL THEN
      RAISE EXCEPTION 'Tabela obrigatoria ausente: %', item.table_name;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.table_name);
    FOR old_policy IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = item.table_name LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', old_policy.policyname, item.table_name);
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', item.table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', item.table_name);
    EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING (%s)',
      item.table_name, item.read_predicate);
    IF item.table_name = 'leagues' THEN
      -- Criacao e exclusao devem passar pelas RPCs transacionais, jamais por
      -- INSERT/DELETE direto do cliente, que contornaria confirmacao/seed.
      EXECUTE format('CREATE POLICY tenant_admin_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
        item.table_name, item.admin_predicate, item.admin_predicate);
    ELSE
      EXECUTE format('CREATE POLICY tenant_admin_write ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
        item.table_name, item.admin_predicate, item.admin_predicate);
    END IF;
  END LOOP;
END $$;

-- O painel de pagamentos permite que membros confirmem pagamentos da propria
-- rodada; o log de auditoria continua sendo escrito pelo trigger do banco.
CREATE POLICY tenant_member_payment_write ON public.round_payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.rounds parent
  WHERE parent.id = round_id AND public.is_league_member(parent.league_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.rounds parent
  WHERE parent.id = round_id AND public.is_league_member(parent.league_id)));

-- Um usuario pode retirar da lista aberta apenas o convidado que incluiu.
CREATE POLICY tenant_guest_entry_delete ON public.callup_entries FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.callups callup
  WHERE callup.id = callup_id AND callup.status = 'open'
    AND public.is_league_member(callup.league_id))
  AND (joined_by = auth.uid() OR EXISTS (SELECT 1 FROM public.players player
    WHERE player.id = player_id AND player.created_by_user_id = auth.uid())));

-- Jogadores representam a identidade global, mas seus dados so aparecem para
-- a propria conta ou para quem divide uma pelada. Insercao por ADM cria o
-- perfil antes de criar o vinculo; a acao deve concluir ambos ou desfazer.
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE old_policy record; BEGIN
  FOR old_policy IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'players' LOOP
    EXECUTE format('DROP POLICY %I ON public.players', old_policy.policyname);
  END LOOP;
END $$;
REVOKE ALL ON TABLE public.players FROM anon;
CREATE POLICY tenant_player_read ON public.players FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.account_profiles profile
    WHERE profile.user_id = auth.uid() AND profile.player_id = id)
  OR EXISTS (SELECT 1 FROM public.league_members member
    WHERE member.player_id = id AND member.is_active AND public.is_league_member(member.league_id))
);
CREATE POLICY tenant_player_insert ON public.players FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_of_any_league() AND created_by_user_id = auth.uid());
CREATE POLICY tenant_player_update ON public.players FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.account_profiles profile
    WHERE profile.user_id = auth.uid() AND profile.player_id = id)
  OR EXISTS (SELECT 1 FROM public.league_members member
    WHERE member.player_id = id AND public.is_league_admin(member.league_id))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.account_profiles profile
    WHERE profile.user_id = auth.uid() AND profile.player_id = id)
  OR EXISTS (SELECT 1 FROM public.league_members member
    WHERE member.player_id = id AND public.is_league_admin(member.league_id))
);
CREATE POLICY tenant_player_delete ON public.players FOR DELETE TO authenticated USING (
  (public.is_admin_of_any_league() AND created_by_user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.league_members member WHERE member.player_id = id))
  OR (EXISTS (SELECT 1 FROM public.league_members member
        WHERE member.player_id = id AND public.is_league_admin(member.league_id))
      AND NOT EXISTS (SELECT 1 FROM public.league_members member
        WHERE member.player_id = id AND NOT public.is_league_admin(member.league_id)))
);

-- Identidade da conta e global, mas a leitura entre contas exige participar
-- da mesma pelada. Um ADM tambem ve quem pediu entrada para poder aprovar.
ALTER TABLE public.account_profiles ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE old_policy record; BEGIN
  FOR old_policy IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'account_profiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.account_profiles', old_policy.policyname);
  END LOOP;
END $$;
REVOKE ALL ON TABLE public.account_profiles FROM anon;
CREATE POLICY tenant_account_read ON public.account_profiles FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.league_members member
    WHERE member.user_id = account_profiles.user_id AND member.is_active
      AND public.is_league_member(member.league_id))
  OR EXISTS (SELECT 1 FROM public.league_join_requests request
    WHERE request.user_id = account_profiles.user_id AND request.status = 'pending'
      AND public.is_league_admin(request.league_id))
);

-- Scouts fisicos ainda podem ser enviados pelo proprio atleta; sua exibicao
-- obedece a privacidade existente, acrescida do vinculo com a pelada.
ALTER TABLE public.player_round_fitness ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE old_policy record; BEGIN
  FOR old_policy IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'player_round_fitness' LOOP
    EXECUTE format('DROP POLICY %I ON public.player_round_fitness', old_policy.policyname);
  END LOOP;
END $$;
REVOKE ALL ON TABLE public.player_round_fitness FROM anon;
CREATE POLICY tenant_fitness_read ON public.player_round_fitness FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id
    AND public.is_league_member(parent.league_id))
  AND (EXISTS (SELECT 1 FROM public.players player WHERE player.id = player_id
    AND player.show_fitness_stats)
    OR EXISTS (SELECT 1 FROM public.account_profiles profile
      WHERE profile.user_id = auth.uid() AND profile.player_id = player_id))
);
CREATE POLICY tenant_fitness_owner_insert ON public.player_round_fitness FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_own_fitness(player_id, round_id)
    AND EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id
      AND public.is_league_member(parent.league_id)));
CREATE POLICY tenant_fitness_owner_update ON public.player_round_fitness FOR UPDATE TO authenticated
  USING (public.can_manage_own_fitness(player_id, round_id)
    AND EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id
      AND public.is_league_member(parent.league_id)))
  WITH CHECK (public.can_manage_own_fitness(player_id, round_id)
    AND EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id
      AND public.is_league_member(parent.league_id)));
CREATE POLICY tenant_fitness_owner_delete ON public.player_round_fitness FOR DELETE TO authenticated
  USING (public.can_manage_own_fitness(player_id, round_id)
    AND EXISTS (SELECT 1 FROM public.rounds parent WHERE parent.id = round_id
      AND public.is_league_member(parent.league_id)));

-- A view deve executar com as permissoes do leitor; do contrario uma view
-- criada pelo dono do schema ignoraria RLS das tabelas subjacentes.
ALTER VIEW public.player_season_stats SET (security_invoker = true);
REVOKE ALL ON TABLE public.player_season_stats FROM anon;
GRANT SELECT ON TABLE public.player_season_stats TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
