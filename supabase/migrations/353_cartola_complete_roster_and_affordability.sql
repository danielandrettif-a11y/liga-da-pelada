-- Perfis competitivos completos permanecem no Cartola mesmo após ausências.
-- O patrimônio recebe, quando necessário, o custo do time válido mais barato
-- do mercado atual. Os preços individuais não são alterados.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_fantasy_minimum_viable_lineup_cost(
  p_fantasy_season_id uuid,
  p_team_size integer
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT season.id, season.league_id, season.initial_player_price
    FROM public.fantasy_seasons season
    WHERE season.id = p_fantasy_season_id
  ), formations(team_size, defenders, attackers) AS (
    SELECT * FROM (VALUES
      (5, 2, 2),
      (6, 2, 3),
      (6, 3, 2),
      (7, 3, 3)
    ) AS item(team_size, defenders, attackers)
    WHERE item.team_size = p_team_size
  ), eligible AS (
    SELECT player.id AS player_id,
      member.player_profile,
      round(COALESCE(price.current_price, target.initial_player_price), 2) AS price
    FROM target
    JOIN public.league_members member ON member.league_id = target.league_id
      AND member.is_active
    JOIN public.players player ON player.id = member.player_id
    LEFT JOIN public.fantasy_player_prices price
      ON price.fantasy_season_id = target.id AND price.player_id = player.id
    WHERE player.member_category = 'player'
      AND player.is_selectable
      AND NULLIF(btrim(player.name), '') IS NOT NULL
      AND NULLIF(btrim(player.avatar_url), '') IS NOT NULL
      AND member.player_profile IN ('defensive', 'offensive')
      AND COALESCE(cardinality(member.overall_traits), 0) BETWEEN 1 AND 2
  ), candidate_costs AS (
    SELECT goalkeeper.price + defense.cost + attack.cost AS lineup_cost
    FROM eligible goalkeeper
    CROSS JOIN formations formation
    CROSS JOIN LATERAL (
      SELECT count(*) AS chosen_count, COALESCE(sum(chosen.price), 0) AS cost
      FROM (
        SELECT player.price
        FROM eligible player
        WHERE player.player_id <> goalkeeper.player_id
          AND player.player_profile = 'defensive'
        ORDER BY player.price, player.player_id
        LIMIT formation.defenders
      ) chosen
    ) defense
    CROSS JOIN LATERAL (
      SELECT count(*) AS chosen_count, COALESCE(sum(chosen.price), 0) AS cost
      FROM (
        SELECT player.price
        FROM eligible player
        WHERE player.player_id <> goalkeeper.player_id
          AND player.player_profile = 'offensive'
        ORDER BY player.price, player.player_id
        LIMIT formation.attackers
      ) chosen
    ) attack
    WHERE defense.chosen_count = formation.defenders
      AND attack.chosen_count = formation.attackers
  )
  SELECT round(min(lineup_cost), 2) FROM candidate_costs;
$$;

