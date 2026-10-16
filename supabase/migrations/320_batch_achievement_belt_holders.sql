-- Disponibiliza todos os detentores de cinturão da pelada em uma única leitura.
-- Evita uma chamada ao banco para cada jogador exibido no ranking.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_league_achievement_belt_holders(
  p_league_id UUID
)
RETURNS TABLE(player_id UUID, belts JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH belt_rows AS MATERIALIZED (
    SELECT
      member.player_id,
      public.get_player_achievement_belts(member.player_id, p_league_id) AS belts
    FROM public.league_members member
    WHERE member.league_id = p_league_id
      AND member.is_active = true
  )
  SELECT row_item.player_id, row_item.belts
  FROM belt_rows row_item
  WHERE jsonb_array_length(COALESCE(row_item.belts, '[]'::jsonb)) > 0
  ORDER BY row_item.player_id;
$$;

REVOKE ALL ON FUNCTION public.get_league_achievement_belt_holders(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_league_achievement_belt_holders(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
