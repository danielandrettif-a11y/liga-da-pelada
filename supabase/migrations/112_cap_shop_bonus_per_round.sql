-- Participações de atleta são partidas jogadas, não apenas semanas com presença.
-- Cada rodada pode liberar no máximo um ponto de loja: ao chegar a 5, concede
-- um ponto e mantém no máximo 4 participações como saldo para a próxima rodada.

DO $$
BEGIN
  IF to_regprocedure('public.recalculate_fantasy_season_pass_pre_participation_cycle_112(uuid)') IS NULL THEN
    ALTER FUNCTION public.recalculate_fantasy_season_pass(UUID)
      RENAME TO recalculate_fantasy_season_pass_pre_participation_cycle_112;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_fantasy_season_pass(p_fantasy_season_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recalculated BOOLEAN;
  profile_row RECORD;
  round_row RECORD;
  participation_total INTEGER;
  participation_remainder INTEGER;
  shop_bonus_total INTEGER;
  cycle_total INTEGER;
  lineup_total INTEGER;
  total_progress_total INTEGER;
BEGIN
  recalculated := public.recalculate_fantasy_season_pass_pre_participation_cycle_112(p_fantasy_season_id);
  IF NOT COALESCE(recalculated, false) THEN
    RETURN false;
  END IF;

  FOR profile_row IN
    SELECT account.user_id, account.player_id, player.member_category
    FROM public.account_profiles account
    JOIN public.players player ON player.id = account.player_id
  LOOP
    IF profile_row.member_category IN ('wag', 'supporter') THEN
      SELECT valid_lineups, total_progress_points
      INTO lineup_total, total_progress_total
      FROM public.fantasy_season_passes
      WHERE fantasy_season_id = p_fantasy_season_id
        AND user_id = profile_row.user_id;

      UPDATE public.fantasy_season_passes
      -- WAG e Torcida: toda escalação válida vale +1 ponto de loja.
      -- Ao completar a trilha, entram também os +5 pontos de conclusão.
      SET shop_bonus_points = COALESCE(lineup_total, 0)
            + CASE WHEN COALESCE(total_progress_total, 0) >= 40 THEN 5 ELSE 0 END,
          goals_assists_remainder = 0,
          updated_at = now()
      WHERE fantasy_season_id = p_fantasy_season_id
        AND user_id = profile_row.user_id;
      CONTINUE;
    END IF;

    participation_total := 0;
    participation_remainder := 0;
    shop_bonus_total := 0;

    FOR round_row IN
      SELECT COALESCE(stat.games, 0)::INTEGER AS games
      FROM public.fantasy_rounds fantasy_round
      JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
      LEFT JOIN public.player_round_stats stat
        ON stat.round_id = round_item.id AND stat.player_id = profile_row.player_id
      WHERE fantasy_round.fantasy_season_id = p_fantasy_season_id
        AND round_item.status = 'finished'
        AND round_item.round_type = 'official'
      ORDER BY round_item.date, round_item.number
    LOOP
      participation_total := participation_total + round_row.games;
      IF round_row.games <= 0 THEN
        CONTINUE;
      END IF;

      cycle_total := participation_remainder + round_row.games;
      IF cycle_total >= 5 THEN
        -- Nunca dois pontos na mesma rodada; o excedente fica pronto para a próxima.
        shop_bonus_total := shop_bonus_total + 1;
        participation_remainder := LEAST(cycle_total - 5, 4);
      ELSE
        participation_remainder := cycle_total;
      END IF;
    END LOOP;

    SELECT total_progress_points INTO total_progress_total
    FROM public.fantasy_season_passes
    WHERE fantasy_season_id = p_fantasy_season_id
      AND user_id = profile_row.user_id;

    UPDATE public.fantasy_season_passes
    SET participations = participation_total,
        shop_bonus_points = shop_bonus_total
          + CASE WHEN COALESCE(total_progress_total, 0) >= 40 THEN 5 ELSE 0 END,
        goals_assists_remainder = participation_remainder,
        updated_at = now()
    WHERE fantasy_season_id = p_fantasy_season_id
      AND user_id = profile_row.user_id;
  END LOOP;

  RETURN true;
END;
$$;

-- Recalcula o histórico: os pontos de loja e o saldo passam a refletir todas
-- as participações já registradas, com o limite de um bônus por rodada.
SELECT public.recalculate_fantasy_season_pass(id) FROM public.fantasy_seasons;

GRANT EXECUTE ON FUNCTION public.recalculate_fantasy_season_pass(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