REVOKE ALL ON FUNCTION public.get_fantasy_minimum_viable_lineup_cost(uuid, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_fantasy_selection_in_league(
  p_round_id uuid,
  p_player_ids uuid[],
  p_extra_player_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_league_id uuid;
  expected_count integer;
  found_count integer;
BEGIN
  SELECT round_item.league_id INTO target_league_id
  FROM public.rounds round_item
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
  JOIN public.fantasy_seasons fantasy_season
    ON fantasy_season.id = fantasy_round.fantasy_season_id
    AND fantasy_season.league_id = round_item.league_id
  JOIN public.leagues league ON league.id = round_item.league_id
    AND league.is_active AND league.feature_tier = 'complete'
  WHERE round_item.id = p_round_id;

  IF target_league_id IS NULL OR NOT public.is_league_member(target_league_id) THEN
    RAISE EXCEPTION 'Rodada do Cartola indisponivel nesta pelada.';
  END IF;

  expected_count := COALESCE(cardinality(p_player_ids), 0);
  IF expected_count <> (
    SELECT count(DISTINCT item)
    FROM unnest(COALESCE(p_player_ids, ARRAY[]::uuid[])) item
  ) THEN
    RAISE EXCEPTION 'A escalacao contem atletas repetidos.';
  END IF;

  SELECT count(*) INTO found_count
  FROM public.league_members member
  JOIN public.players player ON player.id = member.player_id
  WHERE member.league_id = target_league_id
    AND member.is_active
    AND player.id = ANY(COALESCE(p_player_ids, ARRAY[]::uuid[]))
    AND player.member_category = 'player'
    AND player.is_selectable
    AND NULLIF(btrim(player.name), '') IS NOT NULL
    AND NULLIF(btrim(player.avatar_url), '') IS NOT NULL
    AND member.player_profile IN ('defensive', 'offensive')
    AND COALESCE(cardinality(member.overall_traits), 0) BETWEEN 1 AND 2;

  IF found_count <> expected_count THEN
    RAISE EXCEPTION 'A escalacao contem atleta sem perfil competitivo completo ou fora desta pelada.';
  END IF;

  IF p_extra_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.league_members member
    JOIN public.players player ON player.id = member.player_id
    WHERE member.league_id = target_league_id
      AND member.is_active
      AND member.player_id = p_extra_player_id
      AND player.member_category = 'player'
      AND player.is_selectable
      AND NULLIF(btrim(player.name), '') IS NOT NULL
      AND NULLIF(btrim(player.avatar_url), '') IS NOT NULL
      AND member.player_profile IN ('defensive', 'offensive')
      AND COALESCE(cardinality(member.overall_traits), 0) BETWEEN 1 AND 2
  ) THEN
    RAISE EXCEPTION 'O reserva nao possui perfil competitivo completo nesta pelada.';
  END IF;

  RETURN target_league_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_fantasy_selection_in_league(uuid, uuid[], uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup_with_reserve(
  p_round_id uuid,
  p_player_ids uuid[],
  p_captain_player_id uuid,
  p_top_scorer_player_id uuid,
  p_top_assist_player_id uuid,
  p_challenge_player_id uuid,
  p_lineup_slots jsonb,
  p_reserve_player_id uuid DEFAULT NULL,
  p_reserve_slot_role text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fantasy_season_id uuid;
  target_team_size integer;
  base_budget numeric(10,2);
  viable_budget numeric(10,2);
BEGIN
  SELECT fantasy_round.fantasy_season_id,
         public.fantasy_lineup_size(p_round_id),
         fantasy_season.initial_budget
  INTO target_fantasy_season_id, target_team_size, base_budget
  FROM public.fantasy_rounds fantasy_round
  JOIN public.fantasy_seasons fantasy_season
    ON fantasy_season.id = fantasy_round.fantasy_season_id
  WHERE fantasy_round.round_id = p_round_id;

  IF target_fantasy_season_id IS NULL THEN
    RAISE EXCEPTION 'Rodada do Cartola nao encontrada.';
  END IF;

  viable_budget := public.get_fantasy_minimum_viable_lineup_cost(
    target_fantasy_season_id,
    target_team_size
  );

  INSERT INTO public.fantasy_accounts (
    fantasy_season_id, user_id, current_budget
  ) VALUES (
    target_fantasy_season_id,
    auth.uid(),
    GREATEST(base_budget, target_team_size * 11.00, COALESCE(viable_budget, 0))
  )
  ON CONFLICT (fantasy_season_id, user_id) DO UPDATE SET
    current_budget = GREATEST(
      public.fantasy_accounts.current_budget,
      EXCLUDED.current_budget
    ),
    updated_at = now();

  RETURN public.save_fantasy_lineup_with_reserve_pre_activity_251(
    p_round_id,
    p_player_ids,
    p_captain_player_id,
    p_top_scorer_player_id,
    p_top_assist_player_id,
    p_challenge_player_id,
    p_lineup_slots,
    p_reserve_player_id,
    p_reserve_slot_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup_with_reserve(
  uuid, uuid[], uuid, uuid, uuid, uuid, jsonb, uuid, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup_with_reserve(
  uuid, uuid[], uuid, uuid, uuid, uuid, jsonb, uuid, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.save_fantasy_lineup_with_reserve(
  uuid, uuid[], uuid, uuid, uuid, uuid, jsonb, uuid, text
) IS 'Aceita todo perfil competitivo completo e garante patrimonio para o time valido mais barato.';

NOTIFY pgrst, 'reload schema';
COMMIT;
