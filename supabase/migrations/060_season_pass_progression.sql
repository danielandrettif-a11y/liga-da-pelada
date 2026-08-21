-- Passe BQ V1: trilha de 40 casas calculada exclusivamente em rodadas Ranked.
-- Os marcos cosmeticos sao catalogo visual nesta versao; nao concedem nem equipam itens.

CREATE TABLE IF NOT EXISTS public.fantasy_season_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  progression_mode TEXT NOT NULL CHECK (progression_mode IN ('athlete', 'community')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 40),
  participations INTEGER NOT NULL DEFAULT 0,
  valid_lineups INTEGER NOT NULL DEFAULT 0,
  goals_assists_remainder INTEGER NOT NULL DEFAULT 0 CHECK (goals_assists_remainder BETWEEN 0 AND 4),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fantasy_season_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_season_pass_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'participation', 'valid_lineup', 'full_round', 'goals_assists_cycle',
    'participation_streak', 'lineup_streak'
  )),
  houses INTEGER NOT NULL CHECK (houses > 0 AND houses <= 40),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_season_pass_events_round_unique
  ON public.fantasy_season_pass_events (fantasy_season_id, user_id, source_round_id, event_type)
  WHERE source_round_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fantasy_season_pass_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  house INTEGER NOT NULL CHECK (house IN (1, 5, 10, 18, 25, 32, 40)),
  reward_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'development' CHECK (status = 'development'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fantasy_season_id, house)
);

INSERT INTO public.fantasy_season_pass_rewards (fantasy_season_id, house, reward_key)
SELECT fantasy_season.id, reward.house, reward.reward_key
FROM public.fantasy_seasons fantasy_season
CROSS JOIN (VALUES
  (1, 'cosmetic_badge_01'), (5, 'cosmetic_badge_05'), (10, 'cosmetic_badge_10'),
  (18, 'cosmetic_badge_18'), (25, 'cosmetic_badge_25'), (32, 'cosmetic_badge_32'),
  (40, 'cosmetic_badge_40')
) AS reward(house, reward_key)
ON CONFLICT (fantasy_season_id, house) DO NOTHING;

CREATE INDEX IF NOT EXISTS fantasy_season_passes_lookup_idx
  ON public.fantasy_season_passes (fantasy_season_id, user_id);
