-- A casa 40 deve continuar secreta até a pessoa concluir a trilha.
DROP POLICY IF EXISTS fantasy_pass_options_read ON public.fantasy_season_pass_reward_options;
CREATE POLICY fantasy_pass_options_read ON public.fantasy_season_pass_reward_options
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.fantasy_season_pass_rewards reward
    WHERE reward.id = fantasy_season_pass_reward_options.reward_id
      AND (
        reward.house < 40
        OR public.is_app_admin()
        OR EXISTS (
          SELECT 1 FROM public.fantasy_season_passes pass
          WHERE pass.fantasy_season_id = reward.fantasy_season_id
            AND pass.user_id = auth.uid()
            AND pass.progress >= 40
        )
      )
  )
);
NOTIFY pgrst, 'reload schema';
