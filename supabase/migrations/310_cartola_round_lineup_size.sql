-- O Cartola usa o tamanho congelado na rodada. Alterar a quantidade física
-- depois da primeira escalação salva não invalida o time de ninguém.
BEGIN;

CREATE OR REPLACE FUNCTION public.fantasy_lineup_size(p_round_id uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(
    (fantasy_round.settings_snapshot->>'players_per_team')::integer,
    round_item.target_players_per_team,
    league.players_per_team,
    5
  )
  FROM public.rounds round_item
  JOIN public.leagues league ON league.id = round_item.league_id
  LEFT JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
  WHERE round_item.id = p_round_id;
$$;
REVOKE ALL ON FUNCTION public.fantasy_lineup_size(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fantasy_lineup_size(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.snapshot_fantasy_round_size()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target_size integer;
BEGIN
  SELECT COALESCE(round_item.target_players_per_team, league.players_per_team, 5)
  INTO target_size
  FROM public.rounds round_item
  JOIN public.leagues league ON league.id = round_item.league_id
  WHERE round_item.id = NEW.round_id;
  NEW.settings_snapshot := COALESCE(NEW.settings_snapshot, '{}'::jsonb)
    || jsonb_build_object('players_per_team', target_size);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fantasy_rounds_snapshot_size ON public.fantasy_rounds;
CREATE TRIGGER fantasy_rounds_snapshot_size BEFORE INSERT ON public.fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION public.snapshot_fantasy_round_size();

UPDATE public.fantasy_rounds fantasy_round
SET settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::jsonb)
  || jsonb_build_object('players_per_team',
    COALESCE(round_item.target_players_per_team, league.players_per_team, 5))
FROM public.rounds round_item
JOIN public.leagues league ON league.id = round_item.league_id
WHERE fantasy_round.round_id = round_item.id
  AND fantasy_round.market_status = 'open'
  AND NOT (fantasy_round.settings_snapshot ? 'players_per_team')
  AND NOT EXISTS (SELECT 1 FROM public.fantasy_lineups lineup
    WHERE lineup.fantasy_round_id = fantasy_round.id);

-- Escalações já salvas prevalecem sobre qualquer mudança posterior da
-- capacidade física da convocação. Esta compatibilidade cobre rodadas antigas
-- que ainda não traziam a chave players_per_team no snapshot.
UPDATE public.fantasy_rounds fantasy_round
SET settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::jsonb)
  || jsonb_build_object('players_per_team', COALESCE(
    (SELECT count(*)::integer
     FROM public.fantasy_lineups lineup
     JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
     WHERE lineup.fantasy_round_id = fantasy_round.id
     GROUP BY lineup.id
     ORDER BY count(*) DESC LIMIT 1),
    round_item.target_players_per_team, league.players_per_team, 5))
FROM public.rounds round_item
JOIN public.leagues league ON league.id = round_item.league_id
WHERE fantasy_round.round_id = round_item.id
  AND fantasy_round.market_status = 'open'
  AND NOT (COALESCE(fantasy_round.settings_snapshot, '{}'::jsonb) ? 'players_per_team')
  AND EXISTS (SELECT 1 FROM public.fantasy_lineups lineup
    WHERE lineup.fantasy_round_id = fantasy_round.id);

CREATE OR REPLACE FUNCTION public.is_valid_fantasy_formation_v11(p_slots jsonb, p_team_size integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH roles AS (
    SELECT COALESCE(item->>'slot_role', item->>'slotRole') role
    FROM jsonb_array_elements(COALESCE(p_slots, '[]'::jsonb)) item
  ), counts AS (
    SELECT count(*) total,
      count(*) FILTER (WHERE role = 'GOL') gol,
      count(*) FILTER (WHERE role = 'DEF') def,
      count(*) FILTER (WHERE role = 'ATA') ata,
      count(*) FILTER (WHERE role IS NULL OR role NOT IN ('GOL','DEF','ATA')) invalid
    FROM roles
  )
  SELECT total = p_team_size AND gol = 1 AND invalid = 0 AND
    CASE p_team_size
      WHEN 5 THEN def = 2 AND ata = 2
      WHEN 6 THEN (def = 3 AND ata = 2) OR (def = 2 AND ata = 3)
      WHEN 7 THEN def = 3 AND ata = 3
      ELSE false
    END
  FROM counts;
$$;

-- As rotinas legadas são camadas do mesmo fluxo. Substituímos somente a
-- origem do tamanho; cartões, orçamento, preços e histórico permanecem
-- exatamente com as regras já instaladas. O assert impede migração parcial
-- se uma função legada não for a versão esperada.
DO $$
DECLARE function_id regprocedure; original_sql text; patched_sql text;
BEGIN
  FOREACH function_id IN ARRAY ARRAY[
    'public.save_fantasy_lineup_legacy(uuid,uuid[],uuid,uuid,uuid,uuid)'::regprocedure,
    'public.save_fantasy_lineup(uuid,uuid[],uuid,uuid,uuid,uuid)'::regprocedure,
    'public.save_fantasy_test_lineup_pre_official_market_072(uuid,uuid[],uuid,uuid,uuid,uuid)'::regprocedure,
    'public.lock_fantasy_market_pre_card_lifecycle_093(uuid)'::regprocedure
  ] LOOP
    original_sql := pg_get_functiondef(function_id::oid);
    patched_sql := replace(original_sql,
      'COALESCE(league.players_per_team, 5)',
      'public.fantasy_lineup_size(p_round_id)');
    IF patched_sql = original_sql THEN
      RAISE EXCEPTION 'Assinatura do tamanho nao encontrada em %. Revise antes de continuar.', function_id;
    END IF;
    EXECUTE patched_sql;
  END LOOP;

  FOREACH function_id IN ARRAY ARRAY[
    'public.save_fantasy_lineup(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)'::regprocedure,
    'public.save_fantasy_test_lineup(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)'::regprocedure
  ] LOOP
    original_sql := pg_get_functiondef(function_id::oid);
    patched_sql := replace(original_sql,
      'SELECT players_per_team INTO team_size FROM public.leagues WHERE id = target_league_id;',
      'SELECT public.fantasy_lineup_size(p_round_id) INTO team_size;');
    IF patched_sql = original_sql THEN
      RAISE EXCEPTION 'Validacao de formacao nao encontrada em %. Revise antes de continuar.', function_id;
    END IF;
    EXECUTE patched_sql;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