CREATE INDEX IF NOT EXISTS fantasy_season_pass_events_lookup_idx
  ON public.fantasy_season_pass_events (fantasy_season_id, user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.recalculate_fantasy_season_pass(p_fantasy_season_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row RECORD;
  round_row RECORD;
  mode_value TEXT;
  participation_total INTEGER;
  lineup_total INTEGER;
  goals_assists_total INTEGER;
  progress_total INTEGER;
  round_houses INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_seasons WHERE id = p_fantasy_season_id) THEN
    RETURN false;
  END IF;

  -- A recarga inteira e deterministica: reprocessamentos nunca duplicam casas.
  DELETE FROM public.fantasy_season_pass_events
  WHERE fantasy_season_id = p_fantasy_season_id;
  DELETE FROM public.fantasy_season_passes
  WHERE fantasy_season_id = p_fantasy_season_id;

  FOR profile_row IN
    SELECT account.user_id, account.player_id, player.member_category
    FROM public.account_profiles account
    JOIN public.players player ON player.id = account.player_id
  LOOP
    mode_value := CASE WHEN profile_row.member_category IN ('wag', 'supporter') THEN 'community' ELSE 'athlete' END;
    participation_total := 0;
    lineup_total := 0;
    goals_assists_total := 0;

    FOR round_row IN
      SELECT
        round_item.id AS round_id,
        round_item.number AS round_number,
        round_item.date AS round_date,
        COALESCE(stat.games, 0) AS games,
        COALESCE(stat.goals, 0) AS goals,
        COALESCE(stat.assists, 0) AS assists,
        EXISTS (
          SELECT 1
          FROM public.fantasy_lineups lineup
          WHERE lineup.fantasy_round_id = fantasy_round.id
            AND lineup.user_id = profile_row.user_id
            AND lineup.status IN ('locked', 'scored')
            AND (SELECT count(*) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id) = 5
        ) AS has_valid_lineup
      FROM public.fantasy_rounds fantasy_round
      JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
      LEFT JOIN public.player_round_stats stat
        ON stat.round_id = round_item.id AND stat.player_id = profile_row.player_id
      WHERE fantasy_round.fantasy_season_id = p_fantasy_season_id
        AND fantasy_round.market_status = 'finished'
        AND round_item.status = 'finished'
        AND round_item.round_type = 'official'
      ORDER BY round_item.date, round_item.number
    LOOP
      IF mode_value = 'athlete' THEN
        IF round_row.has_valid_lineup THEN
          lineup_total := lineup_total + 1;
          INSERT INTO public.fantasy_season_pass_events (
            fantasy_season_id, user_id, source_round_id, event_type, houses
          ) VALUES (p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'valid_lineup', 1);
        END IF;

        IF round_row.games > 0 THEN
          participation_total := participation_total + 1;
          INSERT INTO public.fantasy_season_pass_events (
            fantasy_season_id, user_id, source_round_id, event_type, houses, metadata
          ) VALUES (
            p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'participation', 2,
            jsonb_build_object('roundNumber', round_row.round_number, 'roundDate', round_row.round_date)
          );

          IF round_row.has_valid_lineup THEN
            INSERT INTO public.fantasy_season_pass_events (
              fantasy_season_id, user_id, source_round_id, event_type, houses
            ) VALUES (p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'full_round', 1);
          END IF;

          goals_assists_total := goals_assists_total + round_row.goals + round_row.assists;
          IF goals_assists_total >= 5 THEN
            -- No maximo uma casa por rodada; o excedente nao carrega para o proximo ciclo.
            INSERT INTO public.fantasy_season_pass_events (
              fantasy_season_id, user_id, source_round_id, event_type, houses, metadata
            ) VALUES (
              p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'goals_assists_cycle', 1,
              jsonb_build_object('goals', round_row.goals, 'assists', round_row.assists)
            );
            goals_assists_total := 0;
          END IF;

          IF participation_total = 9 THEN
            INSERT INTO public.fantasy_season_pass_events (
              fantasy_season_id, user_id, source_round_id, event_type, houses
            ) VALUES (p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'participation_streak', 4);
          END IF;
        END IF;
      ELSIF round_row.has_valid_lineup THEN
        lineup_total := lineup_total + 1;
        INSERT INTO public.fantasy_season_pass_events (
          fantasy_season_id, user_id, source_round_id, event_type, houses, metadata
        ) VALUES (
          p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'valid_lineup', 4,
          jsonb_build_object('roundNumber', round_row.round_number, 'roundDate', round_row.round_date)
        );
        IF lineup_total = 9 THEN
          INSERT INTO public.fantasy_season_pass_events (
            fantasy_season_id, user_id, source_round_id, event_type, houses
          ) VALUES (p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'lineup_streak', 4);
        END IF;
      END IF;
    END LOOP;

    SELECT COALESCE(sum(houses), 0)::INTEGER INTO progress_total
    FROM public.fantasy_season_pass_events
    WHERE fantasy_season_id = p_fantasy_season_id AND user_id = profile_row.user_id;

    INSERT INTO public.fantasy_season_passes (
      fantasy_season_id, user_id, progression_mode, progress, participations,
      valid_lineups, goals_assists_remainder, calculated_at, updated_at
    ) VALUES (
      p_fantasy_season_id, profile_row.user_id, mode_value, LEAST(progress_total, 40), participation_total,
      lineup_total, LEAST(goals_assists_total, 4), now(), now()
    );
  END LOOP;

  RETURN true;
END;
$$;

-- O processamento oficial do Cartola atualiza a trilha assim que termina.
DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_pass(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round(UUID) RENAME TO process_fantasy_round_pre_pass;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE pass_season_id UUID;
BEGIN
  PERFORM public.process_fantasy_round_pre_pass(p_round_id);
  SELECT fantasy_season_id INTO pass_season_id FROM public.fantasy_rounds WHERE round_id = p_round_id;
  IF pass_season_id IS NOT NULL THEN
    PERFORM public.recalculate_fantasy_season_pass(pass_season_id);
  END IF;
  RETURN true;
END;
$$;

-- Tambem recalcula ao remover uma rodada do Cartola/rodada base.
CREATE OR REPLACE FUNCTION public.refresh_fantasy_season_pass_after_round_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_fantasy_season_pass(OLD.fantasy_season_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS fantasy_season_pass_after_round_delete ON public.fantasy_rounds;
CREATE TRIGGER fantasy_season_pass_after_round_delete
AFTER DELETE ON public.fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION public.refresh_fantasy_season_pass_after_round_delete();

ALTER TABLE public.fantasy_season_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_season_pass_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_season_pass_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY fantasy_season_passes_read ON public.fantasy_season_passes
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_app_admin());
CREATE POLICY fantasy_season_pass_events_read ON public.fantasy_season_pass_events
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_app_admin());
CREATE POLICY fantasy_season_pass_rewards_read ON public.fantasy_season_pass_rewards
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.fantasy_season_passes, public.fantasy_season_pass_events,
  public.fantasy_season_pass_rewards TO authenticated;
REVOKE ALL ON FUNCTION public.recalculate_fantasy_season_pass(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_pass(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID) TO authenticated;

-- Inicializa a trilha para a temporada atual sem tocar em resultados ou precos existentes.
SELECT public.recalculate_fantasy_season_pass(id) FROM public.fantasy_seasons;

NOTIFY pgrst, 'reload schema';
